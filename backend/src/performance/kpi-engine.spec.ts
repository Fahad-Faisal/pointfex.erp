import { Test, TestingModule } from '@nestjs/testing'
import { KpiEngineService } from './kpi-engine.service'
import { PrismaService } from '../common/prisma.service'
import { Prisma } from '@prisma/client'

describe('KpiEngineService - Dual-Metric Governance & Mathematical Formulas', () => {
  let service: KpiEngineService
  let prisma: any

  const mockActor: any = {
    id: 'emp_chro_01',
    role: 'chro',
    email: 'chro@pointfex.com',
  }

  beforeEach(async () => {
    prisma = {
      employee: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      weeklyKpiRecord: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      taskWeightVerification: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        upsert: jest.fn(),
      },
      projectMilestone: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      teamMembership: {
        findFirst: jest.fn(),
      },
      team: {
        findMany: jest.fn(),
      },
      task: {
        count: jest.fn(),
      },
      xpLedgerEntry: {
        create: jest.fn(),
      },
      taskWeightConsensusVote: {
        upsert: jest.fn(),
        findMany: jest.fn(),
      },
      kpiXpAuditLog: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      auditAnnotation: {
        create: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(prisma)),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [KpiEngineService, { provide: PrismaService, useValue: prisma }],
    }).compile()

    service = module.get<KpiEngineService>(KpiEngineService)
  })

  describe('1. Developer Level 1 Evaluation', () => {
    it('should flag N/A Red Flag if developer completes zero tasks in a week', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        id: 'emp_dev_01',
        assignedTasks: [],
      })

      prisma.weeklyKpiRecord.upsert.mockResolvedValue({
        id: 'kpi_01',
        employeeId: 'emp_dev_01',
        score: null,
        isInactive: true,
        inactivityPenaltyPending: true,
      })

      prisma.kpiXpAuditLog.findFirst.mockResolvedValue(null)
      prisma.kpiXpAuditLog.create.mockResolvedValue({ id: 'audit_01' })

      const result = await service.calculateDeveloperWeeklyKpi('emp_dev_01', 46, 2026)

      expect(result.isInactive).toBe(true)
      expect(result.score).toBeNull()
      expect(prisma.kpiXpAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actionType: 'INACTIVITY_PENALTY',
            authorizedRole: 'SYSTEM',
          }),
        }),
      )
    })

    it('should calculate weighted score based on task weights and squad context (100% main, 70% outside)', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        id: 'emp_dev_01',
        assignedTasks: [
          {
            id: 't1',
            title: 'Main Squad Feature',
            weightVerification: { approvedWeight: new Prisma.Decimal(5), context: 'MAIN_SQUAD' },
          },
          {
            id: 't2',
            title: 'Outside Squad Bugfix',
            weightVerification: { approvedWeight: new Prisma.Decimal(3), context: 'OUTSIDE_SQUAD' },
          },
        ],
      })

      prisma.weeklyKpiRecord.upsert.mockImplementation(({ create }) => create)
      prisma.kpiXpAuditLog.findFirst.mockResolvedValue(null)
      prisma.kpiXpAuditLog.create.mockResolvedValue({ id: 'audit_02' })

      const result = await service.calculateDeveloperWeeklyKpi('emp_dev_01', 46, 2026, mockActor)

      expect(result.isInactive).toBe(false)
      expect(Number(result.score)).toBeGreaterThan(0)
      expect(result.evaluationStatus).toBe('PROVISIONAL')
    })
  })

  describe('2. Project Manager Level 2 Evaluation', () => {
    it('should calculate PM score from 30% CTO + 30% CPO + 20% CFO + 20% CHRO', async () => {
      prisma.weeklyKpiRecord.upsert.mockImplementation(({ create }) => create)
      prisma.kpiXpAuditLog.findFirst.mockResolvedValue(null)
      prisma.kpiXpAuditLog.create.mockResolvedValue({ id: 'audit_03' })

      // CTO=90, CPO=90, CFO=80, CHRO=80 -> (90*0.3)+(90*0.3)+(80*0.2)+(80*0.2) = 27 + 27 + 16 + 16 = 86
      const result = await service.calculatePmWeeklyKpi('emp_pm_01', 46, 2026, {
        ctoScore: 90,
        cpoScore: 90,
        cfoScore: 80,
        chroScore: 80,
      })

      expect(Number(result.score)).toBe(86.0)
      expect(result.evaluationStatus).toBe('CONFIRMED')
    })
  })

  describe('3. CHRO Disciplinary Deduction', () => {
    it('should deduct points and record immutable audit trail', async () => {
      prisma.weeklyKpiRecord.findFirst.mockResolvedValue({
        id: 'kpi_current',
        score: new Prisma.Decimal(95),
        evaluationBreakdown: {},
      })
      prisma.weeklyKpiRecord.update.mockResolvedValue({})
      prisma.kpiXpAuditLog.findFirst.mockResolvedValue(null)
      prisma.kpiXpAuditLog.create.mockResolvedValue({ id: 'audit_disc' })

      const result = await service.applyDisciplinaryDeduction(
        'emp_dev_01',
        15,
        'Unauthorized prod access',
        mockActor,
      )

      expect(result.success).toBe(true)
      expect(result.previousScore).toBe(95)
      expect(result.newScore).toBe(80)
      expect(prisma.kpiXpAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actionType: 'CHRO_DISCIPLINARY',
            authorizedRole: 'CHRO',
            deltaValue: new Prisma.Decimal(-15),
          }),
        }),
      )
    })
  })

  describe('4. Massive XP Consensus Gate', () => {
    it('should freeze payout for weight >= 50 and unfreeze upon 2 C-Level votes for completed task', async () => {
      prisma.taskWeightVerification.findUnique.mockResolvedValue({
        id: 'verif_massive',
        proposedWeight: new Prisma.Decimal(60), // 60 weight = 600 XP (Massive)
        approvedWeight: new Prisma.Decimal(60),
        massiveXpFrozen: true,
        task: { id: 't_massive', assigneeId: 'emp_dev_01', title: 'Core Migration', status: 'completed' },
        proposerId: 'emp_pm_01',
      })

      prisma.taskWeightConsensusVote.upsert.mockResolvedValue({})
      prisma.taskWeightConsensusVote.findMany.mockResolvedValue([
        { id: 'v1', executiveId: 'emp_cto_01', decision: 'APPROVE' },
        { id: 'v2', executiveId: 'emp_cpo_01', decision: 'APPROVE' },
      ])

      prisma.kpiXpAuditLog.findFirst.mockResolvedValue(null)
      prisma.kpiXpAuditLog.create.mockResolvedValue({ id: 'audit_unfreeze' })

      const ctoActor: any = { id: 'emp_cto_01', role: 'cto' }
      const result = await service.castConsensusVote('verif_massive', ctoActor, 'APPROVE')

      expect(result.status).toBe('UNFROZEN')
      expect(result.approvalsCount).toBe(2)
      expect(result.xpYield).toBe(600)
    })

    it('should unfreeze without prematurely disbursing XP if task is still in_progress', async () => {
      prisma.taskWeightVerification.findUnique.mockResolvedValue({
        id: 'verif_massive',
        proposedWeight: new Prisma.Decimal(60),
        approvedWeight: new Prisma.Decimal(60),
        massiveXpFrozen: true,
        task: { id: 't_massive', assigneeId: 'emp_dev_01', title: 'Core Migration', status: 'in_progress' },
        proposerId: 'emp_pm_01',
      })

      prisma.taskWeightConsensusVote.upsert.mockResolvedValue({})
      prisma.taskWeightConsensusVote.findMany.mockResolvedValue([
        { id: 'v1', executiveId: 'emp_cto_01', decision: 'APPROVE' },
        { id: 'v2', executiveId: 'emp_cpo_01', decision: 'APPROVE' },
      ])

      const ctoActor: any = { id: 'emp_cto_01', role: 'cto' }
      const result = await service.castConsensusVote('verif_massive', ctoActor, 'APPROVE')

      expect(result.status).toBe('UNFROZEN')
      expect(prisma.employee.update).not.toHaveBeenCalled()
    })

    it('should prevent the task assignee from voting on their own payout', async () => {
      prisma.taskWeightVerification.findUnique.mockResolvedValue({
        id: 'verif_massive',
        task: { id: 't_massive', assigneeId: 'emp_dev_01' },
        proposerId: 'emp_pm_01',
      })

      const devActor: any = { id: 'emp_dev_01', role: 'developer' }
      await expect(
        service.castConsensusVote('verif_massive', devActor, 'APPROVE'),
      ).rejects.toThrow('Task assignee cannot vote on their own massive XP payout')
    })
  })

  describe('5. Return-to-Work Inactivity Penalty', () => {
    it('should deduct 10 points when returning from an inactive week', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        id: 'emp_dev_01',
        assignedTasks: [
          {
            id: 't1',
            title: 'Welcome Back Task',
            weightVerification: { approvedWeight: new Prisma.Decimal(5), context: 'MAIN_SQUAD' },
          },
        ],
      })

      // Mock pending penalty record from previous week
      prisma.weeklyKpiRecord.findFirst.mockResolvedValue({
        id: 'prev_inactive_kpi',
        employeeId: 'emp_dev_01',
        inactivityPenaltyPending: true,
      })
      prisma.weeklyKpiRecord.upsert.mockImplementation(({ create, update }) => create || update)
      prisma.kpiXpAuditLog.findFirst.mockResolvedValue(null)
      prisma.kpiXpAuditLog.create.mockResolvedValue({ id: 'audit_penalty' })

      const result = await service.calculateDeveloperWeeklyKpi('emp_dev_01', 47, 2026)

      expect(prisma.weeklyKpiRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'prev_inactive_kpi' },
          data: expect.objectContaining({
            inactivityPenaltyPending: false,
            inactivityPenaltyApplied: true,
          }),
        }),
      )
      // Base score is 90, minus 10 penalty = 80
      expect(Number(result.score)).toBe(80)
    })
  })

  describe('6. Executive Read-Receipt Review Gate', () => {
    it('should allow C-Suite executive to confirm weekly evaluation and log audit', async () => {
      prisma.weeklyKpiRecord.findUnique.mockResolvedValue({
        id: 'rec_provisional',
        employeeId: 'emp_dev_01',
        weekNumber: 45,
        year: 2026,
        score: new Prisma.Decimal(90),
        evaluationBreakdown: {},
      })
      prisma.weeklyKpiRecord.update.mockResolvedValue({
        id: 'rec_provisional',
        evaluationStatus: 'CONFIRMED',
      })
      prisma.kpiXpAuditLog.findFirst.mockResolvedValue(null)
      prisma.kpiXpAuditLog.create.mockResolvedValue({ id: 'audit_exec' })

      const ctoActor: any = { id: 'emp_cto_01', role: 'cto' }
      const res = await service.confirmExecutiveReview('rec_provisional', ctoActor, {
        overrideScore: 92,
        notes: 'Exceptional architectural delivery verified',
      })

      expect(res.evaluationStatus).toBe('CONFIRMED')
      expect(prisma.kpiXpAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actionType: 'WEEKLY_KPI_FINAL',
            authorizedRole: 'CTO',
          }),
        }),
      )
    })

    it('should throw ForbiddenException if a non-executive tries to confirm review', async () => {
      const devActor: any = { id: 'emp_dev_01', role: 'developer' }
      await expect(
        service.confirmExecutiveReview('rec_provisional', devActor),
      ).rejects.toThrow('Only C-Suite executives can confirm weekly evaluations')
    })
  })

  describe('7. Task & Milestone Weight Proposals (PM & C-Level)', () => {
    it('should allow PM to propose weight which remains PENDING_CHRO', async () => {
      prisma.taskWeightVerification.upsert.mockImplementation(({ create, update }) => create || update)
      const pmActor: any = { id: 'emp_pm_01', role: 'pm' }

      const res = await service.proposeTaskWeight({
        taskId: 'task_123',
        proposedWeight: 5,
        category: 'LARGE',
        context: 'MAIN_SQUAD',
        actor: pmActor,
      })

      expect(res.status).toBe('PENDING_CHRO')
      expect(res.proposerId).toBe('emp_pm_01')
      expect(Number(res.proposedWeight)).toBe(5)
    })

    it('should mark massive XP as frozen if proposed weight >= 50', async () => {
      prisma.taskWeightVerification.upsert.mockImplementation(({ create, update }) => create || update)
      const pmActor: any = { id: 'emp_pm_01', role: 'pm' }

      const res = await service.proposeTaskWeight({
        taskId: 'task_massive',
        proposedWeight: 60,
        category: 'CRITICAL',
        actor: pmActor,
      })

      expect(res.isMassiveXp).toBe(true)
      expect(res.massiveXpFrozen).toBe(true)
    })

    it('should auto-approve weight if proposed by C-Level or CEO', async () => {
      prisma.taskWeightVerification.upsert.mockImplementation(({ create, update }) => create || update)
      const ctoActor: any = { id: 'emp_cto_01', role: 'cto' }

      const res = await service.proposeTaskWeight({
        taskId: 'task_exec',
        proposedWeight: 4,
        category: 'MEDIUM',
        actor: ctoActor,
      })

      expect(res.status).toBe('APPROVED')
      expect(Number(res.approvedWeight)).toBe(4)
    })
  })

  describe('8. Macro Project Milestones XP Award for PMs', () => {
    it('should award 10x verified milestone weight XP to project PM upon C-Level approval', async () => {
      prisma.projectMilestone.findUnique.mockResolvedValue({
        id: 'ms_01',
        title: 'Core Engine Alpha',
        weightVerification: { approvedWeight: new Prisma.Decimal(20) },
        project: {
          teamProjects: [
            {
              team: {
                pmPosition: {
                  assignments: [{ employee: { id: 'emp_pm_01', lifetimeXp: 1500 } }],
                },
                memberships: [],
              },
            },
          ],
        },
      })
      prisma.employee.update.mockResolvedValue({ id: 'emp_pm_01', lifetimeXp: 1700 })
      prisma.xpLedgerEntry = { create: jest.fn().mockResolvedValue({}) }
      prisma.kpiXpAuditLog.findFirst.mockResolvedValue(null)
      prisma.kpiXpAuditLog.create.mockResolvedValue({ id: 'audit_ms' })

      const ctoActor: any = { id: 'emp_cto_01', role: 'cto' }
      const res = await service.awardMilestoneXpToPm('ms_01', ctoActor)

      expect(res.success).toBe(true)
      expect(res.pmId).toBe('emp_pm_01')
      expect(res.xpYield).toBe(200) // 20 weight * 10 = 200 XP
      expect(prisma.employee.update).toHaveBeenCalledWith({
        where: { id: 'emp_pm_01' },
        data: { lifetimeXp: { increment: 200 } },
      })
    })
  })

  describe('9. Governance Overrides: PM Authority & Squad Isolation', () => {
    it('should allow PM to modify historical KPI for their assigned squad member', async () => {
      // Mock squad membership check
      prisma.teamMembership.findFirst.mockResolvedValue({ id: 'tm_01' })
      prisma.weeklyKpiRecord.findUnique.mockResolvedValue({
        id: 'rec_w45',
        score: new Prisma.Decimal(75),
        evaluationBreakdown: {},
      })
      prisma.weeklyKpiRecord.upsert.mockImplementation(({ create, update }) => create || update)
      prisma.kpiXpAuditLog.findFirst.mockResolvedValue(null)
      prisma.kpiXpAuditLog.create.mockResolvedValue({ id: 'audit_override' })

      const pmActor: any = { id: 'emp_pm_01', role: 'pm' }
      const res = await service.overrideRecord({
        targetEmployeeId: 'emp_dev_01',
        metricType: 'KPI',
        weekNumber: 45,
        year: 2026,
        score: 88,
        reason: 'Retroactive bug fix credit approved',
        actor: pmActor,
      })

      expect(res.success).toBe(true)
      expect(prisma.kpiXpAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metricType: 'KPI',
            authorizedRole: 'PM',
            deltaValue: new Prisma.Decimal('13.00'), // 88 - 75 = 13
          }),
        }),
      )
    })

    it('should reject PM trying to modify records for an employee outside their squad', async () => {
      prisma.teamMembership.findFirst.mockResolvedValue(null) // Not in squad
      const pmActor: any = { id: 'emp_pm_01', role: 'pm' }

      await expect(
        service.overrideRecord({
          targetEmployeeId: 'emp_stranger',
          metricType: 'KPI',
          weekNumber: 45,
          year: 2026,
          score: 90,
          actor: pmActor,
        }),
      ).rejects.toThrow('Project Managers may only edit or modify KPI and XP records for their assigned team members')
    })
  })

  describe('10. Governance Overrides: CHRO Authority', () => {
    it('should allow CHRO to override any user KPI or XP across the company', async () => {
      prisma.employee.findUnique.mockResolvedValue({ id: 'emp_any_01', lifetimeXp: 1200 })
      prisma.employee.update.mockResolvedValue({ id: 'emp_any_01', lifetimeXp: 1500 })
      prisma.xpLedgerEntry = { create: jest.fn().mockResolvedValue({}) }
      prisma.kpiXpAuditLog.findFirst.mockResolvedValue(null)
      prisma.kpiXpAuditLog.create.mockResolvedValue({ id: 'audit_chro_override' })

      const chroActor: any = { id: 'emp_chro_01', role: 'chro' }
      const res = await service.overrideRecord({
        targetEmployeeId: 'emp_any_01',
        metricType: 'XP',
        deltaXp: 300,
        reason: 'Company-wide hackathon winner adjustment',
        actor: chroActor,
      })

      expect(res.success).toBe(true)
      expect(res.newLifetimeXp).toBe(1500)
    })
  })

  describe('11. Governance Overrides: CEO Supreme Authority (Strictly MFA-Only)', () => {
    it('should require 6-digit MFA code for CEO override and reject if missing or malformed', async () => {
      const ceoActor: any = { id: 'emp_ceo_01', email: 'ceo@company.test', role: 'ceo' }

      await expect(
        service.overrideRecord({
          targetEmployeeId: 'emp_dev_01',
          metricType: 'KPI',
          weekNumber: 46,
          year: 2026,
          score: 95,
          actor: ceoActor,
        }),
      ).rejects.toMatchObject({
        response: { code: 'MFA_CODE_REQUIRED' },
      })
    })

    it('should bypass text justification and authorize any record when valid 6-digit MFA code is provided', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        id: 'emp_ceo_01',
        mfaSecret: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
        mfaEnabled: false, // Testing code format validation
      })
      prisma.weeklyKpiRecord.findUnique.mockResolvedValue(null)
      prisma.weeklyKpiRecord.upsert.mockImplementation(({ create }) => create)
      prisma.kpiXpAuditLog.findFirst.mockResolvedValue(null)
      prisma.kpiXpAuditLog.create.mockResolvedValue({ id: 'audit_ceo' })

      const ceoActor: any = { id: 'emp_ceo_01', email: 'ceo@company.test', role: 'ceo' }
      const res = await service.overrideRecord({
        targetEmployeeId: 'emp_dev_01',
        metricType: 'KPI',
        weekNumber: 46,
        year: 2026,
        score: 95,
        mfaCode: '123456',
        actor: ceoActor,
        // Notice: NO text justification reason provided!
      })

      expect(res.success).toBe(true)
      expect(prisma.kpiXpAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            authorizedRole: 'CEO',
            reason: 'Executive CEO authorization', // Automatically bypassed justification!
          }),
        }),
      )
    })
  })

  describe('12. Hierarchical Formulas: Level 3 C-Level & Level 4 CEO Calculations', () => {
    it('should calculate Level 3 C-Level KPI (40% Goals + 30% Domain Avg + 20% CEO + 10% Peer)', async () => {
      prisma.weeklyKpiRecord.findMany.mockResolvedValue([
        { score: new Prisma.Decimal(80) },
        { score: new Prisma.Decimal(90) },
      ]) // Domain avg = 85
      prisma.weeklyKpiRecord.upsert.mockImplementation(({ create, update }) => create || update)

      // 90 * 0.4 (36) + 85 * 0.3 (25.5) + 90 * 0.2 (18) + 80 * 0.1 (8) = 87.5
      const res = await service.calculateCLevelWeeklyKpi(
        'emp_cto_01',
        'CTO',
        46,
        2026,
        90,
        90,
        80,
      )

      expect(Number(res.score)).toBe(87.5)
      expect(res.roleLevel).toBe(3)
    })

    it('should calculate Level 4 CEO KPI (60% Company Performance + 40% C-Level Aggregate)', async () => {
      prisma.weeklyKpiRecord.findMany.mockResolvedValue([
        { score: new Prisma.Decimal(90) },
        { score: new Prisma.Decimal(94) },
      ]) // C-Level aggregate = 92
      prisma.weeklyKpiRecord.upsert.mockImplementation(({ create, update }) => create || update)

      // 95 * 0.6 (57) + 92 * 0.4 (36.8) = 93.8
      const res = await service.calculateCeoWeeklyKpi('emp_ceo_01', 46, 2026, 95)

      expect(Number(res.score)).toBe(93.8)
      expect(res.roleLevel).toBe(4)
    })
  })

  describe('13. Stopgap: Audit Log Annotation (Append-Only Non-Mutating)', () => {
    it('should create an AuditAnnotation row instead of mutating kpi_xp_audit_logs when CHRO annotates', async () => {
      prisma.kpiXpAuditLog.findUnique.mockResolvedValue({
        id: 'log_01',
        employeeId: 'emp_dev_01',
        metricType: 'XP',
        reason: 'Original reason',
      })

      prisma.auditAnnotation.create.mockResolvedValue({
        id: 'annot_01',
        auditLogId: 'log_01',
        authorId: 'emp_chro_01',
        note: 'CHRO annotation explaining verification audit',
      })

      const chroActor: any = { id: 'emp_chro_01', role: 'chro', email: 'chro@pointfex.com' }
      const res = await service.updateAuditLogEntry(
        'log_01',
        { notes: 'CHRO annotation explaining verification audit' },
        chroActor,
      )

      expect(res).toBeDefined()
      expect(res.id).toBe('annot_01')
      expect(prisma.kpiXpAuditLog.update).not.toHaveBeenCalled()
      expect(prisma.auditAnnotation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            auditLogId: 'log_01',
            authorId: 'emp_chro_01',
            note: 'CHRO annotation explaining verification audit',
          }),
        }),
      )
    })

    it('should reject non-executive non-CHRO actors attempting to annotate audit logs', async () => {
      const devActor: any = { id: 'emp_dev_01', role: 'developer', email: 'dev@pointfex.com' }

      await expect(
        service.updateAuditLogEntry('log_01', { notes: 'Dev attempt' }, devActor),
      ).rejects.toThrow('Unauthorized: Only CHRO')
    })
  })
})
