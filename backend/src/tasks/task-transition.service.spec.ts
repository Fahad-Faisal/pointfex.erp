import { TaskTransitionService, TaskState } from './task-transition.service'
import { ConflictException } from '@nestjs/common'

describe('TaskTransitionService (Server-Enforced Lifecycle State Machine)', () => {
  let service: TaskTransitionService

  beforeEach(() => {
    service = new TaskTransitionService()
  })

  const ALL_STATES: TaskState[] = [
    'DRAFT',
    'ASSIGNED',
    'IN_PROGRESS',
    'IN_REVIEW',
    'RETURNED',
    'COMPLETED',
    'CANCELLED',
  ]

  const ROLES = ['developer', 'pm', 'cto', 'cpo', 'cfo', 'chro', 'ceo']

  // Table of all allowed transitions and roles that may execute them
  const ALLOWED_MATRIX: Record<string, string[]> = {
    'DRAFT->ASSIGNED': ['pm', 'cto', 'cpo', 'cfo', 'chro', 'ceo'],
    'DRAFT->CANCELLED': ['pm', 'cto', 'cpo', 'cfo', 'chro', 'ceo'],
    'ASSIGNED->IN_PROGRESS': ['developer', 'pm', 'cto', 'cpo', 'cfo', 'chro', 'ceo'],
    'ASSIGNED->CANCELLED': ['pm', 'cto', 'cpo', 'cfo', 'chro', 'ceo'],
    'IN_PROGRESS->IN_REVIEW': ['developer', 'pm', 'cto', 'cpo', 'cfo', 'chro', 'ceo'],
    'IN_PROGRESS->CANCELLED': ['pm', 'cto', 'cpo', 'cfo', 'chro', 'ceo'],
    'IN_REVIEW->COMPLETED': ['pm', 'cto', 'cpo', 'cfo', 'chro', 'ceo'],
    'IN_REVIEW->RETURNED': ['pm', 'cto', 'cpo', 'cfo', 'chro', 'ceo'],
    'IN_REVIEW->CANCELLED': ['pm', 'cto', 'cpo', 'cfo', 'chro', 'ceo'],
    'RETURNED->IN_PROGRESS': ['developer', 'pm', 'cto', 'cpo', 'cfo', 'chro', 'ceo'],
    'RETURNED->CANCELLED': ['pm', 'cto', 'cpo', 'cfo', 'chro', 'ceo'],
  }

  describe('Comprehensive Table-Driven Combinatorial Matrix Test', () => {
    for (const from of ALL_STATES) {
      for (const to of ALL_STATES) {
        for (const role of ROLES) {
          const key = `${from}->${to}`
          const isAllowedForRole = from === to || (ALLOWED_MATRIX[key] && ALLOWED_MATRIX[key].includes(role))

          it(`verifies transition ${from} -> ${to} by ${role} is ${isAllowedForRole ? 'ALLOWED' : 'PROHIBITED'}`, () => {
            if (isAllowedForRole) {
              expect(service.canTransition(from, to, role)).toBe(true)
              const res = service.validateTransition(from, to, role)
              expect(res.from).toBe(from)
              expect(res.to).toBe(to)
            } else {
              expect(service.canTransition(from, to, role)).toBe(false)
              expect(() => service.validateTransition(from, to, role)).toThrow(ConflictException)
            }
          })
        }
      }
    }
  })

  describe('Terminal State Immutability', () => {
    it('strictly forbids any transition out of COMPLETED', () => {
      for (const target of ALL_STATES) {
        if (target === 'COMPLETED') continue
        expect(() => service.validateTransition('COMPLETED', target, 'ceo')).toThrow(ConflictException)
        try {
          service.validateTransition('COMPLETED', target, 'ceo')
        } catch (err: any) {
          expect(err.getResponse().errorCode).toBe('ILLEGAL_TRANSITION_TERMINAL_STATE')
        }
      }
    })

    it('strictly forbids any transition out of CANCELLED', () => {
      for (const target of ALL_STATES) {
        if (target === 'CANCELLED') continue
        expect(() => service.validateTransition('CANCELLED', target, 'ceo')).toThrow(ConflictException)
        try {
          service.validateTransition('CANCELLED', target, 'ceo')
        } catch (err: any) {
          expect(err.getResponse().errorCode).toBe('ILLEGAL_TRANSITION_TERMINAL_STATE')
        }
      }
    })
  })

  describe('Legacy String State Normalization', () => {
    it('normalizes todo to ASSIGNED', () => {
      expect(service.normalizeState('todo')).toBe('ASSIGNED')
      expect(service.normalizeState('TODO')).toBe('ASSIGNED')
    })

    it('normalizes under_review to IN_REVIEW', () => {
      expect(service.normalizeState('under_review')).toBe('IN_REVIEW')
      expect(service.normalizeState('UNDER_REVIEW')).toBe('IN_REVIEW')
    })
  })
})

