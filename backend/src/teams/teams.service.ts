import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../common/prisma.service'
import { CreateTeamDto, UpdateTeamDto, AddTeamMemberDto, CreateTeamResourceDto } from './dto/team.dto'
import { AuthenticatedUser } from '../common/auth-user.interface'

@Injectable()
export class TeamsService {
  constructor(private prisma: PrismaService) {}

  async findAll(_actor?: AuthenticatedUser) {
    const teams = await this.prisma.team.findMany({
      include: {
        pmPosition: {
          include: {
            assignments: {
              where: { isActive: true },
              include: { employee: true },
            },
          },
        },
        memberships: {
          where: { isActive: true },
          include: { employee: true },
        },
        teamProjects: {
          where: { isActive: true },
          include: {
            project: {
              include: {
                tasks: {
                  select: { id: true, status: true },
                },
              },
            },
          },
        },
      },
      orderBy: { id: 'asc' },
    })

    return teams.map((team) => {
      const activePmAssignment = team.pmPosition?.assignments[0]
      const leadMembership = team.memberships.find((m) => m.isLead)

      const projects = team.teamProjects.map((tp) => tp.project)
      const allTasks = projects.flatMap((p) => p.tasks || [])
      const completedTasks = allTasks.filter((t) => t.status === 'completed')
      const inProgressTasks = allTasks.filter((t) => t.status === 'in_progress')

      return {
        ...team,
        pmId: activePmAssignment?.employee?.id || null,
        pm: activePmAssignment?.employee || null,
        leadDevId: leadMembership?.employee?.id || null,
        leadDev: leadMembership?.employee || null,
        members: team.memberships.map((m) => m.employee),
        memberIds: team.memberships.map((m) => m.employeeId),
        projects,
        projectIds: team.teamProjects.map((tp) => tp.projectId),
        tasksCount: allTasks.length,
        completedTasksCount: completedTasks.length,
        inProgressTasksCount: inProgressTasks.length,
      }
    })
  }

  async findOne(id: string) {
    const team = await this.prisma.team.findUnique({
      where: { id },
      include: {
        pmPosition: {
          include: {
            assignments: {
              where: { isActive: true },
              include: { employee: true },
            },
          },
        },
        memberships: {
          where: { isActive: true },
          include: { employee: true },
        },
        teamProjects: {
          where: { isActive: true },
          include: {
            project: {
              include: {
                milestones: true,
                tasks: true,
              },
            },
          },
        },
      },
    })

    if (!team) {
      throw new NotFoundException(`Team with ID "${id}" not found`)
    }

    const activePmAssignment = team.pmPosition?.assignments[0]
    const leadMembership = team.memberships.find((m) => m.isLead)
    const projects = team.teamProjects.map((tp) => tp.project)
    const allTasks = projects.flatMap((p) => p.tasks || [])

    return {
      ...team,
      pmId: activePmAssignment?.employee?.id || null,
      pm: activePmAssignment?.employee || null,
      leadDevId: leadMembership?.employee?.id || null,
      leadDev: leadMembership?.employee || null,
      members: team.memberships.map((m) => m.employee),
      memberIds: team.memberships.map((m) => m.employeeId),
      projects,
      projectIds: team.teamProjects.map((tp) => tp.projectId),
      tasksCount: allTasks.length,
      completedTasksCount: allTasks.filter((t) => t.status === 'completed').length,
    }
  }

