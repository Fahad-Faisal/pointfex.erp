import { Injectable, Logger, BadRequestException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../common/prisma.service'
import { Prisma, XpEventType } from '@prisma/client'
import * as crypto from 'crypto'
import { AuthenticatedUser } from '../common/auth-user.interface'
import { verifyTotpCode } from '../common/security-policy.util'

export interface AppendXpEventInput {
  employeeId: string
  delta: number
  eventType: XpEventType
  reason: string
  taskId?: string
  taskCategory?: string
  correlationId?: string
  reversesEntryId?: string
  awardedById?: string
  effectiveAt?: Date
  recordedAt?: Date
  isBackfilled?: boolean
}

export interface RebuildBalanceResult {
  userId: string
  postedXp: number
  pendingXp: number
  frozenXp: number
  byCategoryJson: Record<string, number>
  lastSequence: number
}

export interface ReconcileResult {
  matched: boolean
  discrepancies: Array<{
    userId: string
    cached: { postedXp: number; pendingXp: number; frozenXp: number; lastSequence: number }
    ledger: { postedXp: number; pendingXp: number; frozenXp: number; lastSequence: number }
  }>
}

export const GENESIS_XP_HASH = '00000000000000000000000000000000'

@Injectable()
export class XpLedgerService {
  private readonly logger = new Logger(XpLedgerService.name)

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Appends an immutable XP ledger event under strict per-user advisory locking,
   * calculating a gap-free sequence, cryptographic SHA-256 hash chaining,
   * and updating the mutable `xp_balances` cache projection in the same transaction.
   */
  async appendEvent(
    input: AppendXpEventInput,
    externalTx?: Prisma.TransactionClient,
  ) {
    const runInTx = async (tx: Prisma.TransactionClient) => {
      // 1. Take transaction-scoped PostgreSQL advisory lock on hashtext(employeeId)
      // This serializes all concurrent ledger writes for this employee.
      await tx.$executeRawUnsafe(
        `SELECT pg_advisory_xact_lock(hashtext($1))`,
        input.employeeId,
      )

      // 2. Fetch the latest entry to determine gap-free sequence and previous hash
      const lastEntry = await tx.xpLedgerEntry.findFirst({
        where: { employeeId: input.employeeId },
        orderBy: [{ sequence: 'desc' }, { createdAt: 'desc' }],
        select: { sequence: true, entryHash: true },
      })

      const nextSequence = (lastEntry?.sequence || 0) + 1
      const prevHash = lastEntry?.entryHash || GENESIS_XP_HASH
      const recordedAt = input.recordedAt || new Date()
      const effectiveAt = input.effectiveAt || recordedAt

      // 3. Compute entryHash
      const payload = `${nextSequence}|${prevHash}|${input.employeeId}|${input.eventType}|${input.delta}|${input.taskId || ''}|${recordedAt.toISOString()}`
      const entryHash = crypto.createHash('sha256').update(payload).digest('hex')

      // 4. Map legacy entryType & status for insert-time compatibility
      let legacyEntryType = 'AWARD'
      let legacyStatus = 'POSTED'

      switch (input.eventType) {
        case 'AWARD_PENDING':
          legacyEntryType = 'AWARD'
          legacyStatus = 'PENDING'
          break
        case 'VERIFY_RELEASE':
          legacyEntryType = 'AWARD'
          legacyStatus = 'POSTED'
          break
        case 'FREEZE':
          legacyEntryType = 'AWARD'
          legacyStatus = 'FROZEN'
          break
        case 'RELEASE_FROZEN':
          legacyEntryType = 'AWARD'
          legacyStatus = 'POSTED'
          break
        case 'REVERSAL':
          legacyEntryType = 'REVERSAL'
          legacyStatus = 'REVERSED'
          break
        case 'ADJUSTMENT':
          legacyEntryType = 'ADJUSTMENT'
          legacyStatus = 'POSTED'
          break
      }

      // 5. Insert immutable row
      const newEntry = await tx.xpLedgerEntry.create({
        data: {
          employeeId: input.employeeId,
          delta: input.delta,
          reason: input.reason,
          entryType: legacyEntryType,
          eventType: input.eventType,
          status: legacyStatus,
          taskId: input.taskId,
          correlationId: input.correlationId,
          reversesEntryId: input.reversesEntryId,
          awardedById: input.awardedById,
          effectiveAt,
          recordedAt,
          isBackfilled: Boolean(input.isBackfilled),
          prevHash,
          entryHash,
          sequence: nextSequence,
        },
      })

      // 6. Update mutable xp_balances cache projection
      await this.applyEventToBalanceCache(tx, input.employeeId, input, nextSequence)

      return newEntry
    }

    if (externalTx) {
      return runInTx(externalTx)
    }

    return this.prisma.$transaction(async (tx) => runInTx(tx))
  }

  /**
   * Applies an XP event delta to the `xp_balances` projection table and updates `Employee.lifetimeXp`.
   */
  private async applyEventToBalanceCache(
    tx: Prisma.TransactionClient,
    userId: string,
    event: AppendXpEventInput,
    sequence: number,
  ) {
    let balance = await tx.xpBalance.findUnique({ where: { userId } })

    if (!balance) {
      balance = await tx.xpBalance.create({
        data: {
          userId,
          postedXp: 0,
          pendingXp: 0,
          frozenXp: 0,
          byCategoryJson: {},
          lastSequence: 0,
        },
      })
    }

    let postedXp = balance.postedXp
    let pendingXp = balance.pendingXp
    let frozenXp = balance.frozenXp
    const byCategory: Record<string, number> = (balance.byCategoryJson as Record<string, number>) || {}
    const categoryKey = (event.taskCategory || 'MEDIUM').toUpperCase()

    switch (event.eventType) {
      case 'AWARD_PENDING':
        pendingXp = Math.max(0, pendingXp + event.delta)
        break

      case 'VERIFY_RELEASE':
        // Moves from pending into posted
        pendingXp = Math.max(0, pendingXp - event.delta)
        postedXp = Math.max(0, postedXp + event.delta)
        byCategory[categoryKey] = (byCategory[categoryKey] || 0) + event.delta
        break

      case 'FREEZE':
        // Froze massive XP: pending decreases, frozen increases
        pendingXp = Math.max(0, pendingXp - event.delta)
        frozenXp = Math.max(0, frozenXp + event.delta)
        break

      case 'RELEASE_FROZEN':
        // Release from quorum approval
        frozenXp = Math.max(0, frozenXp - event.delta)
        postedXp = Math.max(0, postedXp + event.delta)
        byCategory[categoryKey] = (byCategory[categoryKey] || 0) + event.delta
        break

      case 'REVERSAL':
        // Reversal of prior posted or frozen XP
        if (frozenXp >= event.delta) {
          frozenXp = Math.max(0, frozenXp - event.delta)
        } else {
          postedXp = Math.max(0, postedXp - event.delta)
          byCategory[categoryKey] = Math.max(0, (byCategory[categoryKey] || 0) - event.delta)
        }
        break

      case 'ADJUSTMENT':
        // Correction / adjustment
        postedXp = Math.max(0, postedXp + event.delta)
        byCategory[categoryKey] = Math.max(0, (byCategory[categoryKey] || 0) + event.delta)
        break
    }

    await tx.xpBalance.update({
      where: { userId },
      data: {
        postedXp,
        pendingXp,
        frozenXp,
        byCategoryJson: byCategory,
        lastSequence: sequence,
      },
    })

    // Sync Employee.lifetimeXp to match postedXp
    await tx.employee.update({
      where: { id: userId },
      data: { lifetimeXp: postedXp },
    })
  }

  /**
   * Rebuilds the user's `xp_balances` cache projection completely from the immutable ledger.
   */
  async rebuildBalance(
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<RebuildBalanceResult> {
    const client = tx || this.prisma

    const entries = await client.xpLedgerEntry.findMany({
      where: { employeeId: userId },
      orderBy: [{ sequence: 'asc' }, { createdAt: 'asc' }],
    })

    let postedXp = 0
    let pendingXp = 0
    let frozenXp = 0
    let lastSequence = 0
    const byCategory: Record<string, number> = {}

    for (const e of entries) {
      if (e.sequence > lastSequence) {
        lastSequence = e.sequence
      }

      // If eventType is set, use event sourcing rules
      if (e.eventType) {
        switch (e.eventType) {
          case 'AWARD_PENDING':
            pendingXp = Math.max(0, pendingXp + e.delta)
            break
          case 'VERIFY_RELEASE':
            pendingXp = Math.max(0, pendingXp - e.delta)
            postedXp = Math.max(0, postedXp + e.delta)
            byCategory['GENERAL'] = (byCategory['GENERAL'] || 0) + e.delta
            break
          case 'FREEZE':
            pendingXp = Math.max(0, pendingXp - e.delta)
            frozenXp = Math.max(0, frozenXp + e.delta)
            break
          case 'RELEASE_FROZEN':
            frozenXp = Math.max(0, frozenXp - e.delta)
            postedXp = Math.max(0, postedXp + e.delta)
            byCategory['GENERAL'] = (byCategory['GENERAL'] || 0) + e.delta
            break
          case 'REVERSAL':
            if (frozenXp >= e.delta) {
              frozenXp = Math.max(0, frozenXp - e.delta)
            } else {
              postedXp = Math.max(0, postedXp - e.delta)
              byCategory['GENERAL'] = Math.max(0, (byCategory['GENERAL'] || 0) - e.delta)
            }
            break
          case 'ADJUSTMENT':
            postedXp = Math.max(0, postedXp + e.delta)
            byCategory['GENERAL'] = Math.max(0, (byCategory['GENERAL'] || 0) + e.delta)
            break
        }
      } else {
        // Legacy entry adapter: derive state from legacy status column
        if (e.status === 'POSTED') {
          postedXp += e.delta
          byCategory['GENERAL'] = (byCategory['GENERAL'] || 0) + e.delta
        } else if (e.status === 'PENDING') {
          pendingXp += e.delta
        } else if (e.status === 'FROZEN') {
          frozenXp += e.delta
        } else if (e.status === 'REVERSED') {
          postedXp = Math.max(0, postedXp - e.delta)
        }
      }
    }

    await client.xpBalance.upsert({
      where: { userId },
      create: {
        userId,
        postedXp,
        pendingXp,
        frozenXp,
        byCategoryJson: byCategory,
        lastSequence,
      },
      update: {
        postedXp,
        pendingXp,
        frozenXp,
        byCategoryJson: byCategory,
        lastSequence,
      },
    })

    await client.employee.update({
      where: { id: userId },
      data: { lifetimeXp: postedXp },
    })

    return {
      userId,
      postedXp,
      pendingXp,
      frozenXp,
      byCategoryJson: byCategory,
      lastSequence,
    }
  }

  /**
   * Reconciles cached `xp_balances` with rebuild projections from the ledger to detect drift.
   */
  async reconcileBalances(userId?: string): Promise<ReconcileResult> {
    const userIds: string[] = []

    if (userId) {
      userIds.push(userId)
    } else {
      const allBalances = await this.prisma.xpBalance.findMany({ select: { userId: true } })
      userIds.push(...allBalances.map((b) => b.userId))
    }

    const discrepancies: ReconcileResult['discrepancies'] = []

    for (const uid of userIds) {
      const cached = await this.prisma.xpBalance.findUnique({ where: { userId: uid } })
      const ledger = await this.rebuildBalance(uid)

      if (
        !cached ||
        cached.postedXp !== ledger.postedXp ||
        cached.pendingXp !== ledger.pendingXp ||
        cached.frozenXp !== ledger.frozenXp ||
        cached.lastSequence !== ledger.lastSequence
      ) {
        discrepancies.push({
          userId: uid,
          cached: {
            postedXp: cached?.postedXp || 0,
            pendingXp: cached?.pendingXp || 0,
            frozenXp: cached?.frozenXp || 0,
            lastSequence: cached?.lastSequence || 0,
          },
          ledger: {
            postedXp: ledger.postedXp,
            pendingXp: ledger.pendingXp,
            frozenXp: ledger.frozenXp,
            lastSequence: ledger.lastSequence,
          },
        })
      }
    }

    return {
      matched: discrepancies.length === 0,
      discrepancies,
    }
  }

  /**
   * Cryptographic verification of the end-to-end hash chain for an employee's ledger.
   */
  async verifyHashChain(userId: string): Promise<{ valid: boolean; totalEntries: number; brokenAtSequence?: number }> {
    const entries = await this.prisma.xpLedgerEntry.findMany({
      where: { employeeId: userId },
      orderBy: [{ sequence: 'asc' }, { createdAt: 'asc' }],
    })

    if (entries.length === 0) {
      return { valid: true, totalEntries: 0 }
    }

    let expectedPrevHash = GENESIS_XP_HASH

    for (const e of entries) {
      // Legacy entries with sequence 0 or null hash pass baseline
      if (e.sequence === 0 || !e.entryHash) {
        continue
      }

      if (e.prevHash && e.prevHash !== expectedPrevHash) {
        return { valid: false, totalEntries: entries.length, brokenAtSequence: e.sequence }
      }

      const recordedAt = e.recordedAt || e.createdAt
      const payload = `${e.sequence}|${e.prevHash}|${e.employeeId}|${e.eventType || e.entryType}|${e.delta}|${e.taskId || ''}|${recordedAt.toISOString()}`
      const computedHash = crypto.createHash('sha256').update(payload).digest('hex')

      if (e.entryHash !== computedHash) {
        return { valid: false, totalEntries: entries.length, brokenAtSequence: e.sequence }
      }

      expectedPrevHash = e.entryHash
    }

    return { valid: true, totalEntries: entries.length }
  }

  /**
   * Preview CHRO legacy XP corrections (dry run, modifies zero rows).
   * Identifies tasks where XP was reduced by context multipliers (0.70 / 0.50).
   */
  async getLegacyCorrectionsPreview() {
    const tasks = await this.prisma.task.findMany({
      where: {
        weightVerification: { isNot: null },
      },
      include: {
        weightVerification: true,
        assignee: { select: { id: true, name: true } },
      },
    })

    const corrections: Array<{
      taskId: string
      employeeId: string
      employeeName: string
      context: string
      weightPoints: number
      legacyXp: number
      correctXp: number
      deltaCorrection: number
    }> = []

    for (const t of tasks) {
      const wv = t.weightVerification!
      const weight = Number(wv.approvedWeight) || Number(t.weightPoints) || 0
      let legacyMultiplier = 1.0
      if (wv.context === 'OUTSIDE_SQUAD') legacyMultiplier = 0.7
      if (wv.context === 'DIRECT_EXECUTIVE') legacyMultiplier = 0.5

      const legacyXp = Math.round(weight * legacyMultiplier * 10)
      const correctXp = Math.round(weight * 10)
      const delta = correctXp - legacyXp

      if (delta > 0) {
        corrections.push({
          taskId: t.id,
          employeeId: t.assigneeId,
          employeeName: t.assignee.name,
          context: wv.context,
          weightPoints: weight,
          legacyXp,
          correctXp,
          deltaCorrection: delta,
        })
      }
    }

    return {
      dryRun: true,
      totalTasksRequiringCorrection: corrections.length,
      totalXpAdjustment: corrections.reduce((acc, c) => acc + c.deltaCorrection, 0),
      corrections,
    }
  }

  /**
   * Apply CHRO-approved legacy XP corrections.
   * Emits ADJUSTMENT event rows with cryptographic hash chaining and updates the balance cache.
   * Gated strictly by CHRO role and fresh 6-digit TOTP MFA.
   */
  async applyLegacyCorrections(actor: AuthenticatedUser, mfaCode: string) {
    if ((actor.role || '').toLowerCase() !== 'chro') {
      throw new ForbiddenException('Only CHRO may apply legacy XP corrections')
    }

    const employee = await this.prisma.employee.findUnique({ where: { id: actor.id } })
    if (!employee || !employee.mfaEnabled || !employee.mfaSecret) {
      throw new ForbiddenException('CHRO must have MFA enabled to apply legacy XP corrections')
    }

    const isValidMfa = verifyTotpCode(employee.mfaSecret, mfaCode)
    if (!isValidMfa) {
      throw new ForbiddenException('Invalid MFA verification code')
    }

    const preview = await this.getLegacyCorrectionsPreview()
    const appliedEvents: any[] = []

    await this.prisma.$transaction(async (tx) => {
      for (const item of preview.corrections) {
        const event = await this.appendEvent(
          {
            employeeId: item.employeeId,
            delta: item.deltaCorrection,
            eventType: 'ADJUSTMENT',
            reason: `CHRO-approved correction for legacy context-discounted XP on task ${item.taskId} (${item.context})`,
            taskId: item.taskId,
            awardedById: actor.id,
          },
          tx,
        )
        appliedEvents.push(event)
      }
    })

    return {
      success: true,
      appliedCount: appliedEvents.length,
      totalXpAdjusted: preview.totalXpAdjustment,
    }
  }
}

