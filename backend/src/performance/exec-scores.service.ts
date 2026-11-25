import { isProjectManager } from '../common/employee-role.util'
import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common'
import { PrismaService } from '../common/prisma.service'
import { AuthenticatedUser } from '../common/auth-user.interface'
import { ExecRole, Prisma } from '@prisma/client'
import { taskScoreDeveloper, weeklyKpiDeveloper } from './kpi-engine'
import { getDhakaWeekBoundaries } from '../common/dhaka-time.util'
import * as crypto from 'crypto'

@Injectable()
export class ExecScoresService {
  private readonly logger = new Logger(ExecScoresService.name)

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Maps an authenticated user's role to the matching ExecRole enum.
   */
  private getActorExecRole(actor: AuthenticatedUser): ExecRole | 'CEO' | 'OTHER' {
    const role = (actor.role || '').toUpperCase().trim()
    if (role === 'CTO') return 'CTO'
    if (role === 'CPO') return 'CPO'
    if (role === 'CFO') return 'CFO'
    if (role === 'CHRO') return 'CHRO'
    if (role === 'CEO' || role === 'SYSTEM:ROOT' || role === 'ADMIN') return 'CEO'
    return 'OTHER'
  }

  /**
   * Retrieves all UNREAD task executive review scores for the calling executive,
   * sorted oldest first. Includes task details, PM score, and provisional impact.
   */
  async getInbox(actor: AuthenticatedUser) {
    const execRole = this.getActorExecRole(actor)

    if (execRole === 'OTHER') {
      throw new ForbiddenException('Only C-Level executives (CTO, CPO, CFO, CHRO, CEO) have an executive review inbox')
    }

    const whereClause: Prisma.TaskExecScoreWhereInput = {
      status: 'UNREAD',
    }

    // CEO sees all unread executive scores; specific C-Levels see only their role's scores
    if (execRole !== 'CEO') {
      whereClause.execRole = execRole as ExecRole
    }

    const scores = await this.prisma.taskExecScore.findMany({
      where: whereClause,
      orderBy: { createdAt: 'asc' },
      include: {
        task: {
          include: {
            assignee: { select: { id: true, name: true, title: true } },
            project: { select: { id: true, name: true } },
          },
        },
      },
    })

    return scores.map((s) => ({
      id: s.id,
      taskId: s.taskId,
      taskTitle: s.task.title,
      assigneeId: s.task.assigneeId,
      assigneeName: s.task.assignee.name,
      execRole: s.execRole,
      status: s.status,
      pmScore: Number(s.task.pmScore || 0),
      currentProvisionalScore: Number(s.score),
      createdAt: s.createdAt,
    }))
  }

  /**
   * Confirms an executive score without modification (status -> CONFIRMED).
   * Idempotent: confirming an already CONFIRMED score returns 200 without second ledger write.
   */
  async confirmScore(scoreId: string, actor: AuthenticatedUser) {
    const record = await this.prisma.taskExecScore.findUnique({
      where: { id: scoreId },
      include: { task: true },
    })

    if (!record) {
      throw new NotFoundException(`TaskExecScore "${scoreId}" not found`)
    }

    const actorRole = this.getActorExecRole(actor)
    if (actorRole !== 'CEO' && actorRole !== record.execRole) {
      throw new ForbiddenException(
        `Role mismatch: ${actorRole} cannot act on a ${record.execRole} review row. Only ${record.execRole} or CEO may act.`,
      )
    }

    // Idempotency: return existing confirmed status without creating duplicate audit
    if (record.status === 'CONFIRMED') {
      return {
        id: record.id,
        status: 'CONFIRMED',
        score: Number(record.score),
        idempotent: true,
        message: 'Review was already confirmed previously',
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.taskExecScore.update({
        where: { id: scoreId },
        data: {
          status: 'CONFIRMED',
          actedById: actor.id,
          actedAt: new Date(),
        },
      })

      // Record KPI audit log
      await this.appendKpiAudit(tx, {
        employeeId: record.task.assigneeId,
        actionType: 'EXEC_CONFIRMED',
        metricType: 'KPI',
        valueBefore: record.score,
        valueAfter: record.score,
        reason: `${record.execRole} confirmed deliverable score ${record.score} for task ${record.taskId}`,
        actorId: actor.id,
        authorizedRole: (actor.role || record.execRole || 'SYSTEM').toUpperCase(),
      })

      // Recompute developer task score & weekly KPI
      await this.recalculateWeeklyKpiForTask(tx, record.taskId)

      return {
        id: updated.id,
        status: updated.status,
        score: Number(updated.score),
        actedById: updated.actedById,
        actedAt: updated.actedAt,
      }
    })
  }

