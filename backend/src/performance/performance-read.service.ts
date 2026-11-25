import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common'
import { PrismaService } from '../common/prisma.service'
import { AuthenticatedUser } from '../common/auth-user.interface'
import { rankLeaderboard, kpiTrendSeries } from './kpi-engine'
import { LeaderboardUser } from './kpi-engine/types'
import { Prisma } from '@prisma/client'
import * as crypto from 'crypto'

export interface LedgerQueryDto {
  metricType?: 'KPI' | 'XP'
  startDate?: string
  endDate?: string
  taskId?: string
  isBackfilled?: boolean
  limit?: number
  cursor?: string
  format?: 'json' | 'csv'
}

export interface PublicLeaderboardEntry {
  rank: number
  userId: string
  name: string
  role: string
  squad: string
  kpiScore: number | null
  isInactive: boolean
  isProvisional: boolean
  lifetimeXp: number
}

@Injectable()
export class PerformanceReadService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Scope verification: validates whether actor has authority to inspect target employee's performance data.
   */
  async assertScopeAccess(actor: AuthenticatedUser, targetUserId: string) {
    if (actor.id === targetUserId) return true

    const role = (actor.role || '').toLowerCase()
    if (role === 'ceo' || role === 'chro') return true

    if (['cto', 'cpo', 'cfo'].includes(role)) {
      return true
    }

    if (role === 'pm') {
      // Check if target is in any of PM's squads
      const pmSquads = await this.prisma.teamMembership.findMany({
        where: { employeeId: actor.id, isActive: true },
        select: { teamId: true },
      })
      const squadIds = pmSquads.map((s) => s.teamId)

      const targetMembership = await this.prisma.teamMembership.findFirst({
        where: {
          employeeId: targetUserId,
          teamId: { in: squadIds },
          isActive: true,
        },
      })

      if (targetMembership) return true
    }

    throw new ForbiddenException(
      `Permission denied: You do not have authority to view performance data for employee "${targetUserId}"`,
    )
  }

  /**
   * Paginated ledger read with filters and cursor pagination.
   */
  async getLedger(targetUserId: string, actor: AuthenticatedUser, query: LedgerQueryDto) {
    await this.assertScopeAccess(actor, targetUserId)

    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20))
    const where: Prisma.KpiXpAuditLogWhereInput = {
      employeeId: targetUserId,
    }

    if (query.metricType) where.metricType = query.metricType
    if (query.taskId) where.taskId = query.taskId
    if (query.isBackfilled !== undefined) where.isBackfilled = query.isBackfilled

    if (query.startDate || query.endDate) {
      where.recordedAt = {}
      if (query.startDate) where.recordedAt.gte = new Date(query.startDate)
      if (query.endDate) where.recordedAt.lte = new Date(query.endDate)
    }

    const items = await this.prisma.kpiXpAuditLog.findMany({
      where,
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      orderBy: { sequence: 'desc' },
      include: {
        annotations: {
          include: {
            author: {
              select: { id: true, name: true, title: true },
            },
          },
        },
      },
    })

    let nextCursor: string | null = null
    if (items.length > limit) {
      const nextItem = items.pop()
      nextCursor = nextItem?.id || null
    }

    return {
      items: items.map((i) => ({
        id: i.id,
        sequence: i.sequence,
        metricType: i.metricType,
        deltaValue: Number(i.deltaValue),
        valueBefore: i.valueBefore ? Number(i.valueBefore) : null,
        valueAfter: i.valueAfter ? Number(i.valueAfter) : null,
        actionType: i.actionType,
        triggerEvent: i.triggerEvent,
        reason: i.reason,
        authorizedById: i.authorizedById,
        authorizedRole: i.authorizedRole,
        effectiveAt: i.effectiveAt,
        recordedAt: i.recordedAt,
        isBackfilled: i.isBackfilled,
        annotations: i.annotations.map((a) => ({
          id: a.id,
          note: a.note,
          authorName: a.author.name,
          createdAt: a.createdAt,
        })),
      })),
      nextCursor,
    }
  }

  /**
   * Scoped and audited CSV/JSON export.
   */
  async exportLedger(targetUserId: string, actor: AuthenticatedUser, query: LedgerQueryDto) {
    await this.assertScopeAccess(actor, targetUserId)

    const raw = await this.prisma.kpiXpAuditLog.findMany({
      where: { employeeId: targetUserId },
      orderBy: { sequence: 'asc' },
    })

    // Audit log the export event
    await this.appendExportAudit(actor, targetUserId, raw.length)

    if (query.format === 'csv') {
      const header = 'Sequence,MetricType,Delta,Before,After,Action,Reason,AuthorizedRole,RecordedAt\n'
      const rows = raw
        .map(
          (r) =>
            `${r.sequence},${r.metricType},${r.deltaValue},${r.valueBefore ?? ''},${r.valueAfter ?? ''},${r.actionType},"${(r.reason || '').replace(/"/g, '""')}",${r.authorizedRole},${r.recordedAt.toISOString()}`,
        )
        .join('\n')
      return { format: 'csv', data: header + rows }
    }

    return {
      format: 'json',
      data: raw.map((r) => ({
        sequence: r.sequence,
        metricType: r.metricType,
        delta: Number(r.deltaValue),
        valueBefore: r.valueBefore ? Number(r.valueBefore) : null,
        valueAfter: r.valueAfter ? Number(r.valueAfter) : null,
        action: r.actionType,
        reason: r.reason,
        authorizedRole: r.authorizedRole,
        recordedAt: r.recordedAt,
      })),
    }
  }

  /**
   * KPI historical trend series with NA flags and provisional indicators.
   */
  async getKpiSeries(targetUserId: string, actor: AuthenticatedUser) {
    await this.assertScopeAccess(actor, targetUserId)

    const weeks = await this.prisma.weeklyKpiRecord.findMany({
      where: { employeeId: targetUserId },
      orderBy: [{ year: 'asc' }, { weekNumber: 'asc' }],
    })

    return kpiTrendSeries(
      weeks.map((w) => ({
        weekNumber: w.weekNumber,
        year: w.year,
        score: w.score ? Number(w.score) : null,
        isInactive: w.isInactive,
        isProvisional: w.evaluationStatus === 'PROVISIONAL',
        pmScore: w.pmScore ? Number(w.pmScore) : null,
        ctoScore: w.ctoScore ? Number(w.ctoScore) : null,
        cpoScore: w.cpoScore ? Number(w.cpoScore) : null,
        cfoScore: w.cfoScore ? Number(w.cfoScore) : null,
        chroScore: w.chroScore ? Number(w.chroScore) : null,
        inactivityPenaltyApplied: w.inactivityPenaltyApplied,
        breakdown: (w.evaluationBreakdown as any) || undefined,
      })),
    )
  }

  /**
   * Returns current XP balance projection and category composition.
   */
  async getXpSummary(targetUserId: string, actor: AuthenticatedUser) {
    await this.assertScopeAccess(actor, targetUserId)

    const emp = await this.prisma.employee.findUnique({
      where: { id: targetUserId },
      select: { id: true, lifetimeXp: true },
    })
    if (!emp) throw new NotFoundException(`Employee "${targetUserId}" not found`)

    const balance = await this.prisma.xpBalance.findUnique({
      where: { userId: targetUserId },
    })

    return {
      userId: targetUserId,
      lifetimeXp: emp.lifetimeXp,
      postedXp: balance?.postedXp ?? emp.lifetimeXp,
      pendingXp: balance?.pendingXp ?? 0,
      frozenXp: balance?.frozenXp ?? 0,
      byCategory: (balance?.byCategoryJson as Record<string, number>) || {},
    }
  }

  async getLeaderboardProfile(userId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: userId, isSuspended: false },
      select: {
        id: true, name: true, title: true,
        weeklyKpiRecords: {
          orderBy: [{ year: 'asc' }, { weekNumber: 'asc' }],
          select: {
            year: true, weekNumber: true, score: true, isInactive: true,
            evaluationStatus: true,
            ctoScore: true, cpoScore: true, cfoScore: true, chroScore: true,
            execEvaluations: {
              select: { evaluatorRole: true, score: true, status: true },
            },
          },
        },
      },
    })
    if (!employee) throw new NotFoundException('Employee not found')

    const tasks = await this.prisma.task.findMany({
      where: { assigneeId: userId, status: { in: ['completed', 'COMPLETED'] } },
      orderBy: [{ completedAt: 'desc' }, { id: 'asc' }],
      select: {
        id: true, title: true, completedAt: true, pmScore: true,
        execScores: {
          select: { execRole: true, score: true, status: true },
        },
      },
    })

    // Public performance facts only; private ledgers and review notes stay scoped.
    return {
      userId: employee.id,
      name: employee.name,
      role: employee.title || 'Engineer',
      kpiSeries: employee.weeklyKpiRecords.map((w) => ({
        year: w.year,
        weekNumber: w.weekNumber,
        score: w.score === null ? null : Number(w.score),
        isInactive: w.isInactive,
        isProvisional: w.evaluationStatus === 'PROVISIONAL',
        evaluations: w.execEvaluations.length > 0
          ? w.execEvaluations.map((e) => ({
              role: e.evaluatorRole, score: Number(e.score), status: e.status,
            }))
          : Object.entries({ CTO: w.ctoScore, CPO: w.cpoScore, CFO: w.cfoScore, CHRO: w.chroScore })
              .filter(([, score]) => score != null)
              .map(([role, score]) => ({ role, score: Number(score), status: w.evaluationStatus })),
      })),
      tasks: tasks.map((t) => ({
        id: t.id, title: t.title, completedAt: t.completedAt,
        pmScore: t.pmScore === null ? null : Number(t.pmScore),
        evaluations: t.execScores.map((e) => ({
          role: e.execRole, score: Number(e.score), status: e.status,
        })),
      })),
    }
  }

  /**
   * Public Leaderboard: open to all authenticated users with zero private/sensitive fields exposed.
   */
  async getLeaderboard(
    period: 'latest_week' | 'four_week_avg' | 'lifetime_xp' = 'lifetime_xp',
    roleFilter?: string,
    squadFilter?: string,
  ): Promise<PublicLeaderboardEntry[]> {
    const employees = await this.prisma.employee.findMany({
      where: {
        isSuspended: false,
      },
      include: {
        employeeRoles: { where: { isActive: true }, include: { role: true } },
        xpBalance: true,
        weeklyKpiRecords: {
          orderBy: [{ year: 'desc' }, { weekNumber: 'desc' }],
          take: 4,
        },
        teamMemberships: {
          where: { isActive: true },
          include: { team: true },
        },
      },
    })

    const leaderboardUsers: LeaderboardUser[] = []
    const metaByUserId = new Map<string, { squad: string; isInactive: boolean; isProvisional: boolean }>()

    for (const emp of employees) {
      const squadName = emp.teamMemberships?.[0]?.team?.name || 'General'
      const roleName = emp.title || 'Engineer'

      if (roleFilter && !roleName.toLowerCase().includes(roleFilter.toLowerCase()) &&
          !emp.employeeRoles?.some(({ role }) => role.slug.toLowerCase() === roleFilter.toLowerCase())) {
        continue
      }
      if (squadFilter && !squadName.toLowerCase().includes(squadFilter.toLowerCase())) {
        continue
      }

      let kpiScore: number | null = null
      let isInactive = false
      let isProvisional = false

      if (period === 'latest_week') {
        const latest = emp.weeklyKpiRecords[0]
        if (latest) {
          kpiScore = latest.score ? Number(latest.score) : null
          isInactive = latest.isInactive
          isProvisional = latest.evaluationStatus === 'PROVISIONAL'
        } else {
          isInactive = true
        }
      } else if (period === 'four_week_avg') {
        const valid = emp.weeklyKpiRecords.filter((w) => !w.isInactive && w.score !== null)
        if (valid.length > 0) {
          const sum = valid.reduce((acc, curr) => acc + Number(curr.score), 0)
          kpiScore = Math.round((sum / valid.length) * 100) / 100
        } else {
          isInactive = true
        }
      } else {
        // lifetime_xp: kpiScore can default to latest week score for tie-breaking
        const latest = emp.weeklyKpiRecords[0]
        if (latest && !latest.isInactive && latest.score !== null) {
          kpiScore = Number(latest.score)
        }
      }

      metaByUserId.set(emp.id, { squad: squadName, isInactive, isProvisional })
      leaderboardUsers.push({
        userId: emp.id,
        name: emp.name,
        role: roleName,
        squadId: squadName,
        lifetimeXp: emp.xpBalance?.postedXp ?? emp.lifetimeXp,
        kpiScore,
        joinedAt: emp.createdAt,
      })
    }

    const sortBy = period === 'latest_week' || period === 'four_week_avg' ? 'KPI' : 'XP'
    const ranked = rankLeaderboard(leaderboardUsers, sortBy)

    // Strip private and sensitive internal fields (minimal public DTO)
    return ranked.map((r) => {
      const meta = metaByUserId.get(r.userId)
      return {
        rank: r.rank,
        userId: r.userId,
        name: r.name,
        role: r.role || 'Engineer',
        squad: meta?.squad || 'General',
        kpiScore: r.kpiScore,
        isInactive: meta?.isInactive || false,
        isProvisional: meta?.isProvisional || false,
        lifetimeXp: r.lifetimeXp,
      }
    })
  }

  private async appendExportAudit(actor: AuthenticatedUser, targetUserId: string, rowCount: number) {
    const last = await this.prisma.kpiXpAuditLog.findFirst({
      orderBy: { sequence: 'desc' },
      select: { sequence: true, entryHash: true },
    })

    const seq = (last?.sequence || 0) + 1
    const prev = last?.entryHash || '00000000000000000000000000000000'
    const payload = `${seq}|${prev}|${actor.id}|KPI|0|LEDGER_EXPORT|${Date.now()}`
    const entryHash = crypto.createHash('sha256').update(payload).digest('hex')

    await this.prisma.kpiXpAuditLog.create({
      data: {
        sequence: seq,
        prevHash: prev,
        entryHash,
        employeeId: targetUserId,
        metricType: 'KPI',
        deltaValue: new Prisma.Decimal(0),
        actionType: 'LEDGER_EXPORT',
        triggerEvent: `Exported ${rowCount} records`,
        reason: `Performance ledger data exported by ${actor.name || actor.id}`,
        authorizedById: actor.id,
        authorizedRole: (actor.role || 'USER').toUpperCase(),
        recordedAt: new Date(),
      },
    })
  }
}
