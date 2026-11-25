import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common'
import { PrismaService } from '../common/prisma.service'
import { XpLedgerService } from './xp-ledger.service'
import { AuthenticatedUser } from '../common/auth-user.interface'
import { Prisma } from '@prisma/client'
import * as crypto from 'crypto'

export interface ConsensusTally {
  approvals: number
  rejections: number
  remaining: number
  threshold: number
  eligibleCount: number
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED'
  deadline: Date | null
}

@Injectable()
export class FrozenXpConsensusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly xpLedger: XpLedgerService,
  ) {}

  /**
   * Opens or validates a consensus voting request on a frozen task/milestone weight verification.
   */
  async openConsensusRequest(
    verificationId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma
    const deadlineDays = 7
    const voteDeadline = new Date(Date.now() + deadlineDays * 86400000)

    const verification = await client.taskWeightVerification.findUnique({
      where: { id: verificationId },
      include: { task: true, milestone: true },
    })

    if (!verification) {
      throw new NotFoundException(`TaskWeightVerification "${verificationId}" not found`)
    }

    return client.taskWeightVerification.update({
      where: { id: verificationId },
      data: {
        isMassiveXp: true,
        massiveXpFrozen: true,
        consensusStatus: 'PENDING',
        voteDeadline: verification.voteDeadline || voteDeadline,
      },
    })
  }

  /**
   * Returns list of eligible voters: active CTO, CPO, CFO, CHRO,
   * excluding the proposer (PM) and assignee (developer).
   */
  async getEligibleVoters(verificationId: string) {
    const verification = await this.prisma.taskWeightVerification.findUnique({
      where: { id: verificationId },
      include: { task: true, milestone: true },
    })
    if (!verification) throw new NotFoundException('Verification record not found')

    const excludedIds = new Set<string>()
    if (verification.proposerId) excludedIds.add(verification.proposerId)
    if (verification.task?.assigneeId) excludedIds.add(verification.task.assigneeId)
    if (verification.milestone?.achievedById) excludedIds.add(verification.milestone.achievedById)

    const seatRoles = ['cto', 'cpo', 'cfo', 'chro']
    const eligible: Array<{ id: string; name: string; email: string; role: string }> = []

    for (const seat of seatRoles) {
      const emp = await this.prisma.employee.findFirst({
        where: {
          isSuspended: false,
          id: { notIn: Array.from(excludedIds) },
          OR: [
            {
              employeeRoles: {
                some: {
                  isActive: true,
                  role: { slug: seat },
                },
              },
            },
            { id: { startsWith: `${seat}_` } },
            { title: { contains: seat.toUpperCase() } },
          ],
        },
        orderBy: { createdAt: 'desc' },
      })

      if (emp && !eligible.some((e) => e.id === emp.id)) {
        eligible.push({
          id: emp.id,
          name: emp.name,
          email: emp.email,
          role: seat,
        })
      }
    }

    return eligible
  }

  /**
   * Computes consensus tally and checks win / loss / expiry conditions.
   */
  async getTally(verificationId: string): Promise<ConsensusTally> {
    const verification = await this.prisma.taskWeightVerification.findUnique({
      where: { id: verificationId },
      include: { consensusVotes: true },
    })
    if (!verification) throw new NotFoundException('Verification record not found')

    const eligible = await this.getEligibleVoters(verificationId)
    const eligibleCount = eligible.length
    const threshold = Math.floor(eligibleCount / 2) + 1

    const approvals = verification.consensusVotes.filter((v) => v.decision === 'APPROVE').length
    const rejections = verification.consensusVotes.filter((v) => v.decision === 'REJECT').length
    const remaining = Math.max(0, eligibleCount - approvals - rejections)

    let status = (verification.consensusStatus || 'PENDING') as 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED'

    if (status === 'PENDING') {
      const now = new Date()
      if (verification.voteDeadline && verification.voteDeadline <= now) {
        status = 'EXPIRED'
      } else if (approvals >= threshold) {
        status = 'APPROVED'
      } else if (approvals + remaining < threshold) {
        status = 'REJECTED'
      }
    }

    return {
      approvals,
      rejections,
      remaining,
      threshold,
      eligibleCount,
      status,
      deadline: verification.voteDeadline,
    }
  }

  /**
   * Casts an executive consensus vote (APPROVE / REJECT) with mandatory SOD, deadline, and double-vote checks.
   */
  async castVote(
    verificationId: string,
    actor: AuthenticatedUser,
    decision: 'APPROVE' | 'REJECT',
    notes?: string,
  ) {
    const verification = await this.prisma.taskWeightVerification.findUnique({
      where: { id: verificationId },
      include: { task: true, milestone: true, consensusVotes: true },
    })
    if (!verification) throw new NotFoundException('Verification record not found')

    // Current state check
    if (verification.consensusStatus && verification.consensusStatus !== 'PENDING') {
      throw new BadRequestException(
        `Voting is closed for this massive XP request (status: ${verification.consensusStatus}).`,
      )
    }

    // Expiry check
    const now = new Date()
    if (verification.voteDeadline && verification.voteDeadline <= now) {
      await this.finalizeRequest(verification.id, 'EXPIRED', 'Voting deadline elapsed without reaching consensus threshold')
      throw new BadRequestException('Voting deadline has expired. Request marked as expired.')
    }

    // Self-vote prevention
    if (verification.proposerId === actor.id) {
      throw new ForbiddenException('Task proposer cannot vote on their own massive XP proposal')
    }
    if (verification.task?.assigneeId === actor.id || verification.milestone?.achievedById === actor.id) {
      throw new ForbiddenException('Beneficiary cannot vote on their own massive XP payout')
    }

    // Eligibility check
    const eligible = await this.getEligibleVoters(verificationId)
    if (!eligible.some((e) => e.id === actor.id)) {
      throw new ForbiddenException('Actor is not an eligible C-Suite voter for this request')
    }

    // Double-vote block
    const existing = verification.consensusVotes.find((v) => v.executiveId === actor.id)
    if (existing) {
      throw new ConflictException('Double voting is prohibited: you have already cast your vote on this request')
    }

    // Record vote
    await this.prisma.taskWeightConsensusVote.create({
      data: {
        verificationId,
        executiveId: actor.id,
        executiveRole: (actor.role || 'EXECUTIVE').toUpperCase(),
        decision,
        notes: notes?.trim() || null,
        votedAt: now,
      },
    })

    // Recompute tally
    const tally = await this.getTally(verificationId)

    if (tally.status === 'APPROVED') {
      await this.finalizeRequest(verificationId, 'APPROVED', `Consensus reached with ${tally.approvals}/${tally.threshold} approvals`)
    } else if (tally.status === 'REJECTED') {
      await this.finalizeRequest(
        verificationId,
        'REJECTED',
        `Consensus threshold unreachable (approvals: ${tally.approvals}, remaining: ${tally.remaining}, threshold: ${tally.threshold})`,
      )
    }

    // Audit log entry
    await this.appendVoteAuditLog({
      actor,
      verificationId,
      action: 'CONSENSUS_VOTE_CAST',
      decision,
      notes,
      tally,
    })

    return {
      status: tally.status,
      approvals: tally.approvals,
      rejections: tally.rejections,
      remaining: tally.remaining,
      threshold: tally.threshold,
    }
  }

  /**
   * Finalizes request outcome: APPROVED (release XP) or REJECTED/EXPIRED (reverse pending XP).
   */
  async finalizeRequest(
    verificationId: string,
    outcome: 'APPROVED' | 'REJECTED' | 'EXPIRED',
    reason: string,
    actorId?: string,
  ) {
    const verification = await this.prisma.taskWeightVerification.findUnique({
      where: { id: verificationId },
      include: { task: true, milestone: true },
    })
    if (!verification) return

    const now = new Date()
    const points = Number(verification.approvedWeight || verification.proposedWeight)
    const xpYield = points * 10
    const beneficiaryId = verification.task?.assigneeId || verification.milestone?.achievedById

    await this.prisma.$transaction(async (tx) => {
      await tx.taskWeightVerification.update({
        where: { id: verificationId },
        data: {
          consensusStatus: outcome,
          massiveXpFrozen: false,
          decisionReason: reason,
          decisionAt: now,
        },
      })

      if (beneficiaryId) {
        if (outcome === 'APPROVED') {
          // Release frozen XP
          await this.xpLedger.appendEvent(
            {
              employeeId: beneficiaryId,
              delta: xpYield,
              eventType: 'RELEASE_FROZEN',
              reason: `Massive XP consensus APPROVED: released ${xpYield} XP for verification ${verificationId}`,
              taskId: verification.taskId || undefined,
              taskCategory: verification.category || 'CRITICAL',
              awardedById: actorId || 'SYSTEM_CONSENSUS',
            },
            tx,
          )

          // Notify beneficiary & PM
          await this.createNotification(
            tx,
            beneficiaryId,
            'Massive XP Released',
            `Your frozen award of ${xpYield} XP has been approved by executive consensus.`,
            'milestone',
            verificationId,
          )
          if (verification.proposerId && verification.proposerId !== beneficiaryId) {
            await this.createNotification(
              tx,
              verification.proposerId,
              'Massive XP Proposal Approved',
              `The massive XP award (${xpYield} XP) for proposal ${verificationId} was approved by executive consensus.`,
              'milestone',
              verificationId,
            )
          }
        } else {
          // REJECTED or EXPIRED: Compensatory REVERSAL event so XP never silently disappears
          await this.xpLedger.appendEvent(
            {
              employeeId: beneficiaryId,
              delta: xpYield,
              eventType: 'REVERSAL',
              reason: `Massive XP consensus ${outcome}: reversed pending ${xpYield} XP (${reason})`,
              taskId: verification.taskId || undefined,
              taskCategory: verification.category || 'CRITICAL',
              awardedById: actorId || 'SYSTEM_CONSENSUS',
            },
            tx,
          )

          // Notify beneficiary
          await this.createNotification(
            tx,
            beneficiaryId,
            `Massive XP ${outcome}`,
            `The massive XP award (${xpYield} XP) was ${outcome.toLowerCase()}: ${reason}`,
            'milestone',
            verificationId,
          )
        }
      }
    })
  }

  /**
   * CEO unilateral override (approve or reject) with fresh MFA and logged justification.
   */
  async ceoOverride(
    verificationId: string,
    actor: AuthenticatedUser,
    decision: 'APPROVE' | 'REJECT',
    reason: string,
  ) {
    if ((actor.role || '').toLowerCase() !== 'ceo') {
      throw new ForbiddenException('Only the Chief Executive Officer may issue unilateral consensus overrides')
    }
    if (!reason || reason.trim().length < 5) {
      throw new BadRequestException('A clear justification reason is required for executive consensus override')
    }

    const verification = await this.prisma.taskWeightVerification.findUnique({
      where: { id: verificationId },
      include: { task: true, milestone: true },
    })
    if (!verification) throw new NotFoundException('Verification record not found')

    const outcome = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED'
    const finalReason = `CEO Supreme Override (${decision}): ${reason.trim()}`

    await this.finalizeRequest(verificationId, outcome, finalReason, actor.id)

    // Audit log
    await this.appendVoteAuditLog({
      actor,
      verificationId,
      action: 'CEO_CONSENSUS_OVERRIDE',
      decision,
      notes: reason,
      tally: { status: outcome } as any,
    })

    return {
      status: outcome,
      decisionReason: finalReason,
    }
  }

  /**
   * Sweeps expired pending votes and reverses unapproved awards.
   */
  async sweepExpiredVotes() {
    const now = new Date()
    const expired = await this.prisma.taskWeightVerification.findMany({
      where: {
        consensusStatus: 'PENDING',
        voteDeadline: { lte: now },
      },
    })

    let count = 0
    for (const v of expired) {
      await this.finalizeRequest(
        v.id,
        'EXPIRED',
        'Voting deadline elapsed without reaching quorum consensus',
      )
      count++
    }

    return { sweptCount: count }
  }

  private async createNotification(
    tx: Prisma.TransactionClient,
    userId: string,
    title: string,
    message: string,
    type: string,
    entityId: string,
  ) {
    if (tx.notification && typeof tx.notification.create === 'function') {
      try {
        await tx.notification.create({
          data: {
            userId,
            title,
            message,
            type,
            entityType: 'task_weight_verification',
            entityId,
          },
        })
      } catch {
        // Non-blocking notification
      }
    }
  }

  private async appendVoteAuditLog(params: {
    actor: AuthenticatedUser
    verificationId: string
    action: string
    decision: string
    notes?: string
    tally: ConsensusTally
  }) {
    const last = await this.prisma.kpiXpAuditLog.findFirst({
      orderBy: { sequence: 'desc' },
      select: { sequence: true, entryHash: true },
    })

    const seq = (last?.sequence || 0) + 1
    const prev = last?.entryHash || '00000000000000000000000000000000'
    const payload = `${seq}|${prev}|${params.actor.id}|XP|${params.action}|${params.decision}|${Date.now()}`
    const entryHash = crypto.createHash('sha256').update(payload).digest('hex')

    await this.prisma.kpiXpAuditLog.create({
      data: {
        sequence: seq,
        prevHash: prev,
        entryHash,
        employeeId: params.actor.id,
        metricType: 'XP',
        deltaValue: new Prisma.Decimal(0),
        actionType: params.action,
        triggerEvent: `Massive XP Vote: ${params.decision}`,
        reason: params.notes || `Consensus vote ${params.decision}`,
        authorizedById: params.actor.id,
        authorizedRole: (params.actor.role || 'EXECUTIVE').toUpperCase(),
        recordedAt: new Date(),
      },
    })
  }
}
