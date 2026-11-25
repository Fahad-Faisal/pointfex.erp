import { Test, TestingModule } from '@nestjs/testing'
import { TasksService } from './tasks.service'
import { PrismaService } from '../common/prisma.service'
import { ForbiddenException } from '@nestjs/common'
import { Prisma } from '@prisma/client'

describe('TasksService - Kanban State Transitions & Approval Gate', () => {
  let service: TasksService
  let prisma: any

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn((callback) => callback(prisma)),
      task: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      taskComment: {
        create: jest.fn(),
      },
      employeeWallet: {
        upsert: jest.fn(),
      },
      financialTransaction: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      companyTreasury: {
        update: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      performanceRecord: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'perf_01' }),
        update: jest.fn().mockResolvedValue({ id: 'perf_01' }),
      },
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [TasksService, { provide: PrismaService, useValue: prisma }],
    }).compile()

    service = module.get<TasksService>(TasksService)
  })

  describe('Developer Permission Gate on Completed Status', () => {
    it('should throw ForbiddenException if a developer attempts to mark a task as completed', async () => {
      prisma.task.findUnique.mockResolvedValue({
        id: 'task_01',
        title: 'Build GIS Component',
        status: 'in_review',
        assignee: { id: 'emp_dev_01' },
      })

      // Developer tries to mark completed directly
      await expect(
        service.updateStatus(
          'task_01',
          { status: 'completed' },
          { id: 'emp_dev_01', role: 'developer' },
        ),
      ).rejects.toThrow(ForbiddenException)
    })

    it('should allow developer to transition task to in_review', async () => {
      prisma.task.findUnique.mockResolvedValue({
        id: 'task_01',
        title: 'Build GIS Component',
        status: 'in_progress',
      })
      prisma.task.update.mockResolvedValue({
        id: 'task_01',
        status: 'in_review',
      })

      const res = await service.updateStatus(
        'task_01',
        { status: 'in_review' },
        { id: 'emp_dev_01', role: 'developer' },
      )

      expect(res.status).toBe('in_review')
    })
  })

  describe('Task Approval & Milestone Payout Flow', () => {
    it('should complete task, credit developer wallet, and log double-entry transaction', async () => {
      prisma.task.findUnique.mockResolvedValue({
        id: 'task_01',
        title: 'Build GIS Component',
        projectId: 'proj_01',
        assigneeId: 'emp_dev_01',
        status: 'in_review',
        milestone: {
          id: 'ms_01',
          payoutAmount: new Prisma.Decimal(8000),
        },
      })
      prisma.task.update.mockResolvedValue({
        id: 'task_01',
        status: 'completed',
      })
      prisma.financialTransaction.findFirst.mockResolvedValue(null) // No prior payout

      const res = await service.approve(
        'task_01',
        { feedback: 'Excellent delivery and test coverage' },
        { id: 'emp_pm_01', role: 'pm' },
      )

      expect(res.status).toBe('completed')
      expect(prisma.taskComment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            content: expect.stringContaining('Excellent delivery'),
          }),
        }),
      )
      expect(prisma.employeeWallet.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { employeeId: 'emp_dev_01' },
          update: expect.objectContaining({
            balance: { increment: new Prisma.Decimal(8000) },
          }),
        }),
      )
      expect(prisma.financialTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'milestone_payout',
            amount: new Prisma.Decimal(8000),
          }),
        }),
      )
    })
  })

  describe('Task Rejection Flow', () => {
    it('should return task to in_progress and record review feedback', async () => {
      prisma.task.findUnique.mockResolvedValue({
        id: 'task_01',
        title: 'Build GIS Component',
        status: 'in_review',
      })
      prisma.task.update.mockResolvedValue({
        id: 'task_01',
        status: 'in_progress',
      })

      const res = await service.reject(
        'task_01',
        { feedback: 'Fix mobile viewport layout shift before approval' },
        { id: 'emp_pm_01', role: 'pm' },
      )

      expect(res.status).toBe('in_progress')
      expect(prisma.taskComment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            content: expect.stringContaining('Fix mobile viewport'),
          }),
        }),
      )
    })
  })

  describe('Assigned Squad PM Task Operations & KPI Scoring', () => {
    it('should allow an assigned squad PM (even with base role developer) to create task with weight and assign to squad member', async () => {
      prisma.project = { findUnique: jest.fn().mockResolvedValue({ id: 'proj_01' }) }
      prisma.employee = { findUnique: jest.fn().mockResolvedValue({ id: 'emp_dev_02' }) }
      prisma.teamMembership = { findFirst: jest.fn().mockResolvedValue({ id: 'tm_1' }) }
      prisma.task.create = jest.fn().mockResolvedValue({
        id: 'task_new_01',
        title: 'Squad Feature',
        weightCategory: 'LARGE',
        weightPoints: new Prisma.Decimal(3),
        assigneeId: 'emp_dev_02',
      })

      await service.create(
        {
          title: 'Squad Feature',
          projectId: 'proj_01',
          assigneeId: 'emp_dev_02',
          weightCategory: 'LARGE',
          proposedWeight: 3,
        },
        { id: 'emp_dev_01', role: 'developer' } as any,
      )

      expect(prisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            weightCategory: 'LARGE',
            weightPoints: new Prisma.Decimal(3),
            assigneeId: 'emp_dev_02',
          }),
        }),
      )
    })

    it('should allow an assigned squad PM to approve task deliverable and set pmScore', async () => {
      prisma.teamMembership = { findFirst: jest.fn().mockResolvedValue({ id: 'tm_1' }) }
      prisma.task.findUnique.mockResolvedValue({
        id: 'task_02',
        title: 'Squad Deliverable',
        assigneeId: 'emp_dev_02',
        status: 'in_review',
        assignee: { id: 'emp_dev_02', title: 'Software Developer' },
      })
      prisma.task.update.mockResolvedValue({
        id: 'task_02',
        status: 'completed',
        pmScore: new Prisma.Decimal(88),
      })

      await service.approve(
        'task_02',
        { pmScore: 88, feedback: 'Great work on deliverable' },
        { id: 'emp_dev_01', role: 'developer' } as any,
      )

      expect(prisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'task_02' },
          data: expect.objectContaining({
            status: 'completed',
            pmScore: new Prisma.Decimal(88),
          }),
        }),
      )
    })

    it('should allow evaluating and updating KPI score on a completed task', async () => {
      prisma.task.findUnique.mockResolvedValue({
        id: 'task_02',
        title: 'Completed Task',
        assigneeId: 'emp_dev_02',
        status: 'completed',
        completedAt: new Date(),
        assignee: { id: 'emp_dev_02', title: 'Software Developer' },
      })
      prisma.task.findMany = jest.fn().mockResolvedValue([])
      prisma.task.update.mockResolvedValue({
        id: 'task_02',
        status: 'completed',
        pmScore: new Prisma.Decimal(92),
      })
      prisma.weeklyKpiRecord = { upsert: jest.fn().mockResolvedValue({}) }

      await service.scoreTaskDirectly(
        'task_02',
        92,
        'Post-completion KPI evaluation',
        { id: 'emp_dev_01', role: 'developer' } as any,
      )

      expect(prisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'task_02' },
          data: expect.objectContaining({
            pmScore: new Prisma.Decimal(92),
            status: 'completed',
          }),
        }),
      )
    })

    it('should persist projectId, tags, title, description, priority, and unchanged past dueDate on task update', async () => {
      const existingDueDate = new Date('2025-01-10T00:00:00.000Z')
      prisma.project = {
        findUnique: jest.fn().mockResolvedValue({ id: 'proj_02' }),
      }
      prisma.task.findUnique.mockResolvedValue({
        id: 'task_personal_01',
        title: 'Old Title',
        projectId: 'proj_01',
        dueDate: existingDueDate,
        ceoFinalized: false,
        isMainProjectTask: false,
      })
      prisma.task.update.mockResolvedValue({
        id: 'task_personal_01',
        title: 'Updated Security Hardening',
        projectId: 'proj_02',
        tags: ['Architecture', 'SOC2'],
      })

      const res = await service.update(
        'task_personal_01',
        {
          title: 'Updated Security Hardening',
          description: 'Revised scope and milestones',
          priority: 'high',
          projectId: 'proj_02',
          tags: ['Architecture', 'SOC2'],
          dueDate: existingDueDate.toISOString(),
        },
        { id: 'emp_cto_01', role: 'cto' } as any,
      )

      expect(res.projectId).toBe('proj_02')
      expect(prisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'task_personal_01' },
          data: expect.objectContaining({
            title: 'Updated Security Hardening',
            description: 'Revised scope and milestones',
            priority: 'high',
            projectId: 'proj_02',
            tags: ['Architecture', 'SOC2'],
          }),
        }),
      )
    })
  })
})
