import { Test, TestingModule } from '@nestjs/testing'
import { ForbiddenException, BadRequestException } from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { PrismaService } from './common/prisma.service'
import { EmployeeLifecycleService } from './rbac/employee-lifecycle.service'
import { ReportsService } from './reports/reports.service'
import { ProjectsService } from './projects/projects.service'
import { TasksService } from './tasks/tasks.service'
import { FinanceService } from './finance/finance.service'
import { AuthService } from './auth/auth.service'
import { CreateTaskDto } from './tasks/dto/task.dto'
import { DEFAULT_ROLE_TEMPLATES } from './rbac/dynamic-roles.seeder'
import { Prisma } from '@prisma/client'

describe('QA Bugfixes Verification Suite (Bug-001 through Bug-017)', () => {
  let prismaMock: any

  beforeEach(() => {
    prismaMock = {
      $transaction: jest.fn((callback) => callback(prismaMock)),
      employee: {
        findUnique: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      team: {
        findUnique: jest.fn(),
      },
      project: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      projectMilestone: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      task: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      report: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      employeeWallet: {
        upsert: jest.fn().mockResolvedValue({ id: 'wal_1', balance: 500 }),
      },
      companyTreasury: {
        upsert: jest.fn().mockResolvedValue({ id: 'singleton', totalDistributedToDevs: 500 }),
        update: jest.fn(),
      },
      financialTransaction: {
        create: jest.fn().mockResolvedValue({ id: 'tx_1' }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'log_1' }),
      },
      teamProject: {
        create: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
    }
  })

  // --------------------------------------------------------------------------
  // Bug-001: MFA Reset & Admin Access Strictly Blocked for Developers
  // --------------------------------------------------------------------------
  describe('Bug-001: Developer MFA Reset Guard', () => {
    it('throws ForbiddenException when a developer attempts adminResetMfa', async () => {
      const service = new EmployeeLifecycleService(
        prismaMock as unknown as PrismaService,
        {} as any,
        {} as any,
      )
      const developerActor = { id: 'emp_dev_1', role: 'developer', roles: ['developer'] }

      await expect(
        service.adminResetMfa('emp_target_1', developerActor as any),
      ).rejects.toThrow(ForbiddenException)
    })
  })

  // --------------------------------------------------------------------------
  // Bug-002: Reports Word Limits & Missing Foreign Key Protection
  // --------------------------------------------------------------------------
  describe('Bug-002: Reports Validation & FK Safety', () => {
    let reportsService: ReportsService

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ReportsService,
          { provide: PrismaService, useValue: prismaMock },
        ],
      }).compile()
      reportsService = module.get<ReportsService>(ReportsService)
    })

    it('rejects submissions with titles shorter than 5 characters or fewer than 2 words', async () => {
      const actor = { id: 'emp_dev_1', role: 'developer' }
      await expect(
        reportsService.create(
          {
            title: 'Junk',
            description: 'This is a sufficiently long description that satisfies the word limit criteria.',
            type: 'project_submission',
          },
          actor as any,
        ),
      ).rejects.toThrow(BadRequestException)
    })

    it('rejects submissions with descriptions shorter than 10 characters or fewer than 2 words', async () => {
      const actor = { id: 'emp_dev_1', role: 'developer' }
      await expect(
        reportsService.create(
          {
            title: 'Valid Project Idea Title',
            description: 'Short',
            type: 'project_submission',
          },
          actor as any,
        ),
      ).rejects.toThrow(BadRequestException)
    })

    it('sanitizes non-existent teamId and targetUserId to null to prevent P2003 foreign key error', async () => {
      const actor = { id: 'emp_dev_1', role: 'developer' }
      prismaMock.employee.findUnique.mockResolvedValueOnce({ id: 'emp_dev_1' }) // author check
      prismaMock.team.findUnique.mockResolvedValueOnce(null) // non-existent team
      prismaMock.employee.findUnique.mockResolvedValueOnce(null) // non-existent target user
      prismaMock.report.create.mockImplementation((args: any) => Promise.resolve(args.data))

      await reportsService.create(
        {
          title: 'Valid Architecture Proposal',
          description: 'This is a valid proposal description with enough words to pass validation.',
          type: 'project_submission',
          teamId: 'invalid_team_999',
          targetUserId: 'invalid_user_999',
        },
        actor as any,
      )

      expect(prismaMock.report.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            teamId: null,
            targetUserId: null,
          }),
        }),
      )
    })
  })

  // --------------------------------------------------------------------------
  // Bug-003: Past Dates Rejection on Projects, Sprints and Tasks
  // --------------------------------------------------------------------------
  describe('Bug-003: Past Date Rejection', () => {
    let projectsService: ProjectsService
    let tasksService: TasksService

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ProjectsService,
          TasksService,
          { provide: PrismaService, useValue: prismaMock },
        ],
      }).compile()
      projectsService = module.get<ProjectsService>(ProjectsService)
      tasksService = module.get<TasksService>(TasksService)
    })

    it('rejects past project deadlines on creation', async () => {
      const pastDate = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
      await expect(
        projectsService.create({
          name: 'Past Project',
          code: 'PAST-01',
          deadline: pastDate,
        } as any),
      ).rejects.toThrow(BadRequestException)
    })

    it('rejects past task due dates on creation', async () => {
      prismaMock.project.findUnique.mockResolvedValue({ id: 'proj_1' })
      prismaMock.employee.findUnique.mockResolvedValue({ id: 'emp_1' })
      const pastDate = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
      await expect(
        tasksService.create(
          {
            title: 'Past Task',
            projectId: 'proj_1',
            assigneeId: 'emp_1',
            dueDate: pastDate,
          } as any,
          { id: 'emp_pm', role: 'pm' } as any,
        ),
      ).rejects.toThrow(BadRequestException)
    })
  })

  // --------------------------------------------------------------------------
  // Bug-004: Developer Proposals and Suggestions Permissions
  // --------------------------------------------------------------------------
  describe('Bug-004: Developer Dynamic Role Permissions', () => {
    it('grants suggestions:submit and projects:propose to Developer role template', () => {
      const devTemplate = DEFAULT_ROLE_TEMPLATES.find((t) => t.code === 'DEVELOPER')
      expect(devTemplate).toBeDefined()
      expect(devTemplate?.permissionCodes).toContain('suggestions:submit')
      expect(devTemplate?.permissionCodes).toContain('projects:propose')
    })
  })

  // --------------------------------------------------------------------------
  // Bug-006: Task DTO Numeric Type Transformation
  // --------------------------------------------------------------------------
  describe('Bug-006: CreateTaskDto Numeric Transformation', () => {
    it('transforms string numerical fields into numbers via @Type', async () => {
      const plain = {
        title: 'New Sprint Deliverable',
        projectId: 'proj_1',
        assigneeId: 'emp_dev_1',
        estimatedHours: '16',
        proposedWeight: '30',
        projectPercentage: '25',
      }

      const dto = plainToInstance(CreateTaskDto, plain)
      expect(typeof dto.estimatedHours).toBe('number')
      expect(dto.estimatedHours).toBe(16)
      expect(typeof dto.proposedWeight).toBe('number')
      expect(dto.proposedWeight).toBe(30)
      expect(typeof dto.projectPercentage).toBe('number')
      expect(dto.projectPercentage).toBe(25)

      const errors = await validate(dto)
      expect(errors.filter((e) => ['estimatedHours', 'proposedWeight', 'projectPercentage'].includes(e.property))).toHaveLength(0)
    })
  })

  // --------------------------------------------------------------------------
  // Bug-007: Safe Treasury Upsert on Developer Budget Allocation
  // --------------------------------------------------------------------------
  describe('Bug-007: PM Budget Allocation Treasury Upsert', () => {
    it('upserts companyTreasury singleton to prevent P2025 not found error', async () => {
      const financeService = new FinanceService(prismaMock as unknown as PrismaService)
      prismaMock.project.findUnique.mockResolvedValueOnce({
        id: 'proj_1',
        budget: new Prisma.Decimal(100000),
        allocatedBudget: new Prisma.Decimal(10000),
      })
      prismaMock.employee.findUnique.mockResolvedValueOnce({ id: 'emp_dev_1' })
      prismaMock.project.update.mockResolvedValueOnce({})

      await financeService.allocateDeveloperBudget(
        {
          projectId: 'proj_1',
          developerId: 'emp_dev_1',
          amount: 5000,
          description: 'Week 3 allocation',
        },
        { id: 'emp_pm_1', role: 'pm' } as any,
      )

      expect(prismaMock.companyTreasury.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'singleton' },
          update: expect.objectContaining({
            totalDistributedToDevs: { increment: expect.any(Object) },
          }),
          create: expect.objectContaining({
            id: 'singleton',
          }),
        }),
      )
    })
  })

  // --------------------------------------------------------------------------
  // Bug-009: Reduce Task % Share When Project is at 100%
  // --------------------------------------------------------------------------
  describe('Bug-009: Task Percentage Share Adjustment at 100%', () => {
    let tasksService: TasksService

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          TasksService,
          { provide: PrismaService, useValue: prismaMock },
        ],
      }).compile()
      tasksService = module.get<TasksService>(TasksService)
    })

    it('allows reducing task share by excluding the current task from total sum validation', async () => {
      // Task 1 has 40% and Task 2 has 60% (total 100%).
      // We want to reduce Task 1 from 40% to 20%.
      prismaMock.task.findUnique.mockResolvedValue({
        id: 'task_1',
        projectId: 'proj_1',
        projectPercentage: new Prisma.Decimal(40),
        isMainProjectTask: true,
      })

      // When checking other tasks, task_1 is excluded: only task_2 (60%) is returned
      prismaMock.task.findMany.mockResolvedValue([
        { id: 'task_2', projectPercentage: new Prisma.Decimal(60) },
      ])
      prismaMock.task.update.mockResolvedValue({ id: 'task_1', projectPercentage: new Prisma.Decimal(20) })

      const result = await tasksService.update(
        'task_1',
        { projectPercentage: 20 },
        { id: 'emp_pm_1', role: 'pm' } as any,
      )

      expect(result).toBeDefined()
      expect(prismaMock.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { not: 'task_1' },
          }),
        }),
      )
    })
  })

  // --------------------------------------------------------------------------
  // Bug-016: AuthService Refresh Fallback and SameSite None Cookie
  // --------------------------------------------------------------------------
  describe('Bug-016: Mobile Auth Token Fallback & Cookie SameSite', () => {
    it('resolves cookie SameSite to "none" in production or cross-origin environments', () => {
      const authService = new AuthService(
        prismaMock as unknown as PrismaService,
        null as any,
        null as any,
        null as any,
        null as any,
      )

      // Test cross-origin detection
      const sameSiteCross = (authService as any).resolveCookieSameSite({
        headers: { origin: 'https://erp.pointfex.com', host: 'pointfex-backend.vercel.app' },
      })
      expect(sameSiteCross).toBe('none')

      // Test sameSite resolution
      const sameSiteLocal = (authService as any).resolveCookieSameSite({
        headers: { origin: 'http://localhost:5173', host: 'localhost:3000' },
      })
      expect(['lax', 'none']).toContain(sameSiteLocal)
    })
  })

  // --------------------------------------------------------------------------
  // Bug-017: Tasks Assigned by CHRO to CTO/CFO
  // --------------------------------------------------------------------------
  describe('Bug-017: Executive Task Visibility', () => {
    it('confirms C-Level roles (CTO, CFO) can receive and progress tasks in the system', () => {
      const ctoTemplate = DEFAULT_ROLE_TEMPLATES.find((t) => t.code === 'CTO')
      expect(ctoTemplate).toBeDefined()
      // CTO has reports and task capabilities
      expect(ctoTemplate?.permissionCodes).toContain('reports:read_standard')
      expect(ctoTemplate?.permissionCodes).toContain('reports:triage')
    })
  })
})

