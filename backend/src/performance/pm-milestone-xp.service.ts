import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common'
import { PrismaService } from '../common/prisma.service'
import { XpLedgerService } from './xp-ledger.service'
import { FrozenXpConsensusService } from './frozen-xp-consensus.service'
import { AuthenticatedUser } from '../common/auth-user.interface'
import { Prisma } from '@prisma/client'

@Injectable()
export class PmMilestoneXpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly xpLedger: XpLedgerService,
    private readonly consensusService: FrozenXpConsensusService,
  ) {}

  /**
   * Completes a project milestone and routes milestone XP for the PM to C-level consensus approval.
   * PMs NEVER receive XP automatically or from self-assigned tasks.
   */
  async completeMilestoneWithXp(
    milestoneId: string,
    pmId: string,
    weightPoints: number,
    actor: AuthenticatedUser,
  ) {
    if (weightPoints <= 0) {
      throw new BadRequestException('Milestone weight points must be strictly positive')
    }

    const milestone = await this.prisma.projectMilestone.findUnique({
      where: { id: milestoneId },
      include: { project: true, weightVerification: true },
    })
    if (!milestone) throw new NotFoundException(`Milestone "${milestoneId}" not found`)

    // Verify PM exists and is active
    const pm = await this.prisma.employee.findUnique({ where: { id: pmId } })
    if (!pm) throw new NotFoundException(`PM Employee "${pmId}" not found`)

    const xpAmount = weightPoints * 10
    const now = new Date()

    return this.prisma.$transaction(async (tx) => {
      // 1. Mark milestone completed
      await tx.projectMilestone.update({
        where: { id: milestoneId },
        data: {
          status: 'completed',
          completedAt: now,
          achievedById: pmId,
          weightPoints: new Prisma.Decimal(weightPoints),
        },
      })

      // 2. Create or update TaskWeightVerification for milestone
      const verification = await tx.taskWeightVerification.upsert({
        where: { milestoneId },
        create: {
          milestoneId,
          proposedWeight: new Prisma.Decimal(weightPoints),
          approvedWeight: new Prisma.Decimal(weightPoints),
          proposerId: pmId,
          category: 'CRITICAL',
          status: 'PENDING_CHRO',
          isMassiveXp: xpAmount >= 200,
          massiveXpFrozen: true,
          consensusStatus: 'PENDING',
          voteDeadline: new Date(now.getTime() + 7 * 86400000),
        },
        update: {
          proposedWeight: new Prisma.Decimal(weightPoints),
          approvedWeight: new Prisma.Decimal(weightPoints),
          proposerId: pmId,
          isMassiveXp: xpAmount >= 200,
          massiveXpFrozen: true,
          consensusStatus: 'PENDING',
          voteDeadline: new Date(now.getTime() + 7 * 86400000),
        },
      })

      // 3. Post AWARD_PENDING to PM XP ledger
      await this.xpLedger.appendEvent(
        {
          employeeId: pmId,
          delta: xpAmount,
          eventType: 'AWARD_PENDING',
          reason: `Milestone completed [${milestone.id}]: ${milestone.title} (${weightPoints} pts -> ${xpAmount} XP, pending C-Level consensus)`,
          taskCategory: 'CRITICAL',
          awardedById: actor.id,
        },
        tx,
      )

      // 4. Freeze if massive XP
      if (xpAmount >= 200) {
        await this.xpLedger.appendEvent(
          {
            employeeId: pmId,
            delta: xpAmount,
            eventType: 'FREEZE',
            reason: `Massive milestone XP frozen: ${xpAmount} XP pending C-Level quorum vote`,
            taskCategory: 'CRITICAL',
            awardedById: actor.id,
          },
          tx,
        )
      }

      return {
        milestoneId,
        pmId,
        weightPoints,
        xpAmount,
        verificationId: verification.id,
        status: 'PENDING_C_LEVEL_CONSENSUS',
      }
    })
  }

  /**
   * Approves PM milestone XP via C-level consensus release.
   */
  async approveMilestoneConsensus(verificationId: string, actor: AuthenticatedUser) {
    const verification = await this.prisma.taskWeightVerification.findUnique({
      where: { id: verificationId },
      include: { milestone: true },
    })
    if (!verification || !verification.milestone) {
      throw new NotFoundException('Milestone verification record not found')
    }

    const pmId = verification.milestone.achievedById || verification.proposerId
    const points = Number(verification.approvedWeight || verification.proposedWeight)
    const xpAmount = points * 10

    return this.prisma.$transaction(async (tx) => {
      await tx.taskWeightVerification.update({
        where: { id: verificationId },
        data: {
          status: 'APPROVED',
          consensusStatus: 'APPROVED',
          massiveXpFrozen: false,
          decisionAt: new Date(),
        },
      })

      // Release into posted XP
      await this.xpLedger.appendEvent(
        {
          employeeId: pmId,
          delta: xpAmount,
          eventType: 'VERIFY_RELEASE',
          reason: `Milestone XP verified & released by C-Level consensus: ${milestoneVerificationSummary(verification.milestone?.title, xpAmount)}`,
          taskCategory: 'CRITICAL',
          awardedById: actor.id,
        },
        tx,
      )

      return {
        verificationId,
        pmId,
        xpAmount,
        status: 'POSTED',
      }
    })
  }
}

function milestoneVerificationSummary(title?: string, xp?: number) {
  return `${title || 'Milestone'} (${xp} XP)`
}

