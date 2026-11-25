import { Test, TestingModule } from '@nestjs/testing'
import { TeamsService } from './teams.service'
import { PrismaService } from '../common/prisma.service'
import { BadRequestException } from '@nestjs/common'

describe('TeamsService - Squad Organizational Binding & PM Validation', () => {
  let service: TeamsService
  let prisma: any

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn((callback) => callback(prisma)),
      team: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      position: {
        findUnique: jest.fn(),
      },
      employee: {
        findUnique: jest.fn(),
      },
      teamMembership: {
        updateMany: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
      },
      teamProject: {
        updateMany: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
      },
      positionAssignment: {
        updateMany: jest.fn(),
        create: jest.fn(),
      },
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [TeamsService, { provide: PrismaService, useValue: prisma }],
    }).compile()

    service = module.get<TeamsService>(TeamsService)
  })

  describe('PM Position Validation Rules', () => {
    it('should reject team creation if position is not a Project Manager position', async () => {
      // Developer position passed instead of PM
      prisma.position.findUnique.mockResolvedValue({
        id: 'pos_dev_01',
        code: 'DEV-01',
        roleCategory: 'developer',
      })

      await expect(
        service.create({
          name: 'Team Zulu',
          code: 'TZ',
          focus: 'Platform R&D',
          pmPositionId: 'pos_dev_01',
        }),
      ).rejects.toThrow(BadRequestException)
    })

    it('should reject team creation if PM position is already assigned to another active team', async () => {
      prisma.position.findUnique.mockResolvedValue({
        id: 'pos_pm_01',
        code: 'PM-01',
        roleCategory: 'pm',
      })
      prisma.team.findUnique.mockResolvedValue({
        id: 'team_01',
        name: 'Team Alpha',
        pmPositionId: 'pos_pm_01',
      })

      await expect(
        service.create({
          name: 'Team Zulu',
          code: 'TZ',
          focus: 'Platform R&D',
          pmPositionId: 'pos_pm_01',
        }),
      ).rejects.toThrow(BadRequestException)
    })

    it('should successfully create team when given a free PM position', async () => {
      prisma.position.findUnique.mockResolvedValue({
        id: 'pos_pm_06',
        code: 'PM-06',
        roleCategory: 'pm',
      })
      prisma.team.findUnique.mockResolvedValue(null)
      prisma.team.create.mockResolvedValue({
        id: 'team_06',
        name: 'Team Foxtrot',
        pmPositionId: 'pos_pm_06',
      })

      const res = await service.create({
        name: 'Team Foxtrot',
        code: 'TF',
        focus: 'Media Systems',
        pmPositionId: 'pos_pm_06',
      })

      expect(res.name).toBe('Team Foxtrot')
    })

    it('should allow creating a team without a PM assigned (assignable later)', async () => {
      prisma.team.create.mockResolvedValue({
        id: 'team_unassigned',
        name: 'Team Theta',
        pmPositionId: null,
      })

      const res = await service.create({
        name: 'Team Theta',
        code: 'TT',
        focus: 'Platform Services',
      })

      expect(prisma.team.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Team Theta',
            pmPositionId: null,
          }),
        }),
      )
      expect(res.pmPositionId).toBeNull()
    })

    it('should persist members and projects during squad creation', async () => {
      prisma.team.create.mockResolvedValue({
        id: 'team_new',
        name: 'Team Pegasus',
        code: 'TP',
        memberships: [
          { employeeId: 'emp_dev_01', isLead: false, employee: { id: 'emp_dev_01', name: 'Dev One' } },
          { employeeId: 'emp_dev_02', isLead: false, employee: { id: 'emp_dev_02', name: 'Dev Two' } },
        ],
        teamProjects: [
          { projectId: 'proj_01', project: { id: 'proj_01', name: 'Project Alpha' } },
        ],
      })

      const res = await service.create({
        name: 'Team Pegasus',
        code: 'TP',
        focus: 'Platform Scale',
        memberIds: ['emp_dev_01', 'emp_dev_02'],
        projectIds: ['proj_01'],
      })

      expect(res.members).toHaveLength(2)
      expect(res.projects).toHaveLength(1)
    })

    it('should unassign PM when pmId or pmEmployeeId is null or empty', async () => {
      prisma.team.findUnique.mockResolvedValue({
        id: 'team_01',
        name: 'Team Alpha',
        code: 'TA',
        pmPositionId: 'pos_pm_01',
        pmPosition: { assignments: [] },
        memberships: [],
        teamProjects: [],
      })
      prisma.team.update.mockResolvedValue({
        id: 'team_01',
        name: 'Team Alpha',
        code: 'TA',
        pmPositionId: null,
      })

      const res = await service.update('team_01', {
        pmId: null,
      })

      expect(prisma.team.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'team_01' },
          data: expect.objectContaining({ pmPositionId: null }),
        }),
      )
    })

    it('should swap and synchronize members and projects on update', async () => {
      prisma.team.findUnique.mockResolvedValue({
        id: 'team_01',
        name: 'Team Alpha',
        code: 'TA',
        pmPositionId: 'pos_pm_01',
        pmPosition: { assignments: [] },
        memberships: [
          { id: 'tm_01', employeeId: 'emp_dev_01', isLead: false, employee: { id: 'emp_dev_01' } },
        ],
        teamProjects: [
          { id: 'tp_01', projectId: 'proj_01', project: { id: 'proj_01' } },
        ],
      })
      prisma.teamMembership.findMany.mockResolvedValue([
        { id: 'tm_01', employeeId: 'emp_dev_01' },
      ])
      prisma.teamProject.findMany.mockResolvedValue([
        { id: 'tp_01', projectId: 'proj_01' },
      ])

      await service.update('team_01', {
        memberIds: ['emp_dev_02'],
        projectIds: ['proj_02'],
      })

      // emp_dev_01 should be deactivated and emp_dev_02 should be created
      expect(prisma.teamMembership.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tm_01' },
          data: expect.objectContaining({ isActive: false }),
        }),
      )
      expect(prisma.teamMembership.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ teamId: 'team_01', employeeId: 'emp_dev_02' }),
        }),
      )

      // proj_01 deactivated, proj_02 created
      expect(prisma.teamProject.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tp_01' },
          data: expect.objectContaining({ isActive: false }),
        }),
      )
      expect(prisma.teamProject.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ teamId: 'team_01', projectId: 'proj_02' }),
        }),
      )
    })

    it('should reject assigning an employee as PM if they do not hold an active PM position or role', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        id: 'emp_dev_09',
        name: 'Fahim Uddin',
        positionAssignments: [],
        employeeRoles: [],
      })

      await expect(
        service.create({
          name: 'Team Dynamic',
          code: 'TZ',
          focus: 'Platform Engineering',
          pmId: 'emp_dev_09',
        }),
      ).rejects.toThrow(BadRequestException)
    })

    it('should cleanly assign an employee holding a PM position as squad PM', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        id: 'emp_pm_01',
        name: 'Registered PM',
        positionAssignments: [
          {
            positionId: 'pos_pm_01',
            isActive: true,
            position: { id: 'pos_pm_01', roleCategory: 'pm' },
          },
        ],
        employeeRoles: [],
      })
      prisma.position.findFirst = jest.fn().mockResolvedValue({
        id: 'pos_pm_01',
        roleCategory: 'pm',
      })
      prisma.team.create.mockResolvedValue({
        id: 'team_dyn',
        name: 'Team Dynamic',
        code: 'TZ',
        pmPositionId: 'pos_pm_01',
      })

      const res = await service.create({
        name: 'Team Dynamic',
        code: 'TZ',
        focus: 'Platform Engineering',
        pmId: 'emp_pm_01',
      })

      expect(res.name).toBe('Team Dynamic')
    })
  })
})