  private async resolvePmPositionForEmployee(
    employeeId: string,
    teamCode: string,
    ignoreTeamId?: string,
  ): Promise<string> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        positionAssignments: {
          where: { isActive: true },
          include: { position: true },
        },
        employeeRoles: {
          where: { isActive: true },
          include: { role: true },
        },
      },
    })
    if (!employee) {
      throw new NotFoundException(`Employee "${employeeId}" not found`)
    }

    const assignedPmPos = employee.positionAssignments?.find(
      (pa: any) => pa.position?.roleCategory?.toLowerCase() === 'pm',
    )
    const hasPmRole = employee.employeeRoles?.some(
      (er: any) => er.role?.slug?.toLowerCase() === 'pm',
    )
    const isExecutive =
      employee.positionAssignments?.some((pa: any) =>
        ['ceo', 'cto', 'cfo', 'chro', 'cpo'].includes(pa.position?.roleCategory?.toLowerCase()),
      ) ||
      employee.employeeRoles?.some((er: any) =>
        ['ceo', 'cto', 'cfo', 'chro', 'cpo'].includes(er.role?.slug?.toLowerCase()),
      ) ||
      ['ceo', 'cto', 'cfo', 'chro', 'cpo'].includes(employee.title?.toLowerCase())

    if (!assignedPmPos && !hasPmRole && !isExecutive) {
      throw new BadRequestException(
        `Employee "${employee.name || employeeId}" does not hold an active Project Manager position or C-Level role. Only registered Project Managers or C-Level executives can be assigned as Squad PM.`,
      )
    }

    if (assignedPmPos) {
      const pos = await this.prisma.position.findFirst({
        where: {
          id: assignedPmPos.positionId,
          OR: [{ managedTeam: null }, ...(ignoreTeamId ? [{ managedTeam: { id: ignoreTeamId } }] : [])],
        },
      })
      if (pos) return pos.id
    }

    const freePmPos = await this.prisma.position.findFirst({
      where: {
        roleCategory: 'pm',
        managedTeam: null,
        assignments: { none: { isActive: true } },
      },
    })
    if (freePmPos) {
      await this.prisma.positionAssignment.updateMany({
        where: { positionId: freePmPos.id, isActive: true },
        data: { isActive: false, endDate: new Date() },
      })
      await this.prisma.positionAssignment.create({
        data: {
          positionId: freePmPos.id,
          employeeId,
          isActive: true,
        },
      })
      return freePmPos.id
    }

    const targetPos = await this.prisma.position.create({
      data: {
        id: `pos_pm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        code: `PM-${teamCode.toUpperCase().replace(/[^A-Z0-9]/g, '')}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        title: `Project Manager — ${teamCode.toUpperCase()}`,
        department: 'Project Management',
        roleCategory: 'pm',
      },
    })

    await this.prisma.positionAssignment.updateMany({
      where: { positionId: targetPos.id, isActive: true },
      data: { isActive: false, endDate: new Date() },
    })
    await this.prisma.positionAssignment.create({
      data: {
        positionId: targetPos.id,
        employeeId,
        isActive: true,
      },
    })

    return targetPos.id
  }

  async create(dto: CreateTeamDto) {
    let resolvedPmPositionId: string | null = null
    const targetPmId = dto.pmId || dto.pmEmployeeId

    if (dto.pmPositionId) {
      // 1. Validate that pmPositionId belongs to a Project Manager position
      const position = await this.prisma.position.findUnique({
        where: { id: dto.pmPositionId },
      })

      if (!position) {
        throw new NotFoundException(`PM Position "${dto.pmPositionId}" not found`)
      }

      if (position.roleCategory !== 'pm') {
        throw new BadRequestException(
          `Invalid position: Position "${position.code}" is categorized as "${position.roleCategory}", not a Project Manager ("pm")`,
        )
      }

      // 2. Validate that this PM position is not already assigned to another team
      const existingTeam = await this.prisma.team.findUnique({
        where: { pmPositionId: dto.pmPositionId },
      })

      if (existingTeam) {
        throw new BadRequestException(
          `PM Position "${position.code}" is already assigned to team "${existingTeam.name}"`,
        )
      }

      resolvedPmPositionId = dto.pmPositionId
    } else if (targetPmId) {
      resolvedPmPositionId = await this.resolvePmPositionForEmployee(targetPmId, dto.code)
    }

    const teamId = dto.id || `team_${Date.now()}`

    return this.prisma.$transaction(async (tx) => {
      // Deactivate prior active teamProjects for assigned projects
      if (dto.projectIds && dto.projectIds.length > 0) {
        await tx.teamProject.updateMany({
          where: { projectId: { in: dto.projectIds }, isActive: true },
          data: { isActive: false, unassignedAt: new Date() },
        })
      }

      const created = await tx.team.create({
        data: {
          id: teamId,
          name: dto.name,
          code: dto.code,
          focus: dto.focus,
          pmPositionId: resolvedPmPositionId,
          color: dto.color || '#38bdf8',
          weeklyVelocity: dto.weeklyVelocity || 40,
          memberships: dto.memberIds?.length
            ? {
                create: dto.memberIds.map((employeeId) => ({
                  employeeId,
                  isLead: dto.leadDevId === employeeId,
                  roleInTeam: dto.leadDevId === employeeId ? 'lead_developer' : 'developer',
                  isActive: true,
                })),
              }
            : undefined,
          teamProjects: dto.projectIds?.length
            ? {
                create: dto.projectIds.map((projectId) => ({
                  projectId,
                  isActive: true,
                })),
              }
            : undefined,
        },
        include: {
          pmPosition: {
            include: {
              assignments: {
                where: { isActive: true },
                include: { employee: true },
              },
            },
          },
          memberships: {
            where: { isActive: true },
            include: { employee: true },
          },
          teamProjects: {
            where: { isActive: true },
            include: { project: true },
          },
        },
      })

      const activePmAssignment = created.pmPosition?.assignments?.[0]
      const leadMembership = created.memberships?.find((m: any) => m.isLead)
      const projects = created.teamProjects?.map((tp: any) => tp.project) || []
      const allTasks = projects.flatMap((p: any) => p?.tasks || [])

      return {
        ...created,
        pmId: activePmAssignment?.employee?.id || targetPmId || null,
        pm: activePmAssignment?.employee || null,
        leadDevId: leadMembership?.employee?.id || dto.leadDevId || null,
        leadDev: leadMembership?.employee || null,
        members: created.memberships?.map((m: any) => m.employee).filter(Boolean) || [],
        memberIds: created.memberships?.map((m: any) => m.employeeId) || dto.memberIds || [],
        projects,
        projectIds: created.teamProjects?.map((tp: any) => tp.projectId) || dto.projectIds || [],
        tasksCount: allTasks.length,
        completedTasksCount: allTasks.filter((t: any) => t?.status === 'completed').length,
      }
    })
  }

  async update(id: string, dto: UpdateTeamDto) {
    const existing = await this.findOne(id)
    const { pmEmployeeId, pmId, memberIds, projectIds, leadDevId, ...rest } = dto
    const data: Record<string, unknown> = { ...rest }
    const targetPmId = pmId !== undefined ? pmId : pmEmployeeId

    if (dto.pmPositionId) {
      const position = await this.prisma.position.findUnique({
        where: { id: dto.pmPositionId },
      })
      if (!position || position.roleCategory !== 'pm') {
        throw new BadRequestException(
          `Target position must be a valid Project Manager ("pm") position`,
        )
      }
      data.pmPositionId = dto.pmPositionId
    } else if (targetPmId === null || targetPmId === '') {
      data.pmPositionId = null
    } else if (targetPmId) {
      data.pmPositionId = await this.resolvePmPositionForEmployee(
        targetPmId,
        existing.code,
        id,
      )
    }

    return this.prisma.$transaction(async (tx) => {
      if (Object.keys(data).length > 0) {
        await tx.team.update({
          where: { id },
          data,
        })
      }

      // Member mutations (Add, Remove, Swap/Transfer)
      if (memberIds !== undefined) {
        const currentMemberships = await tx.teamMembership.findMany({
          where: { teamId: id, isActive: true },
        })
        const currentMemberIds = new Set(currentMemberships.map((m: any) => m.employeeId))
        const newMemberIds = new Set(memberIds)

        // Deactivate removed members
        for (const cm of currentMemberships) {
          if (!newMemberIds.has(cm.employeeId)) {
            await tx.teamMembership.update({
              where: { id: cm.id },
              data: { isActive: false, leftAt: new Date() },
            })
          }
        }

        // Add newly added members
        for (const mId of memberIds) {
          if (!currentMemberIds.has(mId)) {
            await tx.teamMembership.create({
              data: {
                teamId: id,
                employeeId: mId,
                isLead: leadDevId === mId,
                roleInTeam: leadDevId === mId ? 'lead_developer' : 'developer',
                isActive: true,
              },
            })
          }
        }
      }

      // Project mutations (Assign, Reassign, Remove)
      if (projectIds !== undefined) {
        const currentProjects = await tx.teamProject.findMany({
          where: { teamId: id, isActive: true },
        })
        const currentProjectIds = new Set(currentProjects.map((p: any) => p.projectId))
        const newProjectIds = new Set(projectIds)

        // Deactivate removed projects
        for (const cp of currentProjects) {
          if (!newProjectIds.has(cp.projectId)) {
            await tx.teamProject.update({
              where: { id: cp.id },
              data: { isActive: false, unassignedAt: new Date() },
            })
          }
        }

        // Add newly assigned projects
        for (const pId of projectIds) {
          if (!currentProjectIds.has(pId)) {
            // Remove from other teams first (reassign)
            await tx.teamProject.updateMany({
              where: { projectId: pId, isActive: true },
              data: { isActive: false, unassignedAt: new Date() },
            })
            await tx.teamProject.create({
              data: {
                teamId: id,
                projectId: pId,
                isActive: true,
              },
            })
          }
        }
      }

      const updated = await tx.team.findUnique({
        where: { id },
        include: {
          pmPosition: {
            include: {
              assignments: {
                where: { isActive: true },
                include: { employee: true },
              },
            },
          },
          memberships: {
            where: { isActive: true },
            include: { employee: true },
          },
          teamProjects: {
            where: { isActive: true },
            include: {
              project: {
                include: {
                  milestones: true,
                  tasks: true,
                },
              },
            },
          },
        },
      })

      if (!updated) {
        return this.findOne(id)
      }

      const activePmAssignment = updated.pmPosition?.assignments?.[0]
      const leadMembership = updated.memberships?.find((m: any) => m.isLead)
      const projects = updated.teamProjects?.map((tp: any) => tp.project) || []
      const allTasks = projects.flatMap((p: any) => p?.tasks || [])

      return {
        ...updated,
        pmId: activePmAssignment?.employee?.id || null,
        pm: activePmAssignment?.employee || null,
        leadDevId: leadMembership?.employee?.id || null,
        leadDev: leadMembership?.employee || null,
        members: updated.memberships?.map((m: any) => m.employee) || [],
        memberIds: updated.memberships?.map((m: any) => m.employeeId) || [],
        projects,
        projectIds: updated.teamProjects?.map((tp: any) => tp.projectId) || [],
        tasksCount: allTasks.length,
        completedTasksCount: allTasks.filter((t: any) => t?.status === 'completed').length,
      }
    })
  }

  async addMember(teamId: string, dto: AddTeamMemberDto) {
    await this.findOne(teamId)

    const employee = await this.prisma.employee.findUnique({
      where: { id: dto.employeeId },
    })
    if (!employee) {
      throw new NotFoundException(`Employee "${dto.employeeId}" not found`)
    }

    // Interactive transaction: Add to this team (without stripping from other squads)
    return this.prisma.$transaction(async (tx) => {
      // Deactivate existing membership in THIS team if re-adding
      await tx.teamMembership.updateMany({
        where: {
          teamId,
          employeeId: dto.employeeId,
          isActive: true,
        },
        data: {
          isActive: false,
          leftAt: new Date(),
        },
      })

      // If making lead, ensure other leads in this team are unset
      if (dto.isLead) {
        await tx.teamMembership.updateMany({
          where: {
            teamId,
            isActive: true,
            isLead: true,
          },
          data: {
            isLead: false,
          },
        })
      }

      // Create new membership
      const newMembership = await tx.teamMembership.create({
        data: {
          teamId,
          employeeId: dto.employeeId,
          isLead: dto.isLead || false,
          roleInTeam: dto.isLead ? 'lead_developer' : 'developer',
          isActive: true,
        },
        include: {
          team: true,
          employee: true,
        },
      })

      return newMembership
    })
  }

  async removeMember(teamId: string, employeeId: string) {
    await this.prisma.teamMembership.updateMany({
      where: {
        teamId,
        employeeId,
        isActive: true,
      },
      data: {
        isActive: false,
        leftAt: new Date(),
      },
    })

    return { message: `Employee "${employeeId}" removed from team "${teamId}"` }
  }

  async addResource(
    teamId: string,
    dto: CreateTeamResourceDto,
    actor?: AuthenticatedUser,
  ) {
    const team = await this.prisma.team.findUnique({ where: { id: teamId } })
    if (!team) {
      throw new NotFoundException(`Team "${teamId}" not found`)
    }

    if (this.prisma.teamResource?.create) {
      return this.prisma.teamResource.create({
        data: {
          teamId,
          url: dto.url,
          description: dto.description || '',
          title: dto.title || dto.description || 'Squad Resource',
          createdById: actor?.id || null,
        },
      })
    }

    return {
      id: `res_${Date.now()}`,
      teamId,
      url: dto.url,
      description: dto.description || '',
      title: dto.title || 'Squad Resource',
      createdById: actor?.id || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  }

  async getResources(teamId: string) {
    if (this.prisma.teamResource?.findMany) {
      return this.prisma.teamResource.findMany({
        where: { teamId },
        orderBy: { createdAt: 'desc' },
      })
    }
    return []
  }

  async getAllResources() {
    if (this.prisma.teamResource?.findMany) {
      return this.prisma.teamResource.findMany({
        include: { team: true },
        orderBy: { createdAt: 'desc' },
      })
    }
    return []
  }
}
