import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Param,
  Body,
  Query,
  Headers,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common'
import { KpiEngineService } from './kpi-engine.service'
import { PrismaService } from '../common/prisma.service'
import { ExecScoresService } from './exec-scores.service'
import { XpLedgerService } from './xp-ledger.service'
import { FrozenXpConsensusService } from './frozen-xp-consensus.service'
import { PmMilestoneXpService } from './pm-milestone-xp.service'
import { ExecWeeklyKpiService } from './exec-weekly-kpi.service'
import { WeeklySweepService } from './weekly-sweep.service'
import { DisciplinaryService } from './disciplinary.service'
import { PerformanceReadService, LedgerQueryDto } from './performance-read.service'
import { AuthenticatedUser } from '../common/auth-user.interface'
import { CurrentUser } from '../common/current-user.decorator'
import { PermissionsGuard } from '../common/permissions.guard'
import { RequirePermissions, RequireAnyPermission } from '../common/require-permissions.decorator'
import { RequiresFreshMfa } from '../common/requires-fresh-mfa.decorator'

@Controller('performance')
@UseGuards(PermissionsGuard)
export class ChroGovernanceController {
  constructor(
    private readonly kpiEngine: KpiEngineService,
    private readonly prisma: PrismaService,
    private readonly execScores: ExecScoresService,
    private readonly xpLedger: XpLedgerService,
    private readonly frozenXp: FrozenXpConsensusService,
    private readonly pmMilestoneXp: PmMilestoneXpService,
    private readonly execWeeklyKpi: ExecWeeklyKpiService,
    private readonly weeklySweep: WeeklySweepService,
    private readonly disciplinaryService: DisciplinaryService,
    private readonly performanceRead: PerformanceReadService,
  ) {}

  // --------------------------------------------------------------------------
  // EXECUTIVE READ-RECEIPTS & SCORE REVIEWS
  // --------------------------------------------------------------------------
  @Get('exec-scores/inbox')
  @RequireAnyPermission('kpis:score_exec', 'performance:read_all', 'performance:evaluate', 'governance:vote')
  async getExecScoresInbox(@CurrentUser() actor: AuthenticatedUser) {
    return this.execScores.getInbox(actor)
  }

  @Post('exec-scores/:id/confirm')
  @RequireAnyPermission('kpis:score_exec', 'performance:evaluate', 'governance:vote')
  async confirmExecScore(
    @Param('id') scoreId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.execScores.confirmScore(scoreId, actor)
  }

  @Post('exec-scores/:id/adjust')
  @RequireAnyPermission('kpis:score_exec', 'performance:evaluate', 'governance:vote')
  async adjustExecScore(
    @Param('id') scoreId: string,
    @Body() body: { score: number; reason: string },
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.execScores.adjustScore(scoreId, Number(body.score), body.reason, actor)
  }

  // --------------------------------------------------------------------------
  // LEGACY XP CORRECTIONS (DRY RUN & MFA-GATED APPLY)
  // --------------------------------------------------------------------------
  @Get('legacy-xp-corrections/preview')
  @RequireAnyPermission('tasks:verify_weight', 'performance:evaluate', 'governance:vote')
  async getLegacyXpCorrectionsPreview() {
    return this.xpLedger.getLegacyCorrectionsPreview()
  }

  @Post('legacy-xp-corrections/apply')
  @RequireAnyPermission('tasks:verify_weight', 'performance:evaluate', 'governance:vote')
  @RequiresFreshMfa('tasks:verify_weight')
  async applyLegacyXpCorrections(
    @Body() body: { mfaCode?: string },
    @Headers('x-mfa-code') headerMfa?: string,
    @CurrentUser() actor?: AuthenticatedUser,
  ) {
    const code = body?.mfaCode || headerMfa || ''
    return this.xpLedger.applyLegacyCorrections(actor!, code)
  }

