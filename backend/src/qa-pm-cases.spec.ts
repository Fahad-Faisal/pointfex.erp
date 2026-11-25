import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from './common/prisma.service'
import { TasksService } from './tasks/tasks.service'
import { FinanceService } from './finance/finance.service'
import { ReportsService } from './reports/reports.service'
import { ProjectsService } from './projects/projects.service'
import { TeamsService } from './teams/teams.service'
import { Prisma } from '@prisma/client'

describe('PM QA Test Cases End-to-End Verification (Cases 1 - 20)', () => {
  let prismaMock: any
  let tasksService: TasksService
  let financeService: FinanceService
  let reportsService: ReportsService
  let projectsService: ProjectsService
  let teamsService: TeamsService

  const mockPmUser = {
    id: 'emp_pm_01',
    role: 'pm',
    email: 'pm@seu.edu.bd',
    permissions: [
      'tasks:create',
      'tasks:update',
      'tasks:approve',
      'budgets:allocate_project',
      'budgets:request_increase',
      'reports:create',
    ],
  }

  const mockCtoUser = {
    id: 'emp_cto_01',
    role: 'cto',
    email: 'cto@seu.edu.bd',
    permissions: ['tasks:create', 'tasks:update'],
  }

  beforeEach(async () => {
    prismaMock = {
      $transaction: jest.fn((callback) => callback(prismaMock)),
      employee: {
        findUnique: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      team: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      project: {
        findUnique: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      projectMilestone: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      task: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      taskComment: {
        create: jest.fn(),
      },
      taskReviewSubmission: {
        findFirst: jest.fn(),
      },
      report: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      employeeWallet: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      companyTreasury: {
        upsert: jest.fn(),
      },
      transaction: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      financialTransaction: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      teamProject: {
        findFirst: jest.fn(),
      },
      teamMembership: {
        findFirst: jest.fn(),
      },
      teamResource: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        FinanceService,
        ReportsService,
        ProjectsService,
        TeamsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile()

    tasksService = module.get<TasksService>(TasksService)
    financeService = module.get<FinanceService>(FinanceService)
    reportsService = module.get<ReportsService>(ReportsService)
    projectsService = module.get<ProjectsService>(ProjectsService)
    teamsService = module.get<TeamsService>(TeamsService)
  })

  describe('Phase 1: PM Personal Kanban (Cases 1 - 4)', () => {
    it('Case 1 & 2: Identifies tasks assigned by C-level executives (CTO / CFO / CHRO) to PM', async () => {
      const mockTasks = [
        {
          id: 'task_cto_dir_1',
          title: 'Architectural Review of Auth Gateway',
          creatorId: 'emp_cto_01',
          assigneeId: 'emp_pm_01',
          projectId: 'proj_01',
          status: 'todo',
          tags: ['CTO Mandate'],
          dueDate: new Date(),
        },
        {
          id: 'task_chro_dir_1',
          title: 'Squad Morale and Evaluation Matrix',
          creatorId: 'emp_chro_01',
          assigneeId: 'emp_pm_01',
          projectId: 'proj_01',
          status: 'todo',
          tags: ['CHRO Mandate'],
          dueDate: new Date(),
        },
      ]

      prismaMock.task.findMany.mockResolvedValue(mockTasks)

      const result = await tasksService.findAll({ assigneeId: 'emp_pm_01' } as any)
      expect(result).toHaveLength(2)
      expect(result[0].creatorId).toBe('emp_cto_01')
      expect(result[1].creatorId).toBe('emp_chro_01')
    })

    it('Case 3: Updates task status through workflow statuses (todo -> in_progress -> in_review -> completed)', async () => {
      prismaMock.task.findUnique.mockResolvedValue({
        id: 'task_001',
        title: 'Sprint Planning',
        status: 'todo',
        assigneeId: 'emp_pm_01',
        projectId: 'proj_01',
      })

      prismaMock.task.update.mockResolvedValue({
        id: 'task_001',
        status: 'in_progress',
      })

      const updated = await tasksService.updateStatus('task_001', { status: 'in_progress' } as any, mockPmUser as any)
      expect(updated.status).toBe('in_progress')
      expect(prismaMock.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'task_001' },
          data: expect.objectContaining({ status: 'in_progress' }),
        }),
      )
    })

    it('Case 4: Displays all task metadata (title, description, project, weight, status, dates)', async () => {
      const fullTask = {
        id: 'task_001',
        title: 'Core Engine Refactor',
        description: 'Comprehensive refactoring of engine components',
        projectId: 'proj_01',
        creatorId: 'emp_cto_01',
        assigneeId: 'emp_pm_01',
        status: 'in_progress',
        priority: 'high',
        dueDate: new Date('2026-12-01'),
        createdAt: new Date('2026-11-20'),
        weightCategory: 'LARGE',
        weightPoints: 5,
        projectPercentage: 15,
      }

      prismaMock.task.findUnique.mockResolvedValue(fullTask)

      const task = await tasksService.findOne('task_001')
      expect(task.title).toBe('Core Engine Refactor')
      expect(task.description).toBeDefined()
      expect(task.creatorId).toBe('emp_cto_01')
      expect(task.weightPoints).toBe(5)
      expect(task.projectPercentage).toBe(15)
    })
  })

  describe('Phase 2: Task Management & Squad Deliverables (Cases 5 - 7)', () => {
    it('Case 5: PM creates and assigns task to developer in To Do', async () => {
      prismaMock.project.findUnique.mockResolvedValue({ id: 'proj_01', name: 'ERP Core' })
      prismaMock.employee.findUnique.mockResolvedValue({ id: 'emp_dev_01', name: 'Developer 1' })
      prismaMock.task.findMany.mockResolvedValue([])

      const createdTask = {
        id: 'task_new_01',
        title: 'Implement Payment Webhook',
        description: 'Integrate bKash webhook verification',
        projectId: 'proj_01',
        assigneeId: 'emp_dev_01',
        creatorId: 'emp_pm_01',
        status: 'todo',
        priority: 'medium',
        dueDate: new Date(),
      }
      prismaMock.task.create.mockResolvedValue(createdTask)

      const result = await tasksService.create(
        {
          title: 'Implement Payment Webhook',
          description: 'Integrate bKash webhook verification',
          projectId: 'proj_01',
          assigneeId: 'emp_dev_01',
          priority: 'medium',
          dueDate: '2026-12-05',
          estimatedHours: 8,
        } as any,
        mockPmUser as any,
      )

      expect(result.status).toBe('todo')
      expect(result.assigneeId).toBe('emp_dev_01')
    })

    it('Case 7: PM reviews and approves developer task with satisfaction score', async () => {
      jest.spyOn<any, any>(tasksService, 'isAssigneeInPmSquad').mockResolvedValue(true)
      prismaMock.task.findUnique.mockResolvedValue({
        id: 'task_dev_01',
        status: 'in_review',
        assigneeId: 'emp_dev_01',
        projectId: 'proj_01',
      })

      prismaMock.task.update.mockResolvedValue({
        id: 'task_dev_01',
        status: 'completed',
        pmScore: 92,
      })

      const approved = await tasksService.approve(
        'task_dev_01',
        { feedback: 'Excellent test coverage and code quality', score: 92 } as any,
        mockPmUser as any,
      )

      expect(approved.status).toBe('completed')
    })
  })

  describe('Phase 3: My Projects & Milestones (Cases 8 - 10)', () => {
    it('Case 9: PM creates milestone with future date and persists to DB', async () => {
      prismaMock.project.findUnique.mockResolvedValue({ id: 'proj_01', name: 'ERP Core', teamProjects: [], tasks: [] })
      prismaMock.projectMilestone.create.mockResolvedValue({
        id: 'ms_01',
        projectId: 'proj_01',
        title: 'Phase 1 MVP Release',
        dueDate: new Date('2026-12-31'),
        status: 'pending',
      })

      const milestone = await projectsService.addMilestone(
        'proj_01',
        {
          title: 'Phase 1 MVP Release',
          dueDate: '2026-12-31',
          status: 'pending',
        } as any,
      )

      expect(milestone.title).toBe('Phase 1 MVP Release')
      expect(prismaMock.projectMilestone.create).toHaveBeenCalled()
    })
  })

  describe('Phase 4: Budget & Finance (Cases 11 - 14)', () => {
    it('Case 12: Allocates budget to developer, updating project allocatedBudget and developer wallet', async () => {
      prismaMock.project.findUnique.mockResolvedValue({
        id: 'proj_01',
        budget: new Prisma.Decimal(100000),
        allocatedBudget: new Prisma.Decimal(40000),
      })

      prismaMock.employee.findUnique.mockResolvedValue({
        id: 'emp_dev_01',
        name: 'Developer Pramit',
      })

      prismaMock.project.update.mockResolvedValue({
        id: 'proj_01',
        allocatedBudget: new Prisma.Decimal(45000),
      })

      prismaMock.employeeWallet.upsert.mockResolvedValue({
        employeeId: 'emp_dev_01',
        balance: new Prisma.Decimal(5000),
        totalEarnedToDate: new Prisma.Decimal(5000),
      })

      prismaMock.transaction.create.mockResolvedValue({
        id: 'tx_alloc_01',
        amount: new Prisma.Decimal(5000),
        type: 'budget_allocation',
      })

      const allocation = await financeService.allocateDeveloperBudget(
        {
          developerId: 'emp_dev_01',
          projectId: 'proj_01',
          amount: 5000,
          description: 'Milestone 2 canvas engine sprint share',
        } as any,
        mockPmUser as any,
      )

      expect(allocation).toBeDefined()
      expect(prismaMock.project.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'proj_01' },
          data: expect.objectContaining({
            allocatedBudget: { increment: expect.any(Prisma.Decimal) },
          }),
        }),
      )
      expect(prismaMock.employeeWallet.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { employeeId: 'emp_dev_01' },
          update: expect.objectContaining({
            balance: { increment: expect.any(Prisma.Decimal) },
          }),
        }),
      )
    })

    it('Case 13: Submits budget increase request to CFO', async () => {
      prismaMock.employee.findUnique.mockResolvedValue({ id: 'emp_pm_01', role: 'pm' })
      prismaMock.project.findUnique.mockResolvedValue({
        id: 'proj_01',
        name: 'ERP Core',
        budget: new Prisma.Decimal(100000),
      })

      prismaMock.report.create.mockResolvedValue({
        id: 'rep_budget_01',
        type: 'pm_report',
        category: 'Budget Request',
        recipient: 'Chief Financial Officer (CFO)',
        title: 'Budget Increase Request: ৳15,000 for ERP Core',
        description: 'Need additional load testing cloud instances',
        status: 'pending',
      })

      const report = await reportsService.create(
        {
          title: 'Budget Increase Request: ৳15,000 for ERP Core',
          description: 'Need additional load testing cloud instances for benchmark validation',
          type: 'pm_report',
          category: 'Budget Request',
          recipient: 'Chief Financial Officer (CFO)',
          projectId: 'proj_01',
        } as any,
        mockPmUser as any,
      )

      expect(report.recipient).toBe('Chief Financial Officer (CFO)')
      expect(report.status).toBe('pending')
    })
  })

  describe('Phase 5: Submissions & Executive Routing (Case 18)', () => {
    it('Case 18: Submits idea or complaint with executive recipient (CTO / CFO / CHRO / CEO)', async () => {
      prismaMock.employee.findUnique.mockResolvedValue({ id: 'emp_pm_01', role: 'pm' })
      prismaMock.report.create.mockResolvedValue({
        id: 'rep_idea_01',
        title: 'Automated CI/CD Pipeline Optimizer',
        description: 'Enhances Docker layer caching to reduce deployment times by 40%',
        type: 'project_submission',
        recipient: 'Chief Technology Officer (CTO)',
        status: 'pending',
      })

      const submission = await reportsService.create(
        {
          title: 'Automated CI/CD Pipeline Optimizer',
          description: 'Enhances Docker layer caching to reduce deployment times by 40%',
          type: 'project_submission',
          recipient: 'Chief Technology Officer (CTO)',
        } as any,
        mockPmUser as any,
      )

      expect(submission.recipient).toBe('Chief Technology Officer (CTO)')
      expect(prismaMock.auditLog.create).toHaveBeenCalled()
    })
  })

  describe('Phase 6: Operational Workflows — Mandatory Prompts & Team Movement Logs', () => {
    it('Item 3: Rejects cancellation if cancellation reason is missing', async () => {
      prismaMock.task.findUnique.mockResolvedValue({
        id: 'task_cand_1',
        title: 'API Rate Limiting',
        status: 'in_progress',
        projectId: 'proj_01',
      })

      await expect(
        tasksService.updateStatus(
          'task_cand_1',
          { status: 'cancelled' } as any,
          mockPmUser as any,
        ),
      ).rejects.toThrow(BadRequestException)
    })

    it('Item 3: Rejects completed status if PM satisfaction score is missing', async () => {
      prismaMock.task.findUnique.mockResolvedValue({
        id: 'task_cand_2',
        title: 'JWT Refresh Rotation',
        status: 'in_review',
        projectId: 'proj_01',
        pmScore: null,
      })

      await expect(
        tasksService.updateStatus(
          'task_cand_2',
          { status: 'completed' } as any,
          mockPmUser as any,
        ),
      ).rejects.toThrow(BadRequestException)
    })

    it('Item 2 & 3: Successfully cancels task with reason and logs squad name in audit log', async () => {
      prismaMock.task.findUnique.mockResolvedValue({
        id: 'task_cand_3',
        title: 'Legacy Redis Cleanup',
        status: 'in_progress',
        projectId: 'proj_01',
        assigneeId: 'emp_dev_01',
      })
      prismaMock.task.update.mockResolvedValue({
        id: 'task_cand_3',
        status: 'cancelled',
      })
      prismaMock.teamProject.findFirst.mockResolvedValue({
        team: { name: 'Team Boron' },
      })

      const res = await tasksService.updateStatus(
        'task_cand_3',
        { status: 'cancelled', cancellationReason: 'Replaced by Valkey memory cluster' } as any,
        mockPmUser as any,
      )

      expect(res.status).toBe('cancelled')
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'TASK_STATUS_CHANGED',
            entityTitle: expect.stringContaining('Team Boron'),
            description: expect.stringContaining('Replaced by Valkey memory cluster'),
          }),
        }),
      )
    })

    it('Item 3: Successfully completes task with satisfaction score', async () => {
      prismaMock.task.findUnique.mockResolvedValue({
        id: 'task_cand_4',
        title: 'OAuth Google Setup',
        status: 'in_review',
        projectId: 'proj_01',
        assigneeId: 'emp_dev_01',
        pmScore: null,
      })
      prismaMock.task.update.mockResolvedValue({
        id: 'task_cand_4',
        status: 'completed',
        pmScore: new Prisma.Decimal(92),
      })

      const res = await tasksService.updateStatus(
        'task_cand_4',
        { status: 'completed', pmScore: 92 } as any,
        mockPmUser as any,
      )

      expect(res.status).toBe('completed')
      expect(prismaMock.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'completed',
            pmScore: new Prisma.Decimal(92),
          }),
        }),
      )
    })
  })

  describe('Phase 7: Operational Workflows — Squad Resources (Item 4)', () => {
    it('Adds and retrieves squad resources with Link and Description', async () => {
      prismaMock.team.findUnique.mockResolvedValue({
        id: 'team_01',
        name: 'Team Alpha',
      })
      prismaMock.teamResource.create.mockResolvedValue({
        id: 'res_01',
        teamId: 'team_01',
        url: 'https://github.com/pointfex/erp-core',
        description: 'Core Backend Repository & CI pipeline',
        title: 'Core Backend Repository & CI pipeline',
        createdById: 'emp_pm_01',
        createdAt: new Date(),
      })
      prismaMock.teamResource.findMany.mockResolvedValue([
        {
          id: 'res_01',
          teamId: 'team_01',
          url: 'https://github.com/pointfex/erp-core',
          description: 'Core Backend Repository & CI pipeline',
          title: 'Core Backend Repository & CI pipeline',
          createdAt: new Date(),
        },
      ])

      const added = await teamsService.addResource(
        'team_01',
        {
          url: 'https://github.com/pointfex/erp-core',
          description: 'Core Backend Repository & CI pipeline',
        },
        mockPmUser as any,
      )

      expect(added.url).toBe('https://github.com/pointfex/erp-core')

      const resources = await teamsService.getResources('team_01')
      expect(resources).toHaveLength(1)
      expect(resources[0].description).toBe('Core Backend Repository & CI pipeline')
    })
  })

  describe('Phase 8: Operational Workflows — Universal Self-Task Assignment (Item 5)', () => {
    it('Allows developer to assign a task to themselves', async () => {
      prismaMock.project.findUnique.mockResolvedValue({ id: 'proj_01', name: 'ERP Core' })
      prismaMock.employee.findUnique.mockResolvedValue({ id: 'emp_dev_01', name: 'Dev One' })
      prismaMock.task.create.mockResolvedValue({
        id: 'task_self_1',
        title: 'Implement Unit Tests',
        assigneeId: 'emp_dev_01',
        creatorId: 'emp_dev_01',
        status: 'todo',
      })

      const task = await tasksService.create(
        {
          title: 'Implement Unit Tests',
          description: 'Self-assigned unit tests',
          projectId: 'proj_01',
          assigneeId: 'emp_dev_01',
          dueDate: new Date(Date.now() + 86400000).toISOString(),
          weightCategory: 'MEDIUM',
        } as any,
        { id: 'emp_dev_01', role: 'developer', permissions: ['tasks:create_personal'] } as any,
      )

      expect(task.assigneeId).toBe('emp_dev_01')
      expect(task.creatorId).toBe('emp_dev_01')
    })
  })

  describe('Phase 9: Operational Workflows — CHRO-Only Weight Approval (Item 6)', () => {
    it('Rejects non-CHRO non-CEO actors from modifying task weights', async () => {
      prismaMock.task.findUnique.mockResolvedValue({
        id: 'task_wt_1',
        weightPoints: new Prisma.Decimal(2),
        weightCategory: 'MEDIUM',
      })

      // PM attempt -> Forbidden
      await expect(
        tasksService.changeWeightDirectly('task_wt_1', 4, 'LARGE', 'Scale up', mockPmUser as any),
      ).rejects.toThrow(ForbiddenException)

      // CTO attempt -> Forbidden
      await expect(
        tasksService.changeWeightDirectly('task_wt_1', 4, 'LARGE', 'Scale up', mockCtoUser as any),
      ).rejects.toThrow(ForbiddenException)
    })

    it('Allows CHRO and CEO to modify task weights', async () => {
      prismaMock.task.findUnique.mockResolvedValue({
        id: 'task_wt_2',
        weightPoints: new Prisma.Decimal(2),
        weightCategory: 'MEDIUM',
      })
      prismaMock.task.update.mockResolvedValue({
        id: 'task_wt_2',
        weightPoints: new Prisma.Decimal(4),
        weightCategory: 'CUSTOM',
        weightStatus: 'VERIFIED',
      })

      const chroUser = { id: 'emp_chro_01', role: 'chro', email: 'chro@seu.edu.bd' }
      const updated = await tasksService.changeWeightDirectly(
        'task_wt_2',
        4,
        'CUSTOM',
        'Complex module',
        chroUser as any,
      )

      expect(updated.weightStatus).toBe('VERIFIED')
      expect(prismaMock.task.update).toHaveBeenCalled()
    })
  })
})
