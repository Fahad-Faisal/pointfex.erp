import { getCurrentRequestIp } from '../common/ip-address.util'
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Optional,
} from '@nestjs/common'
import { PrismaService } from '../common/prisma.service'
import {
  CreateReportDto,
  UpdateReportStatusDto,
  ForwardReportDto,
  AdjudicateConfidentialGrievanceDto,
} from './dto/report.dto'
import { AuthenticatedUser } from '../common/auth-user.interface'
import { AuthorizationService } from '../rbac/authorization.service'

@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
    @Optional() private readonly authz?: AuthorizationService,
  ) { }

  private async canReadConfidential(actor: AuthenticatedUser): Promise<boolean> {
    if (this.authz && this.authz.getAuthzMode() !== 'legacy') {
      return (await this.authz.check(actor, 'grievances:read_confidential')).allowed
    }
    return (
      Boolean(actor.permissions?.includes('grievances:read_confidential')) ||
      actor.role === 'chro' ||
      actor.role === 'ceo'
    )
  }

  async findAll(
    filters: {
      type?: string
      status?: string
      projectId?: string
      teamId?: string
      isConfidential?: boolean
    },
    actor: AuthenticatedUser,
  ) {
    const canReadConf = await this.canReadConfidential(actor)
    const where: any = {}

    if (filters.type) where.type = filters.type
    if (filters.status) where.status = filters.status
    if (filters.projectId) where.projectId = filters.projectId
    if (filters.teamId) where.teamId = filters.teamId

    if (!canReadConf) {
      where.OR = [
        { isConfidential: false, confidentialTo: null },
        { authorId: actor.id },
      ]
    } else if (filters.isConfidential !== undefined) {
      where.isConfidential = filters.isConfidential
    }

    return this.prisma.report.findMany({
      where,
      include: {
        author: true,
        targetUser: true,
        team: true,
      },
      orderBy: { submittedAt: 'desc' },
    })
  }

  async findOne(id: string, actor: AuthenticatedUser) {
    const report = await this.prisma.report.findUnique({
      where: { id },
      include: {
        author: true,
        targetUser: true,
        team: true,
      },
    })

    if (!report) {
      throw new NotFoundException(`Report with ID "${id}" not found`)
    }

    const canReadConf = await this.canReadConfidential(actor)
    const isAuthor = report.authorId === actor.id
    const isRestricted = report.isConfidential || Boolean(report.confidentialTo)

    if (isRestricted && !canReadConf && !isAuthor) {
      throw new ForbiddenException(
        'Access denied: Confidential grievance requires grievances:read_confidential authority',
      )
    }

    return report
  }

  async create(dto: CreateReportDto, actor: AuthenticatedUser) {
    if (!dto.title?.trim() || !dto.description?.trim()) {
      throw new BadRequestException('Title and description are required.')
    }

    const title = dto.title.trim()
    const description = dto.description.trim()
    const titleWords = title.split(/\s+/).filter(Boolean).length
    const descWords = description.split(/\s+/).filter(Boolean).length

    if (title.length < 5 || title.length > 150 || titleWords < 2) {
      throw new BadRequestException(
        'Title must be between 5 and 150 characters and contain at least 2 words.',
      )
    }

    if (description.length < 10 || description.length > 5000 || descWords < 2) {
      throw new BadRequestException(
        'Description must be between 10 and 5000 characters and contain at least 2 words.',
      )
    }

    const reportId = `rep_${Date.now()}`

    return this.prisma.$transaction(async (tx) => {
      // Validate foreign keys to avoid P2003 relation errors
      let validAuthorId = actor.id
      const authorExists = await tx.employee.findUnique({ where: { id: actor.id } })
      if (!authorExists && actor.email) {
        const byEmail = await tx.employee.findUnique({ where: { email: actor.email } })
        if (byEmail) validAuthorId = byEmail.id
      }

      let validTeamId: string | null = null
      if (dto.teamId) {
        const teamExists = await tx.team.findUnique({ where: { id: dto.teamId } })
        if (teamExists) validTeamId = dto.teamId
      }

      let validTargetUserId: string | null = null
      if (dto.targetUserId) {
        const targetExists = await tx.employee.findUnique({ where: { id: dto.targetUserId } })
        if (targetExists) validTargetUserId = dto.targetUserId
      }

      const report = await tx.report.create({
        data: {
          id: reportId,
          authorId: validAuthorId,
          teamId: validTeamId,
          projectId: dto.projectId || null,
          type: dto.type,
          category: dto.category,
          title,
          description,
          docsUrl: dto.docsUrl,
          complainTo: dto.complainTo,
          recipient: dto.recipient,
          isConfidential: dto.isConfidential || false,
          confidentialTo: dto.confidentialTo,
          targetUserId: validTargetUserId,
          status: 'pending',
        },
        include: {
          author: true,
          targetUser: true,
          team: true,
        },
      })

      // Audit Log
      await tx.auditLog.create({
        data: {
          ipAddress: getCurrentRequestIp(),
          actorId: actor.id,
          actorName: actor.id,
          actorEmail: actor.email || '',
          actorRole: actor.role.toUpperCase(),
          action: dto.isConfidential ? 'CONFIDENTIAL_GRIEVANCE_SUBMITTED' : 'REPORT_SUBMITTED',
          actionCode: dto.isConfidential ? 'HR_CONFIDENTIAL_GRIEVANCE_LOGGED' : 'REPORT_LOGGED',
          severity: dto.isConfidential ? 'WARNING' : 'INFO',
          entityType: 'report',
          entityId: reportId,
          entityTitle: title,
          description: `Submitted ${dto.type}${dto.isConfidential ? ' (Privileged Confidential)' : ''}`,
          category: dto.isConfidential ? 'people' : 'report',
          badgeColor: dto.isConfidential ? 'purple' : 'sky',
        },
      })

      return report
    })
  }

  async updateStatus(id: string, dto: UpdateReportStatusDto, actor: AuthenticatedUser) {
  const report = await this.findOne(id, actor)

  if (report.isConfidential || Boolean(report.confidentialTo)) {
    const canAdjudicate =
      this.authz && this.authz.getAuthzMode() !== 'legacy'
        ? (await this.authz.check(actor, 'grievances:adjudicate_confidential')).allowed
        : Boolean(actor.permissions?.includes('grievances:adjudicate_confidential')) ||
          actor.role === 'chro' ||
          actor.role === 'ceo'
    if (!canAdjudicate) {
      throw new ForbiddenException(
        'Confidential grievance status updates require grievances:adjudicate_confidential authority',
      )
    }
  }

  return this.prisma.$transaction(async (tx) => {
    const updated = await tx.report.update({
      where: { id },
      data: {
        status: dto.status,
        feedback: dto.feedback
          ? `[${actor.role.toUpperCase()} Note]: ${dto.feedback}`
          : report.feedback,
        resolvedAt: ['resolved', 'dismissed', 'approved', 'rejected'].includes(dto.status)
          ? new Date()
          : null,
      },
    })

    await tx.auditLog.create({
      data: {
        ipAddress: getCurrentRequestIp(),
        actorId: actor.id,
        actorName: actor.id,
        actorEmail: actor.email || '',
        actorRole: actor.role.toUpperCase(),
        action: 'REPORT_STATUS_UPDATED',
        actionCode: 'REPORT_STATUS_UPDATED',
        severity: dto.status === 'approved' ? 'SUCCESS' : 'INFO',
        entityType: 'report',
        entityId: id,
        entityTitle: report.title,
        description: `${actor.role.toUpperCase()} updated report status to "${dto.status}"`,
        category: 'report',
        badgeColor: dto.status === 'approved' ? 'emerald' : 'sky',
      },
    })

    return updated
  })
}

  async forwardToCLevel(id: string, dto: ForwardReportDto, actor: AuthenticatedUser) {
  const report = await this.findOne(id, actor)

  return this.prisma.$transaction(async (tx) => {
    const updated = await tx.report.update({
      where: { id },
      data: {
        status: 'forwarded_to_c_level',
        forwardedTo: dto.recipient,
        forwardedBy: actor.id,
        forwardedAt: new Date(),
        pmEndorsement: dto.endorsement,
        feedback: `Forwarded to ${dto.recipient} with PM endorsement: "${dto.endorsement}"`,
      },
    })

    await tx.auditLog.create({
      data: {
        ipAddress: getCurrentRequestIp(),
        actorId: actor.id,
        actorName: actor.id,
        actorEmail: actor.email || '',
        actorRole: actor.role.toUpperCase(),
        action: 'REPORT_FORWARDED_TO_C_LEVEL',
        actionCode: 'REPORT_FORWARDED',
        severity: 'INFO',
        entityType: 'report',
        entityId: id,
        entityTitle: report.title,
        description: `PM forwarded idea "${report.title}" to ${dto.recipient}`,
        category: 'report',
        badgeColor: 'indigo',
      },
    })

    return updated
  })
}

  async adjudicateConfidential(
  id: string,
  dto: AdjudicateConfidentialGrievanceDto,
  actor: AuthenticatedUser,
) {
  let canAdjudicate = false
  if (this.authz && this.authz.getAuthzMode() !== 'legacy') {
    canAdjudicate = (
      await this.authz.check(actor, 'grievances:adjudicate_confidential')
    ).allowed
  } else {
    canAdjudicate =
      Boolean(actor.permissions?.includes('grievances:adjudicate_confidential')) ||
      actor.role === 'chro' ||
      actor.role === 'ceo'
  }
  if (!canAdjudicate) {
    throw new ForbiddenException(
      'Requires grievances:adjudicate_confidential authority to adjudicate confidential grievances',
    )
  }

  const report = await this.prisma.report.findUnique({ where: { id } })
  if (!report) throw new NotFoundException(`Grievance "${id}" not found`)

  return this.prisma.$transaction(async (tx) => {
    const updated = await tx.report.update({
      where: { id },
      data: {
        status: dto.status,
        mediationNotes: dto.mediationNotes,
        resolvedAt:
          dto.status === 'resolved' || dto.status === 'dismissed' ? new Date() : undefined,
      },
    })

    await tx.auditLog.create({
      data: {
        ipAddress: getCurrentRequestIp(),
        actorId: actor.id,
        actorName: actor.id,
        actorEmail: actor.email || '',
        actorRole: actor.role.toUpperCase(),
        action: 'CONFIDENTIAL_GRIEVANCE_ADJUDICATED',
        actionCode: 'HR_CONFIDENTIAL_GRIEVANCE_UPDATED',
        severity: 'INFO',
        entityType: 'report',
        entityId: id,
        entityTitle: report.title,
        description: `CHRO/CEO adjudicated confidential grievance: status set to "${dto.status}"`,
        category: 'people',
        badgeColor: 'purple',
      },
    })

    return updated
  })
}
}