  // --------------------------------------------------------------------------
  // 1. CHRO TASK & MILESTONE WEIGHT VERIFICATION QUEUE
  // --------------------------------------------------------------------------
  @Get('chro/weight-queue')
  @RequireAnyPermission('performance:read_all', 'kpi:verify_weight')
  async getWeightQueue(@Query('status') status?: string) {
    const where: any = {}
    if (status) {
      where.status = status
      if (status === 'PENDING_CHRO') {
        where.NOT = {
          task: {
            ceoFinalized: true,
            weightStatus: 'VERIFIED',
          },
        }
      }
    }

    return this.prisma.taskWeightVerification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        task: {
          select: {
            id: true,
            title: true,
            status: true,
            assignee: { select: { id: true, name: true, title: true } },
            project: { select: { id: true, name: true } },
          },
        },
        milestone: {
          select: {
            id: true,
            title: true,
            status: true,
            project: { select: { id: true, name: true } },
          },
        },
        proposer: {
          select: { id: true, name: true, title: true },
        },
        consensusVotes: true,
      },
    })
  }

  @Patch('chro/verify-weight/:id')
  @RequireAnyPermission('performance:discipline', 'performance:evaluate', 'kpi:verify_weight')
  async verifyTaskWeight(
    @Param('id') verificationId: string,
    @Body() body: { approvedWeight: number; notes?: string },
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const actorRole = (actor.role || '').toLowerCase()
    const isChroOrCeo = ['ceo', 'chro', 'system:root'].includes(actorRole) || actor.id === 'emp_ceo_01'
    if (!isChroOrCeo) {
      throw new ForbiddenException('Only CHRO (plus CEO supreme override) can approve or modify task weights.')
    }
    return this.kpiEngine.verifyTaskWeight(
      verificationId,
      Number(body.approvedWeight),
      actor,
      body.notes,
    )
  }

  // --------------------------------------------------------------------------
  // 2. CHRO DISCIPLINARY DEDUCTION OVERRIDE
  // --------------------------------------------------------------------------
  @Post('chro/disciplinary-deduction')
  @RequireAnyPermission('performance:discipline', 'kpi:disciplinary_deduction')
  async applyDisciplinaryDeduction(
    @Body() body: { employeeId: string; deductionPoints: number; reason: string },
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.kpiEngine.applyDisciplinaryDeduction(
      body.employeeId,
      body.deductionPoints,
      body.reason,
      actor,
    )
  }

  // --------------------------------------------------------------------------
  // 3. C-LEVEL MASSIVE XP CONSENSUS VOTING
  // --------------------------------------------------------------------------
  @Post('tasks/weight-verification/:id/vote')
  @RequireAnyPermission('xp:release_frozen', 'votes:cast', 'governance:vote', 'performance:evaluate')
  @RequiresFreshMfa('xp:release_frozen')
  async castConsensusVote(
    @Param('id') verificationId: string,
    @Body() body: { decision: 'APPROVE' | 'REJECT'; notes?: string },
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.frozenXp.castVote(
      verificationId,
      actor,
      body.decision,
      body.notes,
    )
  }

  @Get('tasks/weight-verification/:id/tally')
  @RequireAnyPermission('xp:release_frozen', 'performance:read_all', 'governance:vote')
  async getConsensusTally(@Param('id') verificationId: string) {
    return this.frozenXp.getTally(verificationId)
  }

  @Post('tasks/weight-verification/:id/ceo-override')
  @RequirePermissions('system:root')
  @RequiresFreshMfa('xp:release_frozen')
  async ceoConsensusOverride(
    @Param('id') verificationId: string,
    @Body() body: { decision: 'APPROVE' | 'REJECT'; reason: string },
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.frozenXp.ceoOverride(verificationId, actor, body.decision, body.reason)
  }

  // --------------------------------------------------------------------------
  // 3B. C-LEVEL EXECUTIVE READ-RECEIPT REVIEW QUEUE
  // --------------------------------------------------------------------------
  @Get('executive/pending-reviews')
  @RequireAnyPermission('performance:read_all', 'reports:read_standard', 'governance:vote')
  async getExecutivePendingReviews(@CurrentUser() actor: AuthenticatedUser) {
    return this.kpiEngine.getExecutivePendingReviews(actor)
  }

  @Post('executive/reviews/:id/confirm')
  @RequireAnyPermission('performance:evaluate', 'governance:vote')
  async confirmExecutiveReview(
    @Param('id') recordId: string,
    @Body() body: { overrideScore?: number; notes?: string },
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.kpiEngine.confirmExecutiveReview(recordId, actor, body)
  }

  // --------------------------------------------------------------------------
  // 4. USER-FACING KPI HISTORY & IMMUTABLE AUDIT LOG
  // --------------------------------------------------------------------------
  @Get('audit-log/:employeeId')
  async getEmployeeAuditLogs(
    @Param('employeeId') employeeId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    if (
      actor.id !== employeeId &&
      !['chro', 'ceo', 'cpo', 'cto', 'cfo'].includes(actor.role.toLowerCase())
    ) {
      throw new ForbiddenException('Access denied: You may only view your own audit logs.')
    }
    return this.kpiEngine.getEmployeeAuditLogs(employeeId)
  }

  @Get('kpi-history/:employeeId')
  async getEmployeeKpiHistory(
    @Param('employeeId') employeeId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    if (
      actor.id !== employeeId &&
      !['chro', 'ceo', 'cpo', 'cto', 'cfo', 'pm'].includes(actor.role.toLowerCase())
    ) {
      throw new ForbiddenException('Access denied: You may only view your own KPI history.')
    }
    return this.kpiEngine.getEmployeeKpiHistory(employeeId)
  }

  // --------------------------------------------------------------------------
  // 5. EMPLOYEE OVERALL SUMMARY (LIFETIME XP, CURRENT KPI, INACTIVITY)
  // --------------------------------------------------------------------------
  @Get('summary/:employeeId')
  async getEmployeePerformanceSummary(@Param('employeeId') employeeId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        name: true,
        title: true,
        lifetimeXp: true,
        weeklyKpiRecords: {
          orderBy: [{ year: 'desc' }, { weekNumber: 'desc' }],
          take: 5,
        },
      },
    })

    if (!employee) return null

    const latestKpi = employee.weeklyKpiRecords[0] || null

    return {
      employeeId: employee.id,
      name: employee.name,
      title: employee.title,
      lifetimeXp: employee.lifetimeXp,
      currentWeeklyKpi: latestKpi?.isInactive ? 'N/A' : latestKpi?.score ? Number(latestKpi.score) : 85,
      isInactive: latestKpi?.isInactive || false,
      recentKpiHistory: employee.weeklyKpiRecords,
    }
  }

  // --------------------------------------------------------------------------
  // 6. ON-DEMAND EVALUATION CALCULATORS
  // --------------------------------------------------------------------------
  @Post('calculate/developer/:employeeId')
  @RequireAnyPermission('performance:read_all', 'tasks:approve')
  async calculateDeveloperWeeklyKpi(
    @Param('employeeId') employeeId: string,
    @Body() body: { weekNumber: number; year: number },
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.kpiEngine.calculateDeveloperWeeklyKpi(
      employeeId,
      body.weekNumber,
      body.year,
      actor,
    )
  }

  @Post('calculate/pm/:employeeId')
  @RequireAnyPermission('performance:read_all', 'governance:approve_request')
  async calculatePmWeeklyKpi(
    @Param('employeeId') employeeId: string,
    @Body()
    body: {
      weekNumber: number
      year: number
      ctoScore?: number
      cpoScore?: number
      cfoScore?: number
      chroScore?: number
      notes?: string
    },
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.kpiEngine.calculatePmWeeklyKpi(
      employeeId,
      body.weekNumber,
      body.year,
      body,
      actor,
    )
  }

  @Post('calculate/c-level/:employeeId')
  @RequireAnyPermission('performance:read_all', 'governance:vote')
  async calculateCLevelWeeklyKpi(
    @Param('employeeId') employeeId: string,
    @Body()
    body: {
      roleTitle: 'CTO' | 'CPO' | 'CFO' | 'CHRO'
      weekNumber: number
      year: number
      macroGoals?: number
      ceoDirectReview?: number
      peerSynergy?: number
    },
  ) {
    return this.kpiEngine.calculateCLevelWeeklyKpi(
      employeeId,
      body.roleTitle,
      body.weekNumber,
      body.year,
      body.macroGoals,
      body.ceoDirectReview,
      body.peerSynergy,
    )
  }

  @Post('calculate/ceo/:employeeId')
  @RequireAnyPermission('performance:read_all', 'governance:vote')
  async calculateCeoWeeklyKpi(
    @Param('employeeId') employeeId: string,
    @Body()
    body: {
      weekNumber: number
      year: number
      companyPerformanceScore?: number
    },
  ) {
    return this.kpiEngine.calculateCeoWeeklyKpi(
      employeeId,
      body.weekNumber,
      body.year,
      body.companyPerformanceScore,
    )
  }

  // --------------------------------------------------------------------------
  // 7. PM WEIGHT PROPOSAL GATE
  // --------------------------------------------------------------------------
  @Post('propose-weight')
  @RequireAnyPermission(
    'tasks:create_personal',
    'tasks:create_assign',
    'tasks:approve',
    'performance:evaluate',
    'performance:read_all',
  )
  async proposeTaskWeight(
    @Body()
    body: {
      taskId?: string
      milestoneId?: string
      proposedWeight: number
      category?: 'SMALL' | 'MEDIUM' | 'LARGE' | 'CRITICAL' | 'CUSTOM'
      context?: 'MAIN_SQUAD' | 'OUTSIDE_SQUAD' | 'DIRECT_EXECUTIVE'
    },
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.kpiEngine.proposeTaskWeight({
      ...body,
      actor,
    })
  }

  // --------------------------------------------------------------------------
  // 8. MACRO MILESTONE PM XP AWARD GATE
  // --------------------------------------------------------------------------
  @Post('milestones/:id/approve-xp')
  @RequireAnyPermission('governance:vote', 'performance:evaluate', 'milestones:update')
  async awardMilestoneXpToPm(
    @Param('id') milestoneId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.kpiEngine.awardMilestoneXpToPm(milestoneId, actor)
  }

  // --------------------------------------------------------------------------
  // 9. GOVERNANCE OVERRIDE & MODIFICATION GATE (CEO MFA, CHRO FULL, C-LEVEL, PM)
  // --------------------------------------------------------------------------
  @Post('override')
  @RequireAnyPermission(
    'performance:evaluate',
    'performance:discipline',
    'performance:read_all',
    'governance:vote',
  )
  async overrideRecord(
    @Body()
    body: {
      targetEmployeeId: string
      metricType: 'KPI' | 'XP'
      weekNumber?: number
      year?: number
      score?: number | null
      deltaXp?: number
      newLifetimeXp?: number
      reason?: string
      mfaCode?: string
    },
    @Headers('x-mfa-code') mfaHeader: string | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const mfaCode = (body.mfaCode || mfaHeader || '').trim()
    return this.kpiEngine.overrideRecord({
      ...body,
      mfaCode: mfaCode || undefined,
      actor,
    })
  }

  // --------------------------------------------------------------------------
  // 10. AUDIT LOG MODIFICATION (CHRO FULL ACCESS & CEO)
  // --------------------------------------------------------------------------
  @Patch('audit-log/:id')
  @RequireAnyPermission(
    'performance:discipline',
    'performance:evaluate',
    'performance:read_all',
    'governance:vote',
  )
  async updateAuditLog(
    @Param('id') id: string,
    @Body() body: { reason?: string; notes?: string; actionType?: string },
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.kpiEngine.updateAuditLogEntry(id, body, actor)
  }

  // --------------------------------------------------------------------------
  // 11. PM MILESTONE XP ROUTING & CONSENSUS APPROVAL
  // --------------------------------------------------------------------------
  @Post('milestones/:id/complete-with-xp')
  @RequireAnyPermission('tasks:approve', 'performance:evaluate', 'governance:vote')
  async completeMilestoneWithXp(
    @Param('id') milestoneId: string,
    @Body() body: { pmId: string; weightPoints: number },
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.pmMilestoneXp.completeMilestoneWithXp(
      milestoneId,
      body.pmId,
      Number(body.weightPoints),
      actor,
    )
  }

  @Post('milestones/verification/:id/approve')
  @RequireAnyPermission('xp:release_frozen', 'governance:vote')
  async approveMilestoneVerification(
    @Param('id') verificationId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.pmMilestoneXp.approveMilestoneConsensus(verificationId, actor)
  }

  // --------------------------------------------------------------------------
  // 12. PM WEEKLY EVALUATION INBOX & CONFIRM/ADJUST
  // --------------------------------------------------------------------------
  @Get('pm-evaluations/inbox')
  @RequireAnyPermission('kpis:score_exec', 'performance:evaluate', 'governance:vote')
  async getPmEvaluationsInbox(@CurrentUser() actor: AuthenticatedUser) {
    return this.execWeeklyKpi.getPmEvaluationsInbox(actor)
  }

  @Post('pm-evaluations/:id/confirm')
  @RequireAnyPermission('kpis:score_exec', 'performance:evaluate', 'governance:vote')
  async confirmPmEvaluation(
    @Param('id') evalId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.execWeeklyKpi.confirmPmEvaluation(evalId, actor)
  }

  @Post('pm-evaluations/:id/adjust')
  @RequireAnyPermission('kpis:score_exec', 'performance:evaluate', 'governance:vote')
  async adjustPmEvaluation(
    @Param('id') evalId: string,
    @Body() body: { score: number; reason: string },
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.execWeeklyKpi.adjustPmEvaluation(evalId, Number(body.score), body.reason, actor)
  }

  @Post('c-level/peer-eval')
  @RequireAnyPermission('kpis:score_exec', 'performance:evaluate', 'governance:vote')
  async recordCLevelPeerEval(
    @Body() body: { targetExecutiveId: string; score: number; notes: string },
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.execWeeklyKpi.recordCLevelPeerEval(
      body.targetExecutiveId,
      Number(body.score),
      body.notes,
      actor,
    )
  }

  // --------------------------------------------------------------------------
  // 13. CHRO & CEO DISCIPLINARY DEDUCTION & REVERSAL
  // --------------------------------------------------------------------------
  @Post('disciplinary')
  @RequirePermissions('kpis:discipline_deduct')
  @RequiresFreshMfa('kpis:discipline_deduct')
  async createDisciplinaryDeduction(
    @Body()
    body: {
      userId: string
      points: number
      reason: string
      referenceDocId: string
      targetWeekStart: string
    },
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.disciplinaryService.applyDisciplinaryDeduction(body, actor)
  }

  @Post('disciplinary/:id/reverse')
  @RequirePermissions('kpis:discipline_deduct')
  @RequiresFreshMfa('kpis:discipline_deduct')
  async reverseDisciplinaryDeduction(
    @Param('id') actionId: string,
    @Body() body: { reason: string },
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.disciplinaryService.reverseDisciplinaryDeduction(actionId, body.reason, actor)
  }

  // --------------------------------------------------------------------------
  // 14. SCOPED PERFORMANCE READ APIS & PUBLIC LEADERBOARD
  // --------------------------------------------------------------------------
  @Get('ledger/export')
  @RequireAnyPermission('kpis:export', 'xp:export')
  async exportLedger(
    @Query('userId') userId: string,
    @Query() query: LedgerQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.performanceRead.exportLedger(userId || actor.id, actor, query)
  }

  @Get('ledger/me')
  async getMyLedger(
    @Query() query: LedgerQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.performanceRead.getLedger(actor.id, actor, query)
  }

  @Get('ledger/:userId')
  async getUserLedger(
    @Param('userId') userId: string,
    @Query() query: LedgerQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.performanceRead.getLedger(userId, actor, query)
  }

  @Get('kpi/me')
  async getMyKpiSeries(@CurrentUser() actor: AuthenticatedUser) {
    return this.performanceRead.getKpiSeries(actor.id, actor)
  }

  @Get('kpi/:userId')
  async getUserKpiSeries(
    @Param('userId') userId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.performanceRead.getKpiSeries(userId, actor)
  }

  @Get('xp/me')
  async getMyXpSummary(@CurrentUser() actor: AuthenticatedUser) {
    return this.performanceRead.getXpSummary(actor.id, actor)
  }

  @Get('xp/:userId')
  async getUserXpSummary(
    @Param('userId') userId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.performanceRead.getXpSummary(userId, actor)
  }

  @Get('leaderboard/:userId')
  async getLeaderboardProfile(@Param('userId') userId: string) {
    return this.performanceRead.getLeaderboardProfile(userId)
  }

  @Get('leaderboard')
  async getLeaderboard(
    @Query('period') period?: 'latest_week' | 'four_week_avg' | 'lifetime_xp',
    @Query('role') role?: string,
    @Query('squad') squad?: string,
  ) {
    return this.performanceRead.getLeaderboard(period, role, squad)
  }

  // --------------------------------------------------------------------------
  // 15. CONFIG & BACKFILL WINDOWS GOVERNANCE
  // --------------------------------------------------------------------------
  @Get('config')
  @RequireAnyPermission('performance:read_all', 'kpi:verify_weight', 'performance:discipline')
  async getPerformanceConfig() {
    const [kpiConfig, weightConfigs] = await Promise.all([
      this.prisma.kpiConfig.findFirst(),
      this.prisma.taskWeightConfig.findMany({ orderBy: { points: 'asc' } }),
    ])
    return {
      kpiConfig: kpiConfig || {
        massiveXpThreshold: 200,
        inactivityPenalty: 0.10,
        mainSquadMultiplier: 1.00,
        outsideSquadMultiplier: 0.70,
        isolatedExecMultiplier: 0.50,
      },
      weightConfigs,
    }
  }

  @Put('config')
  @RequireAnyPermission('performance:discipline', 'kpis:discipline_deduct')
  @RequiresFreshMfa('performance:discipline')
  async updatePerformanceConfig(
    @Body() body: { kpiConfig?: any; weightConfigs?: any[] },
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    if (body.kpiConfig) {
      await this.prisma.kpiConfig.upsert({
        where: { id: 'singleton' },
        create: {
          id: 'singleton',
          massiveXpThreshold: body.kpiConfig.massiveXpThreshold ?? 200,
          inactivityPenalty: body.kpiConfig.inactivityPenalty ?? 0.10,
          mainSquadMultiplier: body.kpiConfig.mainSquadMultiplier ?? 1.00,
          outsideSquadMultiplier: body.kpiConfig.outsideSquadMultiplier ?? 0.70,
          isolatedExecMultiplier: body.kpiConfig.isolatedExecMultiplier ?? 0.50,
          updatedById: actor.id,
        },
        update: {
          massiveXpThreshold: body.kpiConfig.massiveXpThreshold,
          inactivityPenalty: body.kpiConfig.inactivityPenalty,
          mainSquadMultiplier: body.kpiConfig.mainSquadMultiplier,
          outsideSquadMultiplier: body.kpiConfig.outsideSquadMultiplier,
          isolatedExecMultiplier: body.kpiConfig.isolatedExecMultiplier,
          updatedById: actor.id,
        },
      })
    }

    if (Array.isArray(body.weightConfigs)) {
      for (const wc of body.weightConfigs) {
        if (wc.category && wc.points !== undefined) {
          await this.prisma.taskWeightConfig.upsert({
            where: { category: wc.category },
            create: {
              category: wc.category,
              points: wc.points,
              description: wc.description,
              updatedById: actor.id,
            },
            update: {
              points: wc.points,
              description: wc.description,
              updatedById: actor.id,
            },
          })
        }
      }
    }

    return this.getPerformanceConfig()
  }

  @Get('backfill-windows')
  @RequireAnyPermission('performance:read_all', 'tasks:approve', 'performance:discipline')
  async getBackfillWindows() {
    return this.prisma.backfillWindow.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { id: true, name: true, title: true } },
      },
    })
  }

  @Post('backfill-windows')
  @RequireAnyPermission('performance:discipline', 'kpis:discipline_deduct')
  @RequiresFreshMfa('performance:discipline')
  async createBackfillWindow(
    @Body() body: { startsAt: string; endsAt: string; grantedRole?: string; reason?: string },
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.prisma.backfillWindow.create({
      data: {
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
        grantedRole: body.grantedRole || 'pm',
        createdById: actor.id,
        isActive: true,
      },
    })
  }

  @Patch('backfill-windows/:id')
  @RequireAnyPermission('performance:discipline', 'kpis:discipline_deduct')
  @RequiresFreshMfa('performance:discipline')
  async updateBackfillWindow(
    @Param('id') id: string,
    @Body() body: { isActive?: boolean; endsAt?: string; reason?: string },
  ) {
    const data: any = {}
    if (body.isActive !== undefined) data.isActive = body.isActive
    if (body.endsAt) data.endsAt = new Date(body.endsAt)

    return this.prisma.backfillWindow.update({
      where: { id },
      data,
    })
  }
}