  /**
   * Adjusts an executive score (status -> ADJUSTED) with mandatory new score and written reason.
   */
  async adjustScore(
    scoreId: string,
    newScore: number,
    reason: string,
    actor: AuthenticatedUser,
  ) {
    if (newScore === undefined || newScore === null || isNaN(newScore) || newScore < 0 || newScore > 100) {
      throw new BadRequestException(`Invalid score: ${newScore}. Score must be between 0 and 100.`)
    }

    if (!reason || reason.trim().length < 5) {
      throw new BadRequestException('A documented reason (minimum 5 characters) is required when adjusting an executive review score.')
    }

    const record = await this.prisma.taskExecScore.findUnique({
      where: { id: scoreId },
      include: { task: true },
    })

    if (!record) {
      throw new NotFoundException(`TaskExecScore "${scoreId}" not found`)
    }

    const actorRole = this.getActorExecRole(actor)
    if (actorRole !== 'CEO' && actorRole !== record.execRole) {
      throw new ForbiddenException(
        `Role mismatch: ${actorRole} cannot adjust a ${record.execRole} review row. Only ${record.execRole} or CEO may act.`,
      )
    }

    return this.prisma.$transaction(async (tx) => {
      const valueBefore = record.score
      const valueAfter = new Prisma.Decimal(newScore)

      const updated = await tx.taskExecScore.update({
        where: { id: scoreId },
        data: {
          score: valueAfter,
          status: 'ADJUSTED',
          reason: reason.trim(),
          actedById: actor.id,
          actedAt: new Date(),
        },
      })

      // Record KPI audit log with hash chaining
      await this.appendKpiAudit(tx, {
        employeeId: record.task.assigneeId,
        actionType: 'EXEC_ADJUSTED',
        metricType: 'KPI',
        valueBefore,
        valueAfter,
        reason: `${record.execRole} adjusted score from ${valueBefore} to ${newScore} on task ${record.taskId}: ${reason.trim()}`,
        actorId: actor.id,
        authorizedRole: (actor.role || record.execRole || 'SYSTEM').toUpperCase(),
      })

      // Recompute developer task score & weekly KPI
      await this.recalculateWeeklyKpiForTask(tx, record.taskId)

      return {
        id: updated.id,
        status: updated.status,
        score: Number(updated.score),
        previousScore: Number(valueBefore),
        reason: updated.reason,
        actedById: updated.actedById,
        actedAt: updated.actedAt,
      }
    })
  }

