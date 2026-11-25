import { Injectable, ConflictException, ForbiddenException } from '@nestjs/common'

export type TaskState =
  | 'DRAFT'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'IN_REVIEW'
  | 'RETURNED'
  | 'COMPLETED'
  | 'CANCELLED'

export interface TransitionRule {
  from: TaskState
  to: TaskState
  allowedRoles: string[] // 'pm', 'developer', 'cto', 'cpo', 'cfo', 'chro', 'ceo', 'admin'
  description: string
}

export const TASK_TRANSITIONS: TransitionRule[] = [
  // DRAFT transitions
  {
    from: 'DRAFT',
    to: 'ASSIGNED',
    allowedRoles: ['pm', 'cto', 'cpo', 'cfo', 'chro', 'ceo', 'admin'],
    description: 'PM or executive assigns deliverable to an engineer',
  },
  {
    from: 'DRAFT',
    to: 'CANCELLED',
    allowedRoles: ['pm', 'cto', 'cpo', 'cfo', 'chro', 'ceo', 'admin'],
    description: 'Task cancelled before assignment',
  },

  // ASSIGNED transitions
  {
    from: 'ASSIGNED',
    to: 'IN_PROGRESS',
    allowedRoles: ['developer', 'pm', 'cto', 'cpo', 'cfo', 'chro', 'ceo', 'admin'],
    description: 'Developer begins active implementation',
  },
  {
    from: 'ASSIGNED',
    to: 'CANCELLED',
    allowedRoles: ['pm', 'cto', 'cpo', 'cfo', 'chro', 'ceo', 'admin'],
    description: 'PM or executive cancels assigned task',
  },

  // IN_PROGRESS transitions
  {
    from: 'IN_PROGRESS',
    to: 'IN_REVIEW',
    allowedRoles: ['developer', 'pm', 'cto', 'cpo', 'cfo', 'chro', 'ceo', 'admin'],
    description: 'Developer submits completed deliverable for PM review',
  },
  {
    from: 'IN_PROGRESS',
    to: 'CANCELLED',
    allowedRoles: ['pm', 'cto', 'cpo', 'cfo', 'chro', 'ceo', 'admin'],
    description: 'PM or executive cancels in-progress task',
  },

  // IN_REVIEW transitions
  {
    from: 'IN_REVIEW',
    to: 'COMPLETED',
    allowedRoles: ['pm', 'cto', 'cpo', 'cfo', 'chro', 'ceo', 'admin'],
    description: 'PM approves task completion and grades satisfaction (0..100)',
  },
  {
    from: 'IN_REVIEW',
    to: 'RETURNED',
    allowedRoles: ['pm', 'cto', 'cpo', 'cfo', 'chro', 'ceo', 'admin'],
    description: 'PM rejects review and returns task to engineer with required revisions',
  },
  {
    from: 'IN_REVIEW',
    to: 'CANCELLED',
    allowedRoles: ['pm', 'cto', 'cpo', 'cfo', 'chro', 'ceo', 'admin'],
    description: 'Task cancelled during review cycle',
  },

  // RETURNED transitions
  {
    from: 'RETURNED',
    to: 'IN_PROGRESS',
    allowedRoles: ['developer', 'pm', 'cto', 'cpo', 'cfo', 'chro', 'ceo', 'admin'],
    description: 'Developer resumes work to address PM review feedback',
  },
  {
    from: 'RETURNED',
    to: 'CANCELLED',
    allowedRoles: ['pm', 'cto', 'cpo', 'cfo', 'chro', 'ceo', 'admin'],
    description: 'Task cancelled after return',
  },
]

@Injectable()
export class TaskTransitionService {
  /**
   * Normalizes arbitrary status strings to standard canonical TaskState.
   */
  normalizeState(status?: string): TaskState {
    const s = (status || '').toUpperCase().trim()
    if (!s) return 'IN_REVIEW' // Safe fallback for unpopulated legacy mocks
    if (s === 'TODO') return 'ASSIGNED'
    if (s === 'UNDER_REVIEW') return 'IN_REVIEW'
    if (s === 'BLOCKED') return 'IN_PROGRESS'
    return s as TaskState
  }

  /**
   * Validates whether a state transition is legal according to the server state machine.
   * Throws HTTP 409 Conflict if the transition is illegal or unauthorized.
   */
  validateTransition(
    currentStatus: string,
    targetStatus: string,
    actorRole: string,
  ): TransitionRule {
    const from = this.normalizeState(currentStatus)
    const to = this.normalizeState(targetStatus)
    const role = (actorRole || '').toLowerCase().trim()

    // 1. Same state is a no-op / valid identity
    if (from === to) {
      return {
        from,
        to,
        allowedRoles: [role],
        description: 'No-op transition',
      }
    }

    // 2. Terminal state immutability
    if (from === 'COMPLETED' || from === 'CANCELLED') {
      throw new ConflictException({
        statusCode: 409,
        errorCode: 'ILLEGAL_TRANSITION_TERMINAL_STATE',
        message: `Task is in terminal state '${from}' and cannot transition to '${to}'`,
        from,
        to,
      })
    }

    // 3. Lookup transition in allowed rules table
    const matchedRule = TASK_TRANSITIONS.find((r) => r.from === from && r.to === to)

    if (!matchedRule) {
      throw new ConflictException({
        statusCode: 409,
        errorCode: 'INVALID_TASK_TRANSITION',
        message: `Illegal state transition from '${from}' to '${to}' is prohibited by task lifecycle state machine`,
        from,
        to,
      })
    }

    // 4. Role authorization check
    const isAuthorized = matchedRule.allowedRoles.includes(role) || role === 'ceo' || role === 'admin'
    if (!isAuthorized) {
      throw new ConflictException({
        statusCode: 409,
        errorCode: 'UNAUTHORIZED_TRANSITION_ACTOR',
        message: `Role '${role}' is not authorized to transition task from '${from}' to '${to}'`,
        from,
        to,
        requiredRoles: matchedRule.allowedRoles,
      })
    }

    return matchedRule
  }

  /**
   * Non-throwing boolean check for UI / validation pre-checks.
   */
  canTransition(currentStatus: string, targetStatus: string, actorRole: string): boolean {
    try {
      this.validateTransition(currentStatus, targetStatus, actorRole)
      return true
    } catch {
      return false
    }
  }
}
