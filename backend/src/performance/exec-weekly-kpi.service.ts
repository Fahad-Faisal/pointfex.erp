import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common'
import { PrismaService } from '../common/prisma.service'
import { AuthenticatedUser } from '../common/auth-user.interface'
import {
  weeklyKpiPm,
  weeklyKpiCLevel,
  weeklyKpiCeo,
  domainExecutionFromDepartment,
  peerSynergy,
} from './kpi-engine'
import { getDhakaWeekBoundaries } from '../common/dhaka-time.util'
import { Prisma } from '@prisma/client'
import * as crypto from 'crypto'

@Injectable()
export class ExecWeeklyKpiService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieves pending PM weekly evaluation inbox for an executive based on their role.
   */
  async getPmEvaluationsInbox(actor: AuthenticatedUser) {
    const role = (actor.role || '').toUpperCase()
    const validRoles = ['CTO', 'CPO', 'CFO', 'CHRO', 'CEO']
    if (!validRoles.includes(role)) {
      throw new ForbiddenException('Only C-Suite executives can access PM evaluation inboxes')
    }

    const whereClause: any = {
      status: 'UNREAD',
    }
    if (role !== 'CEO') {
      whereClause.evaluatorRole = role
    }

    return this.prisma.kpiExecEvaluation.findMany({
      where: whereClause,
      include: {
        weeklyKpiRecord: {
          include: {
            employee: {
              select: {
                id: true,
                name: true,
                title: true,
                initials: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  /**
   * Confirms a suggested PM evaluation score (idempotent).
   */
  async confirmPmEvaluation(evaluationId: string, actor: AuthenticatedUser) {
    const evaluation = await this.prisma.kpiExecEvaluation.findUnique({
      where: { id: evaluationId },
      include: { weeklyKpiRecord: true },
    })
    if (!evaluation) throw new NotFoundException('Evaluation record not found')

    const actorRole = (actor.role || '').toUpperCase()
    if (actorRole !== 'CEO' && evaluation.evaluatorRole !== actorRole) {
      throw new ForbiddenException(
        `Role mismatch: You are logged in as ${actorRole} but this review belongs to ${evaluation.evaluatorRole}`,
      )
    }

    if (evaluation.status === 'CONFIRMED') {
      return {
        id: evaluation.id,
        status: 'CONFIRMED',
        score: Number(evaluation.score),
        alreadyConfirmed: true,
      }
    }

    const scoreToConfirm = evaluation.suggestedScore || evaluation.score

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.kpiExecEvaluation.update({
        where: { id: evaluationId },
        data: {
          status: 'CONFIRMED',
          score: scoreToConfirm,
          actedById: actor.id,
          actedAt: new Date(),
        },
      })

      // Recalculate PM Weekly KPI
      await this.recalculatePmWeeklyKpi(tx, evaluation.weeklyKpiRecordId)

      // Audit log
      await this.appendKpiAudit(tx, {
        employeeId: evaluation.weeklyKpiRecord.employeeId,
        actionType: 'PM_EVAL_CONFIRMED',
        valueBefore: evaluation.score,
        valueAfter: scoreToConfirm,
        reason: `${evaluation.evaluatorRole} confirmed PM evaluation score ${scoreToConfirm}`,
        actorId: actor.id,
        authorizedRole: actorRole,
      })

      return {
        id: updated.id,
        status: updated.status,
        score: Number(updated.score),
      }
    })
  }

  /**
   * Adjusts a PM evaluation score with mandatory 0..100 score and written reason.
   */
  async adjustPmEvaluation(
    evaluationId: string,
    newScore: number,
    reason: string,
    actor: AuthenticatedUser,
  ) {
    if (newScore === undefined || newScore === null || isNaN(newScore) || newScore < 0 || newScore > 100) {
      throw new BadRequestException('Evaluation score must be a number between 0 and 100')
    }
    if (!reason || reason.trim().length < 5) {
      throw new BadRequestException('A justification reason (min 5 characters) is required to adjust an evaluation score')
    }

    const evaluation = await this.prisma.kpiExecEvaluation.findUnique({
      where: { id: evaluationId },
      include: { weeklyKpiRecord: true },
    })
    if (!evaluation) throw new NotFoundException('Evaluation record not found')

    const actorRole = (actor.role || '').toUpperCase()
    if (actorRole !== 'CEO' && evaluation.evaluatorRole !== actorRole) {
      throw new ForbiddenException(
        `Role mismatch: You are logged in as ${actorRole} but this review belongs to ${evaluation.evaluatorRole}`,
      )
    }

    const valueBefore = evaluation.score
    const valueAfter = new Prisma.Decimal(newScore)

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.kpiExecEvaluation.update({
        where: { id: evaluationId },
        data: {
          score: valueAfter,
          status: 'ADJUSTED',
          reason: reason.trim(),
          actedById: actor.id,
          actedAt: new Date(),
        },
      })

      // Recalculate PM Weekly KPI
      await this.recalculatePmWeeklyKpi(tx, evaluation.weeklyKpiRecordId)

      // Audit log
      await this.appendKpiAudit(tx, {
        employeeId: evaluation.weeklyKpiRecord.employeeId,
        actionType: 'PM_EVAL_ADJUSTED',
        valueBefore,
        valueAfter,
        reason: `${evaluation.evaluatorRole} adjusted score from ${valueBefore} to ${newScore}: ${reason.trim()}`,
        actorId: actor.id,
        authorizedRole: actorRole,
      })

      return {
        id: updated.id,
        status: updated.status,
        score: Number(updated.score),
        previousScore: Number(valueBefore),
        reason: updated.reason,
      }
    })
  }

  /**
   * Recalculates PM composite weekly KPI from the four C-Level evaluation components.
   */
  async recalculatePmWeeklyKpi(tx: Prisma.TransactionClient, recordId: string) {
    const record = await tx.weeklyKpiRecord.findUnique({
      where: { id: recordId },
      include: { execEvaluations: true },
    })
    if (!record) return

    const cto = record.execEvaluations.find((e) => e.evaluatorRole === 'CTO')
    const cpo = record.execEvaluations.find((e) => e.evaluatorRole === 'CPO')
    const cfo = record.execEvaluations.find((e) => e.evaluatorRole === 'CFO')
    const chro = record.execEvaluations.find((e) => e.evaluatorRole === 'CHRO')

    const result = weeklyKpiPm({
      hasCompletions: true,
      cto: cto ? { score: Number(cto.score), status: cto.status } : undefined,
      cpo: cpo ? { score: Number(cpo.score), status: cpo.status } : undefined,
      cfo: cfo ? { score: Number(cfo.score), status: cfo.status } : undefined,
      chro: chro ? { score: Number(chro.score), status: chro.status } : undefined,
    })

    const evaluationStatus = result.status === 'OFFICIAL' ? 'CONFIRMED' : 'PROVISIONAL'

    await tx.weeklyKpiRecord.update({
      where: { id: recordId },
      data: {
        score: result.value !== null ? new Prisma.Decimal(result.value) : null,
        isInactive: result.status === 'NA',
        evaluationStatus: evaluationStatus as any,
      },
    })
  }

  /**
   * Records a C-Level peer cross-evaluation score (self-rating strictly prohibited).
   */
  async recordCLevelPeerEval(
    targetExecutiveId: string,
    score: number,
    notes: string,
    actor: AuthenticatedUser,
  ) {
    if (targetExecutiveId === actor.id) {
      throw new ForbiddenException('Self-evaluation is strictly prohibited for peer synergy')
    }
    if (score === undefined || score === null || isNaN(score) || score < 0 || score > 100) {
      throw new BadRequestException('Peer synergy score must be a number between 0 and 100')
    }

    const { weekStartUtc: weekStart } = getDhakaWeekBoundaries(new Date())

    // Record audit entry
    await this.appendKpiAudit(this.prisma, {
      employeeId: targetExecutiveId,
      actionType: 'PEER_SYNERGY_EVAL',
      valueAfter: new Prisma.Decimal(score),
      reason: `Peer evaluation by ${actor.name || actor.id}: ${notes || 'Peer rating'}`,
      actorId: actor.id,
      authorizedRole: (actor.role || 'EXECUTIVE').toUpperCase(),
    })

    return {
      targetExecutiveId,
      score,
      recordedBy: actor.id,
      status: 'RECORDED',
    }
  }

  private async appendKpiAudit(
    tx: Prisma.TransactionClient | PrismaService,
    data: {
      employeeId: string
      actionType: string
      valueBefore?: Prisma.Decimal | null
      valueAfter?: Prisma.Decimal | null
      reason: string
      actorId: string
      authorizedRole: string
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
    const payload = `${sequence}|${prevHash}|${data.employeeId}|KPI|${delta}|${data.actionType}|${Date.now()}`
    const entryHash = crypto.createHash('sha256').update(payload).digest('hex')

    await tx.kpiXpAuditLog.create({
      data: {
        sequence,
        prevHash,
        entryHash,
        employeeId: data.employeeId,
        metricType: 'KPI',
        deltaValue: delta,
        valueBefore: data.valueBefore,
        valueAfter: data.valueAfter,
        actionType: data.actionType,
        triggerEvent: data.reason,
        reason: data.reason,
        authorizedById: data.actorId,
        authorizedRole: data.authorizedRole,
        recordedAt: new Date(),
      },
    })
  }
}

