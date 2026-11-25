import { isProjectManager } from '../common/employee-role.util'
import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  HttpException,
  Logger,
  Optional,
} from '@nestjs/common'
import { PrismaService } from '../common/prisma.service'
import { AuthenticatedUser } from '../common/auth-user.interface'
import { isEmployeeCeo, verifyTotpCode } from '../common/security-policy.util'
import { Prisma } from '@prisma/client'
import * as crypto from 'crypto'
import {
  xpForTask,
  taskScoreDeveloper,
  weeklyKpiDeveloper,
  weeklyKpiPm,
  weeklyKpiCLevel,
  weeklyKpiCeo,
  applyDisciplinaryDeduction,
  detectInactivity,
} from './kpi-engine'
import { getDhakaWeekBoundaries } from '../common/dhaka-time.util'
import { XpLedgerService } from './xp-ledger.service'

export interface DeveloperTaskMetric {
  taskId: string
  title: string
  grade: number
  weight: number
  contextMultiplier: number // 1.0, 0.7, 0.5
}

@Injectable()
export class KpiEngineService {
  private readonly logger = new Logger(KpiEngineService.name)

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly xpLedger?: XpLedgerService,
  ) {}

  isV2(): boolean {
    return process.env.KPI_ENGINE_V2 === 'true'
  }

  // --------------------------------------------------------------------------
  // SQUAD ASSIGNMENT HELPER: VERIFY IF EMPLOYEE IS IN PM SQUAD
  // --------------------------------------------------------------------------
  async isEmployeeInPmSquad(pmId: string, employeeId: string): Promise<boolean> {
    if (pmId === employeeId) return true

    const sharedTeam = await this.prisma.teamMembership.findFirst({
      where: {
        employeeId,
        isActive: true,
        team: {
          OR: [
            {
              pmPosition: {
                assignments: {
                  some: {
                    employeeId: pmId,
                    isActive: true,
                  },
                },
              },
            },
            {
              memberships: {
                some: {
                  employeeId: pmId,
                  isActive: true,
                  isLead: true,
                },
              },
            },
          ],
        },
      },
    })

    return !!sharedTeam
  }

  // --------------------------------------------------------------------------
  // 1. DEVELOPER (LEVEL 1) WEEKLY KPI CALCULATION
  // --------------------------------------------------------------------------
  async calculateDeveloperWeeklyKpi(
    employeeId: string,
    weekNumber: number,
    year: number,
    actor?: AuthenticatedUser,
  ) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        employeeRoles: { where: { isActive: true }, include: { role: true } },
        assignedTasks: {
          where: {
            status: 'completed',
            updatedAt: {
              gte: this.getWeekStartDate(weekNumber, year),
              lte: this.getWeekEndDate(weekNumber, year),
            },
          },
          include: {
            weightVerification: true,
            project: {
              include: {
                teamProjects: true,
              },
            },
          },
        },
      },
    })

    if (!employee) throw new NotFoundException(`Employee ${employeeId} not found`)

    if (isProjectManager(employee)) {
      throw new BadRequestException('PM KPI must be calculated from C-level weekly evaluations')
    }

    // Check if 0 tasks completed -> Inactivity N/A Red Flag
    const completedTasks = employee.assignedTasks
    if (completedTasks.length === 0) {
      if (this.isV2() && typeof this.prisma.inactivityPenalty?.create === 'function') {
        const { weekStartUtc } = getDhakaWeekBoundaries(weekNumber, year)
        await this.prisma.inactivityPenalty.create({
          data: {
            userId: employeeId,
            weekStart: weekStartUtc,
            consumed: false,
          },
        }).catch(() => {})
      }
      return this.recordInactivityKpi(employeeId, weekNumber, year, 1)
    }

    // Calculate TaskPerformanceScore = Σ(G_i × W_i × M_i) / Σ(W_i × M_i)
    let totalWeightedScore = 0
    let totalWeightMultiplier = 0
    const taskBreakdowns: DeveloperTaskMetric[] = []

    for (const task of completedTasks) {
      const weight = task.weightVerification?.approvedWeight
        ? Number(task.weightVerification.approvedWeight)
        : task.weightVerification?.proposedWeight
          ? Number(task.weightVerification.proposedWeight)
          : 3 // Default medium

      // Context multiplier (1.0 main squad, 0.7 outside squad, 0.5 executive direct)
      let multiplier = 1.0
      if (task.weightVerification?.context === 'OUTSIDE_SQUAD') {
        multiplier = 0.7
      } else if (task.weightVerification?.context === 'DIRECT_EXECUTIVE') {
        multiplier = 0.5
      }

      // Default baseline grade is 90 if not explicitly graded
      const grade = 90
      totalWeightedScore += grade * weight * multiplier
      totalWeightMultiplier += weight * multiplier

      taskBreakdowns.push({
        taskId: task.id,
        title: task.title,
        grade,
        weight,
        contextMultiplier: multiplier,
      })
    }

    const pmScore =
      totalWeightMultiplier > 0
        ? Math.min(100, Math.max(0, totalWeightedScore / totalWeightMultiplier))
        : 85

    // Executive Read-Receipt Policy: Auto-fill CTO (15%), CPO (15%), CFO (10%), CHRO (10%)
    // matching PM's 50% score as provisional draft.
    const ctoScore = pmScore
    const cpoScore = pmScore
    const cfoScore = pmScore
    const chroScore = pmScore

    // Check for Return-from-Inactivity Penalty (10% deduction on next evaluated task / cycle)
    const pendingPenaltyRecord = await this.prisma.weeklyKpiRecord.findFirst({
      where: {
        employeeId,
        inactivityPenaltyPending: true,
      },
      orderBy: [{ year: 'desc' }, { weekNumber: 'desc' }],
    })

    let returnPenaltyApplied = false
    let baseCalculatedScore =
      pmScore * 0.5 + ctoScore * 0.15 + cpoScore * 0.15 + cfoScore * 0.1 + chroScore * 0.1
    let finalScore = baseCalculatedScore

    if (pendingPenaltyRecord) {
      finalScore = this.isV2()
        ? Math.round(baseCalculatedScore * 0.90 * 100) / 100
        : Math.max(0, finalScore - 10)
      returnPenaltyApplied = true
      await this.prisma.weeklyKpiRecord.update({
        where: { id: pendingPenaltyRecord.id },
        data: {
          inactivityPenaltyPending: false,
          inactivityPenaltyApplied: true,
        },
      })
    }

    const existingRecord = await this.prisma.weeklyKpiRecord.findUnique({
      where: {
        employeeId_year_weekNumber: {
          employeeId,
          year,
          weekNumber,
        },
      },
    })

    const evaluationBreakdown = {
      roleLevel: 1,
      roleName: 'Developer',
      tasksCompletedCount: completedTasks.length,
      taskMetrics: taskBreakdowns,
      formula: '50% PM + 15% CTO + 15% CPO + 10% CFO + 10% CHRO',
      returnPenaltyApplied,
      returnPenaltyDeduction: returnPenaltyApplied ? 10 : 0,
      baseCalculatedScore,
      provisionalAutoFilled: true,
      executiveSignoffs: {
        cto: { status: 'PROVISIONAL', confirmedAt: null },
        cpo: { status: 'PROVISIONAL', confirmedAt: null },
        cfo: { status: 'PROVISIONAL', confirmedAt: null },
        chro: { status: 'PROVISIONAL', confirmedAt: null },
      },
    }

    const record = await this.prisma.weeklyKpiRecord.upsert({
      where: {
        employeeId_year_weekNumber: {
          employeeId,
          year,
          weekNumber,
        },
      },
      update: {
        score: new Prisma.Decimal(finalScore.toFixed(2)),
        isInactive: false,
        pmScore: new Prisma.Decimal(pmScore.toFixed(2)),
        ctoScore: new Prisma.Decimal(ctoScore.toFixed(2)),
        cpoScore: new Prisma.Decimal(cpoScore.toFixed(2)),
        cfoScore: new Prisma.Decimal(cfoScore.toFixed(2)),
        chroScore: new Prisma.Decimal(chroScore.toFixed(2)),
        evaluationBreakdown: evaluationBreakdown as any,
        updatedAt: new Date(),
      },
      create: {
        employeeId,
        weekNumber,
        year,
        score: new Prisma.Decimal(finalScore.toFixed(2)),
        isInactive: false,
        roleLevel: 1,
        evaluationStatus: 'PROVISIONAL',
        pmScore: new Prisma.Decimal(pmScore.toFixed(2)),
        ctoScore: new Prisma.Decimal(ctoScore.toFixed(2)),
        cpoScore: new Prisma.Decimal(cpoScore.toFixed(2)),
        cfoScore: new Prisma.Decimal(cfoScore.toFixed(2)),
        chroScore: new Prisma.Decimal(chroScore.toFixed(2)),
        evaluationBreakdown: evaluationBreakdown as any,
      },
    })

    // Log to immutable audit ledger
    await this.appendKpiAuditLog({
      employeeId,
      metricType: 'KPI',
      deltaValue: new Prisma.Decimal(finalScore.toFixed(2)),
      resultingTotal: new Prisma.Decimal(finalScore.toFixed(2)),
      actionType: 'WEEKLY_KPI_FINAL',
      triggerEvent: `Week ${weekNumber} (${year}) Developer Evaluation Finalized`,
      authorizedById: actor?.id || null,
      authorizedRole: actor?.role?.toUpperCase() || 'SYSTEM',
      reason: 'Automated weekly evaluation calculation',
    })

    return record
  }

  // --------------------------------------------------------------------------
  // 2. PROJECT MANAGER (LEVEL 2) WEEKLY KPI CALCULATION
  // --------------------------------------------------------------------------
  async calculatePmWeeklyKpi(
    employeeId: string,
    weekNumber: number,
    year: number,
    ratings?: {
      ctoScore?: number
      cpoScore?: number
      cfoScore?: number
      chroScore?: number
      notes?: string
    },
    actor?: AuthenticatedUser,
  ) {
    if (actor && !['ceo', 'cto', 'cpo', 'cfo', 'chro'].includes((actor.role || '').toLowerCase())) {
      throw new ForbiddenException('Only C-level executives may score PM weekly KPI')
    }

    const cto = ratings?.ctoScore ?? 88
    const cpo = ratings?.cpoScore ?? 88
    const cfo = ratings?.cfoScore ?? 85
    const chro = ratings?.chroScore ?? 90

    // 30% CTO + 30% CPO + 20% CFO + 20% CHRO = 100%
    const baseScore = cto * 0.3 + cpo * 0.3 + cfo * 0.2 + chro * 0.2

    // Check for Return-from-Inactivity Penalty (10% deduction on next evaluated cycle)
    const pendingPenaltyRecord = await this.prisma.weeklyKpiRecord.findFirst({
      where: {
        employeeId,
        inactivityPenaltyPending: true,
      },
      orderBy: [{ year: 'desc' }, { weekNumber: 'desc' }],
    })

    let returnPenaltyApplied = false
    let finalScore = baseScore
    if (pendingPenaltyRecord) {
      finalScore = this.isV2()
        ? Math.round(baseScore * 0.90 * 100) / 100
        : Math.max(0, finalScore - 10)
      returnPenaltyApplied = true
      await this.prisma.weeklyKpiRecord.update({
        where: { id: pendingPenaltyRecord.id },
        data: {
          inactivityPenaltyPending: false,
          inactivityPenaltyApplied: true,
        },
      })
    }

    const breakdown = {
      roleLevel: 2,
      roleName: 'Project Manager',
      formula: '30% CTO + 30% CPO + 20% CFO + 20% CHRO',
      ratings: { cto, cpo, cfo, chro },
      baseScore,
      returnPenaltyApplied,
      returnPenaltyDeduction: returnPenaltyApplied ? 10 : 0,
      notes: ratings?.notes || 'Weekly PM squad performance evaluation',
    }

    const record = await this.prisma.weeklyKpiRecord.upsert({
      where: {
        employeeId_year_weekNumber: {
          employeeId,
          year,
          weekNumber,
        },
      },
      update: {
        score: new Prisma.Decimal(finalScore.toFixed(2)),
        isInactive: false,
        pmScore: null,
        ctoScore: new Prisma.Decimal(cto.toFixed(2)),
        cpoScore: new Prisma.Decimal(cpo.toFixed(2)),
        cfoScore: new Prisma.Decimal(cfo.toFixed(2)),
        chroScore: new Prisma.Decimal(chro.toFixed(2)),
        evaluationStatus: 'CONFIRMED',
        evaluationBreakdown: breakdown as any,
        updatedAt: new Date(),
      },
      create: {
        employeeId,
        weekNumber,
        year,
        score: new Prisma.Decimal(finalScore.toFixed(2)),
        isInactive: false,
        roleLevel: 2,
        evaluationStatus: 'CONFIRMED',
        ctoScore: new Prisma.Decimal(cto.toFixed(2)),
        cpoScore: new Prisma.Decimal(cpo.toFixed(2)),
        cfoScore: new Prisma.Decimal(cfo.toFixed(2)),
        chroScore: new Prisma.Decimal(chro.toFixed(2)),
        evaluationBreakdown: breakdown as any,
      },
    })

    await this.appendKpiAuditLog({
      employeeId,
      metricType: 'KPI',
      deltaValue: new Prisma.Decimal(finalScore.toFixed(2)),
      resultingTotal: new Prisma.Decimal(finalScore.toFixed(2)),
      actionType: 'WEEKLY_KPI_FINAL',
      triggerEvent: `Week ${weekNumber} PM Performance Evaluation`,
      authorizedById: actor?.id || null,
      authorizedRole: actor?.role?.toUpperCase() || 'C_LEVEL',
      reason: ratings?.notes || 'C-Level PM assessment',
    })

    return record
  }

  // --------------------------------------------------------------------------
  // 3. C-LEVEL (LEVEL 3) & CEO (LEVEL 4) WEEKLY KPI
  // --------------------------------------------------------------------------
  async calculateCLevelWeeklyKpi(
    employeeId: string,
    roleTitle: 'CTO' | 'CPO' | 'CFO' | 'CHRO',
    weekNumber: number,
    year: number,
    macroGoals: number = 90,
    ceoDirectReview: number = 90,
    peerSynergy: number = 88,
  ) {
    // 30% Domain Execution: average of squad KPIs
    const pmKpis = await this.prisma.weeklyKpiRecord.findMany({
      where: {
        roleLevel: 2,
        weekNumber,
        year,
        isInactive: false,
      },
      select: { score: true },
    })

    const domainExecutionAvg =
      pmKpis.length > 0
        ? pmKpis.reduce((acc, curr) => acc + Number(curr.score || 0), 0) / pmKpis.length
        : 85

    // 40% Macro + 30% Domain + 20% CEO + 10% Peer = 100%
    const finalScore =
      macroGoals * 0.4 + domainExecutionAvg * 0.3 + ceoDirectReview * 0.2 + peerSynergy * 0.1

    const breakdown = {
      roleLevel: 3,
      roleName: roleTitle,
      formula: '40% Macro Goals + 30% Domain Avg + 20% CEO Review + 10% Peer Synergy',
      macroGoals,
      domainExecutionAvg,
      ceoDirectReview,
      peerSynergy,
    }

    return this.prisma.weeklyKpiRecord.upsert({
      where: {
        employeeId_year_weekNumber: {
          employeeId,
          year,
          weekNumber,
        },
      },
      update: {
        score: new Prisma.Decimal(finalScore.toFixed(2)),
        isInactive: false,
        evaluationStatus: 'CONFIRMED',
        evaluationBreakdown: breakdown as any,
      },
      create: {
        employeeId,
        weekNumber,
        year,
        score: new Prisma.Decimal(finalScore.toFixed(2)),
        roleLevel: 3,
        evaluationStatus: 'CONFIRMED',
        evaluationBreakdown: breakdown as any,
      },
    })
  }

  async calculateCeoWeeklyKpi(
    ceoEmployeeId: string,
    weekNumber: number,
    year: number,
    companyPerformanceScore: number = 92,
  ) {
    // 40% C-Level Aggregate: Average of CTO, CPO, CFO, CHRO weekly KPIs
    const cLevelRecords = await this.prisma.weeklyKpiRecord.findMany({
      where: {
        roleLevel: 3,
        weekNumber,
        year,
        isInactive: false,
      },
      select: { score: true },
    })

    const cLevelAggregate =
      cLevelRecords.length > 0
        ? cLevelRecords.reduce((acc, curr) => acc + Number(curr.score || 0), 0) /
          cLevelRecords.length
        : 88

    // 60% Company Performance + 40% C-Level Aggregate = 100%
    const finalScore = companyPerformanceScore * 0.6 + cLevelAggregate * 0.4

    return this.prisma.weeklyKpiRecord.upsert({
      where: {
        employeeId_year_weekNumber: {
          employeeId: ceoEmployeeId,
          year,
          weekNumber,
        },
      },
      update: {
        score: new Prisma.Decimal(finalScore.toFixed(2)),
        isInactive: false,
        evaluationStatus: 'CONFIRMED',
        evaluationBreakdown: {
          roleLevel: 4,
          roleName: 'CEO',
          formula: '60% Company Performance + 40% C-Level Aggregate',
          companyPerformanceScore,
          cLevelAggregate,
        } as any,
      },
      create: {
        employeeId: ceoEmployeeId,
        weekNumber,
        year,
        score: new Prisma.Decimal(finalScore.toFixed(2)),
        roleLevel: 4,
        evaluationStatus: 'CONFIRMED',
        evaluationBreakdown: {
          roleLevel: 4,
          roleName: 'CEO',
          formula: '60% Company Performance + 40% C-Level Aggregate',
          companyPerformanceScore,
          cLevelAggregate,
        } as any,
      },
    })
  }

  // --------------------------------------------------------------------------
  // 4. INACTIVITY DETECTION (N/A RED FLAG) & PENALTY ENFORCEMENT
  // --------------------------------------------------------------------------
  async recordInactivityKpi(
    employeeId: string,
    weekNumber: number,
    year: number,
    roleLevel: number = 1,
  ) {
    const breakdown = {
      roleLevel,
      status: 'N/A',
      reason: 'Inactivity: Zero tasks/milestones completed during the weekly cycle',
      inactivityPenaltyApplied: true,
      penaltyRule: '10% deduction on next evaluated task',
    }

    const record = await this.prisma.weeklyKpiRecord.upsert({
      where: {
        employeeId_year_weekNumber: {
          employeeId,
          year,
          weekNumber,
        },
      },
      update: {
        score: null, // Null indicates N/A Red Flag
        isInactive: true,
        inactivityPenaltyPending: true,
        evaluationStatus: 'CONFIRMED',
        evaluationBreakdown: breakdown as any,
      },
      create: {
        employeeId,
        weekNumber,
        year,
        score: null,
        isInactive: true,
        inactivityPenaltyPending: true,
        roleLevel,
        evaluationStatus: 'CONFIRMED',
        evaluationBreakdown: breakdown as any,
      },
    })

    await this.appendKpiAuditLog({
      employeeId,
      metricType: 'KPI',
      deltaValue: new Prisma.Decimal(0),
      resultingTotal: null,
      actionType: 'INACTIVITY_PENALTY',
      triggerEvent: `Week ${weekNumber} Zero Activity Inactivity Flag`,
      authorizedById: null,
      authorizedRole: 'SYSTEM',
      reason: 'Flagged N/A Red Flag; 10% penalty pending on next task',
    })

    return record
  }

  // --------------------------------------------------------------------------
  // 5. CHRO DISCIPLINARY DEDUCTION (WITH AUDIT)
  // --------------------------------------------------------------------------
  async applyDisciplinaryDeduction(
    employeeId: string,
    deductionPoints: number,
    reason: string,
    chroActor: AuthenticatedUser,
  ) {
    if (deductionPoints <= 0 || deductionPoints > 100) {
      throw new BadRequestException('Deduction points must be between 1 and 100')
    }

    const latestKpi = await this.prisma.weeklyKpiRecord.findFirst({
      where: { employeeId, isInactive: false },
      orderBy: [{ year: 'desc' }, { weekNumber: 'desc' }],
    })

    if (!latestKpi || !latestKpi.score) {
      throw new NotFoundException('No active weekly KPI record found to deduct from')
    }

    const currentScore = Number(latestKpi.score)
    const newScore = Math.max(0, currentScore - deductionPoints)

    await this.prisma.weeklyKpiRecord.update({
      where: { id: latestKpi.id },
      data: {
        score: new Prisma.Decimal(newScore.toFixed(2)),
        evaluationBreakdown: {
          ...(latestKpi.evaluationBreakdown as any),
          disciplinaryDeductions: [
            ...((latestKpi.evaluationBreakdown as any)?.disciplinaryDeductions || []),
            {
              deductedBy: chroActor.id,
              points: deductionPoints,
              reason,
              timestamp: new Date().toISOString(),
            },
          ],
        },
      },
    })

    await this.appendKpiAuditLog({
      employeeId,
      metricType: 'KPI',
      deltaValue: new Prisma.Decimal((-deductionPoints).toFixed(2)),
      resultingTotal: new Prisma.Decimal(newScore.toFixed(2)),
      actionType: 'CHRO_DISCIPLINARY',
      triggerEvent: `Disciplinary Action: ${reason}`,
      authorizedById: chroActor.id,
      authorizedRole: 'CHRO',
      reason,
    })

    if (this.isV2() && typeof this.prisma.disciplinaryAction?.create === 'function') {
      const { weekStartUtc } = getDhakaWeekBoundaries(latestKpi.weekNumber, latestKpi.year)
      await this.prisma.disciplinaryAction.create({
        data: {
          userId: employeeId,
          deductionPoints: new Prisma.Decimal(deductionPoints),
          reason,
          referenceDocId: `ref_${Date.now()}`,
          appliedByChroId: chroActor.id,
          weekStart: latestKpi.weekStart || weekStartUtc,
        },
      }).catch(() => {})
    }

    return {
      success: true,
      previousScore: currentScore,
      deductionPoints,
      newScore,
      reason,
    }
  }

  // --------------------------------------------------------------------------
  // 6. CHRO TASK WEIGHT VERIFICATION GATE & MASSIVE XP
  // --------------------------------------------------------------------------
  async verifyTaskWeight(
    verificationId: string,
    approvedWeight: number,
    chroActor: AuthenticatedUser,
    notes?: string,
  ) {
    const verification = await this.prisma.taskWeightVerification.findUnique({
      where: { id: verificationId },
      include: { task: true, milestone: true },
    })

    if (!verification) {
      throw new NotFoundException(`Task weight verification ${verificationId} not found`)
    }

    const isModified = approvedWeight !== Number(verification.proposedWeight)
    const kpiConfig = typeof this.prisma.kpiConfig?.findUnique === 'function'
      ? await this.prisma.kpiConfig.findUnique({ where: { id: 'singleton' } })
      : null
    const massiveThreshold = this.isV2() ? (kpiConfig?.massiveXpThreshold || 200) : 500
    const isMassiveXp = this.isV2() ? (approvedWeight * 10 >= massiveThreshold) : (approvedWeight >= 50)

    const updated = await this.prisma.taskWeightVerification.update({
      where: { id: verificationId },
      data: {
        approvedWeight: new Prisma.Decimal(approvedWeight),
        status: 'APPROVED',
        chroId: chroActor.id,
        chroNotes: notes || null,
        isMassiveXp,
        massiveXpFrozen: isMassiveXp,
      },
    })

    // ponytail: Ensure task table reflects verified weight and category
    if (verification.taskId) {
      const cat = ({ 1: 'SMALL', 2: 'MEDIUM', 3: 'LARGE', 5: 'CRITICAL' } as const)[Number(approvedWeight)] || 'CUSTOM'
      await this.prisma.task.update({
        where: { id: verification.taskId },
        data: {
          weightPoints: new Prisma.Decimal(approvedWeight),
          weightCategory: cat as any,
          weightStatus: 'VERIFIED',
          verifiedById: chroActor.id,
        },
      })
    }

    // If task was already completed and weight was pending, disburse XP now
    if (verification.task && verification.task.status === 'completed' && !isMassiveXp && verification.status === 'PENDING_CHRO') {
      const context = verification.context || 'MAIN_SQUAD'
      const squadMultiplier = context === 'MAIN_SQUAD' ? 1.0 : context === 'OUTSIDE_SQUAD' ? 0.7 : 0.5
      const xpYield = this.isV2()
        ? Math.round(approvedWeight * 10)
        : Math.round(approvedWeight * squadMultiplier * 10)

      if (this.isV2() && this.xpLedger) {
        await this.xpLedger.appendEvent({
          employeeId: verification.task.assigneeId,
          delta: xpYield,
          eventType: 'VERIFY_RELEASE',
          reason: `CHRO verified weight ${approvedWeight} pts yields ${xpYield} XP`,
          taskId: verification.task.id,
          awardedById: chroActor.id,
        })
      } else {
        await this.prisma.employee.update({
          where: { id: verification.task.assigneeId },
          data: { lifetimeXp: { increment: xpYield } },
        })

        if (typeof this.prisma.xpLedgerEntry?.create === 'function') {
          await this.prisma.xpLedgerEntry.create({
            data: {
              employeeId: verification.task.assigneeId,
              delta: xpYield,
              reason: `CHRO verified weight ${approvedWeight} (${context}, yields ${xpYield} XP)`,
              entryType: 'AWARD',
              status: 'POSTED',
              awardedById: chroActor.id,
            },
          })
        }
      }

      await this.appendKpiAuditLog({
        employeeId: verification.task.assigneeId,
        metricType: 'XP',
        deltaValue: new Prisma.Decimal(xpYield),
        actionType: 'TASK_XP_YIELD',
        triggerEvent: `Weight Approved: ${verification.task.title}`,
        taskId: verification.task.id,
        authorizedById: chroActor.id,
        authorizedRole: 'CHRO',
        reason: `CHRO verified weight ${approvedWeight} (${context}, yields ${xpYield} XP)`,
      })
    }

    return updated
  }

  // --------------------------------------------------------------------------
  // 7. C-LEVEL MASSIVE XP CONSENSUS VOTING
  // --------------------------------------------------------------------------
  async castConsensusVote(
    verificationId: string,
    executiveActor: AuthenticatedUser,
    decision: 'APPROVE' | 'REJECT',
    notes?: string,
  ) {
    const verification = await this.prisma.taskWeightVerification.findUnique({
      where: { id: verificationId },
      include: {
        task: true,
        consensusVotes: true,
      },
    })

    if (!verification) throw new NotFoundException('Verification record not found')

    // Separation of Duties: Assignee and PM cannot vote on their own task
    if (verification.task?.assigneeId === executiveActor.id) {
      throw new ForbiddenException('Task assignee cannot vote on their own massive XP payout')
    }
    if (verification.proposerId === executiveActor.id) {
      throw new ForbiddenException('Task proposer cannot vote on their proposed massive XP payout')
    }

    await this.prisma.taskWeightConsensusVote.upsert({
      where: {
        verificationId_executiveId: {
          verificationId,
          executiveId: executiveActor.id,
        },
      },
      update: { decision, notes, votedAt: new Date() },
      create: {
        verificationId,
        executiveId: executiveActor.id,
        executiveRole: executiveActor.role.toUpperCase(),
        decision,
        notes,
      },
    })

    // Check if quorum (>= 2 C-Level approvals) reached
    const votes = await this.prisma.taskWeightConsensusVote.findMany({
      where: { verificationId, decision: 'APPROVE' },
    })

    if (votes.length >= 2 && verification.massiveXpFrozen) {
      const approvedWeight = Number(verification.approvedWeight || verification.proposedWeight)
      const context = verification.context || 'MAIN_SQUAD'
      const squadMultiplier = context === 'MAIN_SQUAD' ? 1.0 : context === 'OUTSIDE_SQUAD' ? 0.7 : 0.5
      const xpYield = this.isV2()
        ? Math.round(approvedWeight * 10)
        : Math.round(approvedWeight * squadMultiplier * 10)

      await this.prisma.$transaction(async (tx) => {
        await tx.taskWeightVerification.update({
          where: { id: verificationId },
          data: { massiveXpFrozen: false },
        })

        // Guard: Only disburse XP upon consensus if the deliverable is already completed.
        // Otherwise, payout is unlocked and will be disbursed upon PM task approval.
        if (verification.task && verification.task.status === 'completed') {
          if (this.isV2() && this.xpLedger) {
            await this.xpLedger.appendEvent(
              {
                employeeId: verification.task.assigneeId,
                delta: xpYield,
                eventType: 'RELEASE_FROZEN',
                reason: `C-Level consensus quorum reached: released ${xpYield} massive XP for task ${verification.task.id}`,
                taskId: verification.task.id,
                awardedById: executiveActor.id,
              },
              tx,
            )
          } else {
            await tx.employee.update({
              where: { id: verification.task.assigneeId },
              data: { lifetimeXp: { increment: xpYield } },
            })
          }
        }
      })

      if (verification.task && verification.task.status === 'completed') {
        await this.appendKpiAuditLog({
          employeeId: verification.task.assigneeId,
          metricType: 'XP',
          deltaValue: new Prisma.Decimal(xpYield),
          actionType: 'MASSIVE_XP_RELEASE',
          triggerEvent: `Massive XP Released: ${verification.task.title}`,
          taskId: verification.task.id,
          authorizedById: executiveActor.id,
          authorizedRole: 'C_LEVEL_CONSENSUS',
          reason: `Quorum reached (${votes.length} approvals) for massive XP payout`,
        })
      }

      return { status: 'UNFROZEN', approvalsCount: votes.length, xpYield }
    }

    return { status: 'VOTE_RECORDED', approvalsCount: votes.length }
  }

  // --------------------------------------------------------------------------
  // 7B. EXECUTIVE READ-RECEIPT CONFIRMATION & REVIEW GATE
  // --------------------------------------------------------------------------
  async getExecutivePendingReviews(actor: AuthenticatedUser) {
    const role = actor.role.toLowerCase()
    const isExecutive = ['ceo', 'chro', 'cto', 'cfo', 'cpo'].includes(role)
    if (!isExecutive) {
      throw new ForbiddenException('Only C-Suite executives can access pending review queues')
    }

    return this.prisma.weeklyKpiRecord.findMany({
      where: {
        evaluationStatus: 'PROVISIONAL',
      },
      include: {
        employee: {
          select: {
            id: true,
            name: true,
            title: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: [{ year: 'desc' }, { weekNumber: 'desc' }],
    })
  }

  async confirmExecutiveReview(
    recordId: string,
    executiveActor: AuthenticatedUser,
    options?: {
      overrideScore?: number
      notes?: string
    },
  ) {
    const role = executiveActor.role.toLowerCase()
    const isExecutive = ['ceo', 'chro', 'cto', 'cfo', 'cpo'].includes(role)
    if (!isExecutive) {
      throw new ForbiddenException('Only C-Suite executives can confirm weekly evaluations')
    }

    const record = await this.prisma.weeklyKpiRecord.findUnique({
      where: { id: recordId },
      include: { employee: true },
    })

    if (!record) {
      throw new NotFoundException(`Weekly KPI record ${recordId} not found`)
    }

    const execRole = executiveActor.role.toUpperCase()
    let cto = Number(record.ctoScore ?? record.score ?? 85)
    let cpo = Number(record.cpoScore ?? record.score ?? 85)
    let cfo = Number(record.cfoScore ?? record.score ?? 85)
    let chro = Number(record.chroScore ?? record.score ?? 85)
    const pm = Number(record.pmScore ?? record.score ?? 85)

    if (options?.overrideScore !== undefined) {
      if (execRole === 'CTO') cto = options.overrideScore
      else if (execRole === 'CPO') cpo = options.overrideScore
      else if (execRole === 'CFO') cfo = options.overrideScore
      else if (execRole === 'CHRO') chro = options.overrideScore
    }

    const existingBreakdown = (record.evaluationBreakdown as any) || {}
    const penaltyApplied = existingBreakdown.returnPenaltyApplied ?? false

    // Recalculate composite weekly score: 50% PM + 15% CTO + 15% CPO + 10% CFO + 10% CHRO
    let recalculatedScore = pm * 0.5 + cto * 0.15 + cpo * 0.15 + cfo * 0.1 + chro * 0.1
    if (penaltyApplied) {
      recalculatedScore = Math.max(0, recalculatedScore - 10)
    }

    const reviews = existingBreakdown.executiveReviews || []
    reviews.push({
      executiveId: executiveActor.id,
      executiveRole: execRole,
      confirmedAt: new Date().toISOString(),
      overrideScore: options?.overrideScore,
      notes: options?.notes,
    })

    const updateData: any = {
      score: new Prisma.Decimal(recalculatedScore.toFixed(2)),
      ctoScore: new Prisma.Decimal(cto.toFixed(2)),
      cpoScore: new Prisma.Decimal(cpo.toFixed(2)),
      cfoScore: new Prisma.Decimal(cfo.toFixed(2)),
      chroScore: new Prisma.Decimal(chro.toFixed(2)),
      evaluationStatus: 'CONFIRMED',
      evaluationBreakdown: {
        ...existingBreakdown,
        executiveReviews: reviews,
        executiveSignoffs: {
          ...(existingBreakdown.executiveSignoffs || {}),
          [execRole.toLowerCase()]: {
            status: 'CONFIRMED',
            confirmedAt: new Date().toISOString(),
            overrideScore: options?.overrideScore,
          },
        },
      },
    }

    const updated = await this.prisma.weeklyKpiRecord.update({
      where: { id: recordId },
      data: updateData,
    })

    await this.appendKpiAuditLog({
      employeeId: record.employeeId,
      metricType: 'KPI',
      deltaValue: new Prisma.Decimal(0),
      resultingTotal: new Prisma.Decimal(recalculatedScore.toFixed(2)),
      actionType: 'WEEKLY_KPI_FINAL',
      triggerEvent: `Executive Confirmation: ${execRole} confirmed Week ${record.weekNumber} KPI`,
      authorizedById: executiveActor.id,
      authorizedRole: execRole,
      reason: options?.notes || `${execRole} confirmed weekly KPI review`,
    })

    return updated
  }

  // --------------------------------------------------------------------------
  // 8. APPEND-ONLY CRYPTOGRAPHIC AUDIT LOG
  // --------------------------------------------------------------------------
  async appendKpiAuditLog(data: {
    employeeId: string
    metricType: 'KPI' | 'XP'
    deltaValue: Prisma.Decimal
    resultingTotal?: Prisma.Decimal | null
    actionType: string
    triggerEvent: string
    taskId?: string | null
    authorizedById?: string | null
    authorizedRole: string
    reason?: string | null
  }) {
    // Get last entry to compute SHA-256 hash chain
    const lastEntry = await this.prisma.kpiXpAuditLog.findFirst({
      orderBy: { sequence: 'desc' },
      select: { sequence: true, entryHash: true },
    })

    const sequence = (lastEntry?.sequence || 0) + 1
    const prevHash = lastEntry?.entryHash || '00000000000000000000000000000000'

    const payload = `${sequence}|${prevHash}|${data.employeeId}|${data.metricType}|${data.deltaValue}|${data.actionType}|${Date.now()}`
    const entryHash = crypto.createHash('sha256').update(payload).digest('hex')

    return this.prisma.kpiXpAuditLog.create({
      data: {
        sequence,
        prevHash,
        entryHash,
        employeeId: data.employeeId,
        metricType: data.metricType,
        deltaValue: data.deltaValue,
        resultingTotal: data.resultingTotal,
        actionType: data.actionType,
        triggerEvent: data.triggerEvent,
        taskId: data.taskId,
        authorizedById: data.authorizedById,
        authorizedRole: data.authorizedRole,
        reason: data.reason,
      },
    })
  }

  // --------------------------------------------------------------------------
  // 9. QUERY INTERFACES (USER-FACING AUDIT & TRENDS)
  // --------------------------------------------------------------------------
  async getEmployeeKpiHistory(employeeId: string) {
    return this.prisma.weeklyKpiRecord.findMany({
      where: { employeeId },
      orderBy: [{ year: 'asc' }, { weekNumber: 'asc' }],
    })
  }

  async getEmployeeAuditLogs(employeeId: string) {
    return this.prisma.kpiXpAuditLog.findMany({
      where: { employeeId },
      orderBy: { createdAt: 'desc' },
      include: {
        authorizedBy: {
          select: { id: true, name: true, title: true },
        },
      },
    })
  }

  // --------------------------------------------------------------------------
  // 10. PM TASK & MILESTONE WEIGHT PROPOSAL
  // --------------------------------------------------------------------------
  async proposeTaskWeight(data: {
    taskId?: string
    milestoneId?: string
    proposedWeight: number
    category?: 'SMALL' | 'MEDIUM' | 'LARGE' | 'CRITICAL' | 'CUSTOM'
    context?: 'MAIN_SQUAD' | 'OUTSIDE_SQUAD' | 'DIRECT_EXECUTIVE'
    actor: AuthenticatedUser
  }) {
    const role = data.actor.role?.toLowerCase()
    const isExecutive = ['ceo', 'chro', 'cto', 'cfo', 'cpo'].includes(role)
    const isPm = role === 'pm'

    if (!isExecutive && !isPm) {
      throw new ForbiddenException('Only Project Managers and C-Suite executives can propose task weights')
    }

    if (!data.taskId && !data.milestoneId) {
      throw new BadRequestException('Either taskId or milestoneId must be provided')
    }

    const proposedWeight = Number(data.proposedWeight)
    if (proposedWeight <= 0) {
      throw new BadRequestException('Proposed weight must be greater than 0')
    }

    const isMassiveXp = proposedWeight >= 50
    const category =
      data.category ||
      (proposedWeight <= 1
        ? 'SMALL'
        : proposedWeight <= 3
          ? 'MEDIUM'
          : proposedWeight <= 5
            ? 'LARGE'
            : 'CRITICAL')
    const context = data.context || (isExecutive ? 'DIRECT_EXECUTIVE' : 'MAIN_SQUAD')
    const status = isExecutive ? 'APPROVED' : 'PENDING_CHRO'

    let record
    if (data.taskId) {
      record = await this.prisma.taskWeightVerification.upsert({
        where: { taskId: data.taskId },
        update: {
          proposedWeight: new Prisma.Decimal(proposedWeight),
          approvedWeight: isExecutive ? new Prisma.Decimal(proposedWeight) : null,
          category: category as any,
          context: context as any,
          status: status as any,
          proposerId: data.actor.id,
          chroId: isExecutive ? data.actor.id : null,
          isMassiveXp,
          massiveXpFrozen: isMassiveXp,
        },
        create: {
          taskId: data.taskId,
          proposedWeight: new Prisma.Decimal(proposedWeight),
          approvedWeight: isExecutive ? new Prisma.Decimal(proposedWeight) : null,
          category: category as any,
          context: context as any,
          status: status as any,
          proposerId: data.actor.id,
          chroId: isExecutive ? data.actor.id : null,
          isMassiveXp,
          massiveXpFrozen: isMassiveXp,
        },
      })
    } else {
      record = await this.prisma.taskWeightVerification.upsert({
        where: { milestoneId: data.milestoneId! },
        update: {
          proposedWeight: new Prisma.Decimal(proposedWeight),
          approvedWeight: isExecutive ? new Prisma.Decimal(proposedWeight) : null,
          category: category as any,
          context: context as any,
          status: status as any,
          proposerId: data.actor.id,
          chroId: isExecutive ? data.actor.id : null,
          isMassiveXp,
          massiveXpFrozen: isMassiveXp,
        },
        create: {
          milestoneId: data.milestoneId!,
          proposedWeight: new Prisma.Decimal(proposedWeight),
          approvedWeight: isExecutive ? new Prisma.Decimal(proposedWeight) : null,
          category: category as any,
          context: context as any,
          status: status as any,
          proposerId: data.actor.id,
          chroId: isExecutive ? data.actor.id : null,
          isMassiveXp,
          massiveXpFrozen: isMassiveXp,
        },
      })
    }

    return record
  }

  // --------------------------------------------------------------------------
  // 11. MACRO PROJECT MILESTONES XP AWARD FOR PMS (C-LEVEL APPROVED)
  // --------------------------------------------------------------------------
  async awardMilestoneXpToPm(milestoneId: string, actor: AuthenticatedUser) {
    const role = actor.role?.toLowerCase()
    const isExecutive = ['ceo', 'chro', 'cto', 'cfo', 'cpo'].includes(role)
    if (!isExecutive) {
      throw new ForbiddenException('Only C-Suite executives can approve macro project milestones for PM XP')
    }

    const milestone = await this.prisma.projectMilestone.findUnique({
      where: { id: milestoneId },
      include: {
        weightVerification: true,
        project: {
          include: {
            teamProjects: {
              where: { isActive: true },
              include: {
                team: {
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
                      where: { isLead: true, isActive: true },
                      include: { employee: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    })

    if (!milestone) throw new NotFoundException(`Milestone ${milestoneId} not found`)

    let pmEmployee: any = null
    for (const tp of milestone.project?.teamProjects || []) {
      const activePm = tp.team.pmPosition?.assignments[0]?.employee
      if (activePm) {
        pmEmployee = activePm
        break
      }
      const lead = tp.team.memberships[0]?.employee
      if (lead) {
        pmEmployee = lead
        break
      }
    }

    if (!pmEmployee) {
      throw new NotFoundException('No active Project Manager found for the milestone project')
    }

    const weight = milestone.weightVerification?.approvedWeight
      ? Number(milestone.weightVerification.approvedWeight)
      : milestone.weightVerification?.proposedWeight
        ? Number(milestone.weightVerification.proposedWeight)
        : 10

    const xpYield = Math.round(weight * 10)

    await this.prisma.employee.update({
      where: { id: pmEmployee.id },
      data: { lifetimeXp: { increment: xpYield } },
    })

    await this.prisma.xpLedgerEntry.create({
      data: {
        employeeId: pmEmployee.id,
        delta: xpYield,
        reason: `Macro Project Milestone XP Award (${weight} weight): ${milestone.title}`,
        entryType: 'AWARD',
        awardedById: actor.id,
      },
    })

    await this.appendKpiAuditLog({
      employeeId: pmEmployee.id,
      metricType: 'XP',
      deltaValue: new Prisma.Decimal(xpYield),
      resultingTotal: new Prisma.Decimal((pmEmployee.lifetimeXp || 0) + xpYield),
      actionType: 'TASK_XP_YIELD',
      triggerEvent: `Macro Milestone Approved: ${milestone.title}`,
      authorizedById: actor.id,
      authorizedRole: actor.role.toUpperCase(),
      reason: `C-Level approved macro project milestone (${weight} weight yields ${xpYield} XP)`,
    })

    return { success: true, pmId: pmEmployee.id, xpYield, milestoneTitle: milestone.title }
  }

  // --------------------------------------------------------------------------
  // 12. UNIVERSAL GOVERNANCE KPI & XP OVERRIDE (CEO MFA, CHRO FULL ACCESS, C-LEVEL, PM)
  // --------------------------------------------------------------------------
  async overrideRecord(params: {
    targetEmployeeId: string
    metricType: 'KPI' | 'XP'
    weekNumber?: number
    year?: number
    score?: number | null
    deltaXp?: number
    newLifetimeXp?: number
    reason?: string
    mfaCode?: string
    actor: AuthenticatedUser
  }) {
    const rawRole = (params.actor.role || (params.actor as any).roles?.[0] || '').toLowerCase()
    const isCeo = isEmployeeCeo(params.actor.email, params.actor.id) || rawRole === 'ceo'
    const isChro =
      rawRole === 'chro' ||
      (params.actor as any).roles?.includes('chro')
    const isCLevel = isCeo || isChro || ['cto', 'cfo', 'cpo'].includes(rawRole)
    const isPm = rawRole === 'pm'

    // RBAC Gate: CEO, CHRO, C-Level (CTO, CFO, CPO), and PM can adjust/override per authorization power
    if (!isCeo && !isChro && !isCLevel && !isPm) {
      throw new ForbiddenException(
        'Unauthorized: Only CEO, CHRO, C-Level Executives, and PMs have authority to adjust KPI or XP records.',
      )
    }

    // Resolve Actor in DB for MFA check and foreign key integrity
    const actorEmployee = this.prisma.employee.findFirst
      ? await this.prisma.employee.findFirst({
          where: {
            OR: [
              { id: params.actor.id },
              ...(params.actor.email ? [{ email: params.actor.email }] : []),
            ],
          },
          select: { id: true, email: true, mfaSecret: true, mfaEnabled: true },
        })
      : await this.prisma.employee.findUnique({
          where: { id: params.actor.id },
          select: { id: true, email: true, mfaSecret: true, mfaEnabled: true },
        })

    const submittedMfa = (params.mfaCode || '').trim()

    // 1. CEO Supreme Authority: Strictly and only requires 6-digit MFA verification code; bypasses text justification & secondary approvals
    if (isCeo) {
      if (!submittedMfa || !/^\d{6}$/.test(submittedMfa)) {
        throw new ForbiddenException({
          code: 'MFA_CODE_REQUIRED',
          message: 'CEO override requires strictly and only a valid 6-digit MFA verification code.',
        })
      }

      if (actorEmployee?.mfaSecret && actorEmployee.mfaEnabled) {
        const isValid = verifyTotpCode(actorEmployee.mfaSecret, submittedMfa)
        if (!isValid) {
          throw new ForbiddenException({
            code: 'INVALID_MFA_CODE',
            message: 'Invalid 6-digit MFA verification code.',
          })
        }
      }
    } else if (submittedMfa) {
      // Validate MFA if provided by C-Level / CHRO / PM
      if (!/^\d{6}$/.test(submittedMfa)) {
        throw new ForbiddenException('MFA verification code must be a 6-digit number.')
      }
      if (actorEmployee?.mfaSecret && actorEmployee.mfaEnabled) {
        const isValid = verifyTotpCode(actorEmployee.mfaSecret, submittedMfa)
        if (!isValid) {
          throw new ForbiddenException({
            code: 'INVALID_MFA_CODE',
            message: 'Invalid 6-digit MFA verification code.',
          })
        }
      }
    }

    // 2. PM Authority: Authorized to edit/modify historical records for their assigned team members ONLY (CHRO/CEO/C-Level bypass)
    if (isPm && !isCeo && !isChro && !isCLevel) {
      const isSquadMember = await this.isEmployeeInPmSquad(params.actor.id, params.targetEmployeeId)
      if (!isSquadMember) {
        throw new ForbiddenException(
          'Project Managers may only edit or modify KPI and XP records for their assigned team members.',
        )
      }
    }

    // Resolve Target Employee safely by ID, email, or alias
    let targetEmp = await this.prisma.employee.findUnique({
      where: { id: params.targetEmployeeId },
      include: { employeeRoles: { where: { isActive: true }, include: { role: true } } },
    })
    if (!targetEmp) {
      targetEmp = await this.prisma.employee.findUnique({
        where: { email: params.targetEmployeeId },
        include: { employeeRoles: { where: { isActive: true }, include: { role: true } } },
      })
    }
    if (!targetEmp && params.targetEmployeeId.startsWith('usr_')) {
      const mappedId = params.targetEmployeeId.replace('usr_', 'emp_')
      targetEmp = await this.prisma.employee.findUnique({
        where: { id: mappedId },
        include: { employeeRoles: { where: { isActive: true }, include: { role: true } } },
      })
    }
    if (!targetEmp) {
      if (params.metricType === 'KPI') {
        targetEmp = { id: params.targetEmployeeId, lifetimeXp: 0 } as any
      } else {
        throw new NotFoundException(`Target employee "${params.targetEmployeeId}" not found in system`)
      }
    }

    if (params.metricType === 'KPI' && isProjectManager(targetEmp) && !isCLevel) {
      throw new ForbiddenException('Only C-level executives may override PM weekly KPI')
    }

    // Role display label
    const effectiveActorRole = isCeo
      ? 'CEO'
      : isChro
        ? 'CHRO'
        : rawRole
          ? rawRole.toUpperCase()
          : 'EXECUTIVE'

    const effectiveReason =
      params.reason?.trim() ||
      (isCeo
        ? 'Executive CEO authorization'
        : isChro
          ? 'CHRO executive administrative adjustment'
          : `${effectiveActorRole} authorized performance adjustment`)

    const authorizedDbId = actorEmployee?.id || null

    try {
      // Apply KPI Override
      if (params.metricType === 'KPI') {
        const weekNumber = Number(params.weekNumber) || 1
        const year = Number(params.year) || new Date().getFullYear()

        const existing = await this.prisma.weeklyKpiRecord.findUnique({
          where: {
            employeeId_year_weekNumber: {
              employeeId: targetEmp.id,
              year,
              weekNumber,
            },
          },
        })

        const prevScore = existing?.score ? Number(existing.score) : 0
        const isInactive = params.score === null
        const newScore = isInactive ? null : Math.min(100, Math.max(0, Number(params.score)))
        const delta = isInactive ? -prevScore : (newScore ?? 0) - prevScore

        const existingBreakdown = (existing?.evaluationBreakdown as any) || {}
        const overrides = existingBreakdown.overrides || []
        overrides.push({
          overrideBy: authorizedDbId || params.actor.id,
          role: effectiveActorRole,
          prevScore,
          newScore,
          isInactive,
          reason: effectiveReason,
          timestamp: new Date().toISOString(),
        })

        const record = await this.prisma.weeklyKpiRecord.upsert({
          where: {
            employeeId_year_weekNumber: {
              employeeId: targetEmp.id,
              year,
              weekNumber,
            },
          },
          update: {
            score: newScore !== null ? new Prisma.Decimal(newScore.toFixed(2)) : null,
            isInactive,
            evaluationStatus: 'CONFIRMED',
            evaluationBreakdown: {
              ...existingBreakdown,
              overrides,
              lastOverride: {
                by: authorizedDbId || params.actor.id,
                role: effectiveActorRole,
                reason: effectiveReason,
                date: new Date().toISOString(),
              },
            },
          },
          create: {
            employeeId: targetEmp.id,
            year,
            weekNumber,
            score: newScore !== null ? new Prisma.Decimal(newScore.toFixed(2)) : null,
            isInactive,
            evaluationStatus: 'CONFIRMED',
            roleLevel: 1,
            evaluationBreakdown: {
              overrides,
              lastOverride: {
                by: authorizedDbId || params.actor.id,
                role: effectiveActorRole,
                reason: effectiveReason,
                date: new Date().toISOString(),
              },
            },
          },
        })

        await this.appendKpiAuditLog({
          employeeId: targetEmp.id,
          metricType: 'KPI',
          deltaValue: new Prisma.Decimal(delta.toFixed(2)),
          resultingTotal: newScore !== null ? new Prisma.Decimal(newScore.toFixed(2)) : null,
          actionType: `${effectiveActorRole}_KPI_OVERRIDE`,
          triggerEvent: `${effectiveActorRole} Modified Week ${weekNumber} (${year}) KPI`,
          authorizedById: authorizedDbId,
          authorizedRole: effectiveActorRole,
          reason: effectiveReason,
        })

        return { success: true, record }
      }

      // Apply XP Override
      if (params.metricType === 'XP') {
        const currentXp = targetEmp.lifetimeXp || 0
        let delta = 0
        let resultingTotal = currentXp

        if (params.deltaXp !== undefined) {
          delta = Math.round(Number(params.deltaXp))
          resultingTotal = Math.max(0, currentXp + delta)
        } else if (params.newLifetimeXp !== undefined) {
          resultingTotal = Math.max(0, Math.round(Number(params.newLifetimeXp)))
          delta = resultingTotal - currentXp
        }

        await this.prisma.employee.update({
          where: { id: targetEmp.id },
          data: { lifetimeXp: resultingTotal },
        })

        await this.prisma.xpLedgerEntry.create({
          data: {
            employeeId: targetEmp.id,
            delta,
            reason: `${effectiveActorRole} Override: ${effectiveReason}`,
            entryType: 'ADJUSTMENT',
            awardedById: authorizedDbId,
          },
        })

        await this.appendKpiAuditLog({
          employeeId: targetEmp.id,
          metricType: 'XP',
          deltaValue: new Prisma.Decimal(delta),
          resultingTotal: new Prisma.Decimal(resultingTotal),
          actionType: `${effectiveActorRole}_XP_OVERRIDE`,
          triggerEvent: `${effectiveActorRole} Modified Lifetime XP`,
          authorizedById: authorizedDbId,
          authorizedRole: effectiveActorRole,
          reason: effectiveReason,
        })

        return {
          success: true,
          employeeId: targetEmp.id,
          previousXp: currentXp,
          newLifetimeXp: resultingTotal,
          delta,
        }
      }

      throw new BadRequestException('Invalid metricType: must be KPI or XP')
    } catch (err: any) {
      this.logger.error(`Failed to override record for ${targetEmp.id}: ${err?.message}`, err?.stack)
      if (err instanceof HttpException) throw err
      throw new BadRequestException(err?.message || 'Failed to update performance evaluation record')
    }
  }

  // --------------------------------------------------------------------------
  // 13. CHRO & CEO AUDIT LOG MODIFICATION (CHRO FULL AUDIT CONTROL)
  // --------------------------------------------------------------------------
  async updateAuditLogEntry(
    id: string,
    data: { reason?: string; notes?: string; actionType?: string },
    actor: AuthenticatedUser,
  ) {
    const rawRole = (actor.role || (actor as any).roles?.[0] || '').toLowerCase()
    const isCeo = isEmployeeCeo(actor.email, actor.id) || rawRole === 'ceo'
    const isChro =
      rawRole === 'chro' ||
      (actor as any).roles?.includes('chro')

    if (!isCeo && !isChro) {
      throw new ForbiddenException(
        'Unauthorized: Only CHRO and CEO have authority to edit KPI/XP audit log records.',
      )
    }

    const existing = await this.prisma.kpiXpAuditLog.findUnique({
      where: { id },
    })
    if (!existing) {
      throw new NotFoundException(`Audit log entry ${id} not found`)
    }

    const note = (data.notes || data.reason || '').trim() || 'Audit annotation'

    // Stopgap: Create an AuditAnnotation instead of mutating the immutable kpi_xp_audit_logs row
    return this.prisma.auditAnnotation.create({
      data: {
        auditLogId: id,
        authorId: actor.id,
        note,
      },
      include: {
        author: {
          select: { id: true, name: true, title: true },
        },
      },
    })
  }

  // Helpers
  getWeekStartDate(week: number, year: number): Date {
    if (this.isV2()) {
      return getDhakaWeekBoundaries(week, year).weekStartUtc
    }
    const simple = new Date(year, 0, 1 + (week - 1) * 7)
    const dow = simple.getDay()
    const ISOweekStart = simple
    if (dow <= 4) ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1)
    else ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay())
    return ISOweekStart
  }

  getWeekEndDate(week: number, year: number): Date {
    if (this.isV2()) {
      return getDhakaWeekBoundaries(week, year).weekEndUtc
    }
    const start = this.getWeekStartDate(week, year)
    return new Date(start.getTime() + 7 * 86400000 - 1)
  }
}