  /**
   * Recalculates the developer's composite score for this task and updates the weekly KPI record.
   * Flips evaluationStatus from PROVISIONAL to OFFICIAL when all 4 executive reviews are acted upon.
   */
  async recalculateWeeklyKpiForTask(tx: Prisma.TransactionClient, taskId: string) {
    const task = await tx.task.findUnique({
      where: { id: taskId },
      include: { execScores: true, assignee: { include: { employeeRoles: { where: { isActive: true }, include: { role: true } } } } },
    })

    if (!task || isProjectManager(task.assignee)) return

    const pmScore = Number(task.pmScore || 85)
    const ctoScoreRecord = task.execScores.find((s) => s.execRole === 'CTO')
    const cpoScoreRecord = task.execScores.find((s) => s.execRole === 'CPO')
    const cfoScoreRecord = task.execScores.find((s) => s.execRole === 'CFO')
    const chroScoreRecord = task.execScores.find((s) => s.execRole === 'CHRO')

    const taskEval = taskScoreDeveloper({
      pm: { score: pmScore },
      cto: ctoScoreRecord ? { score: Number(ctoScoreRecord.score), status: ctoScoreRecord.status } : undefined,
      cpo: cpoScoreRecord ? { score: Number(cpoScoreRecord.score), status: cpoScoreRecord.status } : undefined,
      cfo: cfoScoreRecord ? { score: Number(cfoScoreRecord.score), status: cfoScoreRecord.status } : undefined,
      chro: chroScoreRecord ? { score: Number(chroScoreRecord.score), status: chroScoreRecord.status } : undefined,
    })

    // Determine week boundaries using Dhaka time
    const completedDate = task.completedAt || task.recordedAt || new Date()
    const { year, weekNumber, weekStartUtc: weekStart, weekEndUtc: weekEnd } = getDhakaWeekBoundaries(completedDate)

    // Fetch all completed tasks for this developer in this week
    const weekTasks = await tx.task.findMany({
      where: {
        assigneeId: task.assigneeId,
        status: 'completed',
        completedAt: { gte: weekStart, lte: weekEnd },
      },
      include: { execScores: true },
    })

    if (weekTasks.length === 0) return

    let anyTaskProvisional = false
    const developerTasksInput = weekTasks.map((t) => {
      const pm = Number(t.pmScore || 85)
      const cto = t.execScores.find((s) => s.execRole === 'CTO')
      const cpo = t.execScores.find((s) => s.execRole === 'CPO')
      const cfo = t.execScores.find((s) => s.execRole === 'CFO')
      const chro = t.execScores.find((s) => s.execRole === 'CHRO')

      const scoreResult = taskScoreDeveloper({
        pm: { score: pm },
        cto: cto ? { score: Number(cto.score), status: cto.status } : undefined,
        cpo: cpo ? { score: Number(cpo.score), status: cpo.status } : undefined,
        cfo: cfo ? { score: Number(cfo.score), status: cfo.status } : undefined,
        chro: chro ? { score: Number(chro.score), status: chro.status } : undefined,
      })

      if (scoreResult.isProvisional) {
        anyTaskProvisional = true
      }

      return {
        score: scoreResult.finalScore,
        weightPoints: Number(t.weightPoints || 2),
        context: (t.origin || 'MAIN_SQUAD') as any,
      }
    })

    const weeklyKpi = weeklyKpiDeveloper({ tasks: developerTasksInput })

    const evaluationStatus = anyTaskProvisional ? 'PROVISIONAL' : 'CONFIRMED'

    await tx.weeklyKpiRecord.upsert({
      where: {
        employeeId_year_weekNumber: {
          employeeId: task.assigneeId,
          year,
          weekNumber,
        },
      },
      create: {
        employeeId: task.assigneeId,
        year,
        weekNumber,
        weekStart,
        score: weeklyKpi.value !== null ? new Prisma.Decimal(weeklyKpi.value) : null,
        isInactive: weeklyKpi.status === 'NA',
        evaluationStatus: evaluationStatus as any,
        evaluationBreakdown: {
          taskCount: weeklyKpi.taskCount,
          totalWeight: weeklyKpi.totalWeight,
          isProvisional: anyTaskProvisional,
        },
      },
      update: {
        score: weeklyKpi.value !== null ? new Prisma.Decimal(weeklyKpi.value) : null,
        isInactive: weeklyKpi.status === 'NA',
        evaluationStatus: evaluationStatus as any,
        evaluationBreakdown: {
          taskCount: weeklyKpi.taskCount,
          totalWeight: weeklyKpi.totalWeight,
          isProvisional: anyTaskProvisional,
        },
      },
    })
  }

  /**
   * Appends an immutable row to kpi_xp_audit_logs with cryptographic hash chaining.
   */
  private async appendKpiAudit(
    tx: Prisma.TransactionClient,
    data: {
      employeeId: string
      actionType: string
      metricType: string
      valueBefore?: Prisma.Decimal | null
      valueAfter?: Prisma.Decimal | null
      reason: string
      actorId: string
      authorizedRole?: string
    },
  ) {
    const lastEntry = await tx.kpiXpAuditLog.findFirst({
      orderBy: { sequence: 'desc' },
      select: { sequence: true, entryHash: true },
    })

    const sequence = (lastEntry?.sequence || 0) + 1
    const prevHash = lastEntry?.entryHash || '00000000000000000000000000000000'
    const delta = data.valueAfter && data.valueBefore
      ? data.valueAfter.minus(data.valueBefore)
      : (data.valueAfter || new Prisma.Decimal(0))
    const payload = `${sequence}|${prevHash}|${data.employeeId}|${data.metricType}|${delta}|${data.actionType}|${Date.now()}`
    const entryHash = crypto.createHash('sha256').update(payload).digest('hex')

    await tx.kpiXpAuditLog.create({
      data: {
        sequence,
        prevHash,
        entryHash,
        employeeId: data.employeeId,
        metricType: data.metricType,
        deltaValue: delta,
        valueBefore: data.valueBefore,
        valueAfter: data.valueAfter,
        actionType: data.actionType,
        triggerEvent: data.reason,
        reason: data.reason,
        authorizedById: data.actorId,
        authorizedRole: data.authorizedRole || 'SYSTEM',
        recordedAt: new Date(),
      },
    })
  }
}
