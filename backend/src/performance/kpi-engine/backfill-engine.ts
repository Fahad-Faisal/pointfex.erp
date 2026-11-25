import {
  DecideBackfillInput,
  DecideBackfillResult,
} from './types'

/**
 * Evaluates whether a proposed task or evaluation submission can be backdated to effectiveAt.
 *
 * Rules:
 * 1. Standard Realtime: If effectiveAt >= now, allowed unconditionally for any permitted actor.
 * 2. PM Grace Window:
 *    - Allowed only while an active BackfillWindow for 'pm' covers the current time (now <= endsAt, inclusive).
 *    - Allowed ONLY for members of the PM's squad (squadMemberIds).
 *    - Self-backfill is strictly DENIED (SOD-TASK).
 * 3. Post-Window / Executive Overrides:
 *    - CHRO: Allowed anytime, but strictly requires fresh MFA AND written justification.
 *    - CEO: Allowed anytime, but strictly requires fresh MFA (justification bypassed per CEO supreme override policy).
 * 4. All other roles: Denied.
 */
export function decideBackfill(input: DecideBackfillInput): DecideBackfillResult {
  const { actor, subjectUserId, effectiveAt, now, windows, mfaFresh, reasonProvided } = input

  // Boundary check: is this submission actually backdated?
  if (effectiveAt.getTime() >= now.getTime()) {
    return {
      allowed: true,
      via: 'STANDARD_REALTIME',
    }
  }

  const role = (actor.role || '').toLowerCase()

  // PM Grace Window Path
  if (role === 'pm') {
    // 1. Self-backfill prohibition
    if (actor.userId === subjectUserId) {
      return {
        allowed: false,
        denyReason: 'PM self-backfill is strictly prohibited: you cannot backfill deliverables for yourself',
      }
    }

    // 2. Squad membership check
    if (!actor.squadMemberIds || !actor.squadMemberIds.includes(subjectUserId)) {
      return {
        allowed: false,
        denyReason: `PM may only backfill deliverables for developers in their assigned squads (Subject ${subjectUserId} not in squad)`,
      }
    }

    // 3. Active Window check
    const activeWindow = windows.find((w) => {
      if (!w.isActive || w.grantedRole.toLowerCase() !== 'pm') return false
      const startsAtMillis = new Date(w.startsAt).getTime()
      const endsAtMillis = new Date(w.endsAt).getTime()
      const nowMillis = now.getTime()
      return nowMillis >= startsAtMillis && nowMillis <= endsAtMillis
    })

    if (!activeWindow) {
      return {
        allowed: false,
        denyReason: 'Backfill grace window has closed for PM role. Contact CHRO or CEO for executive override.',
      }
    }

    return {
      allowed: true,
      via: 'PM_WINDOW',
      windowId: activeWindow.id,
    }
  }

  // CHRO Universal Override Path
  if (role === 'chro') {
    if (!mfaFresh) {
      return {
        allowed: false,
        denyReason: 'CHRO backfill requires fresh MFA authentication',
      }
    }
    if (!reasonProvided) {
      return {
        allowed: false,
        denyReason: 'CHRO backfill requires documented written justification (min 10 characters)',
      }
    }

    return {
      allowed: true,
      via: 'CHRO',
    }
  }

  // CEO Supreme Override Path
  if (role === 'ceo') {
    if (!mfaFresh) {
      return {
        allowed: false,
        denyReason: 'CEO supreme backfill override requires fresh 6-digit MFA authentication',
      }
    }

    return {
      allowed: true,
      via: 'CEO',
    }
  }

  return {
    allowed: false,
    denyReason: `Role "${actor.role}" is not authorized to submit past-dated records`,
  }
}

