import { PrismaClient, Prisma } from '@prisma/client'
import { XpLedgerService } from './xp-ledger.service'
import { TaskTransitionService } from '../tasks/task-transition.service'
import { TasksService } from '../tasks/tasks.service'
import { ExecScoresService } from './exec-scores.service'
import { FrozenXpConsensusService } from './frozen-xp-consensus.service'
import { PmMilestoneXpService } from './pm-milestone-xp.service'
import { ExecWeeklyKpiService } from './exec-weekly-kpi.service'
import { WeeklySweepService } from './weekly-sweep.service'
import { DisciplinaryService } from './disciplinary.service'
import { PerformanceReadService } from './performance-read.service'
import { ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common'

describe('KPI & XP System Phase 4 Comprehensive Verification', () => {
  let prisma: PrismaClient
  let isDbAvailable = false

  let xpLedgerService: XpLedgerService
  let taskTransitionService: TaskTransitionService
  let tasksService: TasksService
  let execScoresService: ExecScoresService
  let frozenXpService: FrozenXpConsensusService
  let pmMilestoneXpService: PmMilestoneXpService
  let execWeeklyKpiService: ExecWeeklyKpiService
  let weeklySweepService: WeeklySweepService
  let disciplinaryService: DisciplinaryService
  let performanceReadService: PerformanceReadService

  const testSuffix = `p4_${Date.now()}`
  const devId = `dev_${testSuffix}`
  const pmId = `pm_${testSuffix}`
  const foreignDevId = `foreign_dev_${testSuffix}`
  const foreignPmId = `foreign_pm_${testSuffix}`
  const chroId = `chro_${testSuffix}`
  const ctoId = `cto_${testSuffix}`
  const cpoId = `cpo_${testSuffix}`
  const cfoId = `cfo_${testSuffix}`
  const ceoId = `ceo_${testSuffix}`

  const teamId = `team_${testSuffix}`
  const projId = `proj_${testSuffix}`

  beforeAll(async () => {
    const dbUrl =
      process.env.TEST_DATABASE_URL ||
      'postgresql://pointfex:pointfex@localhost:5439/pointfex_erp_test'

    prisma = new PrismaClient({
      datasources: { db: { url: dbUrl } },
    })

    try {
      await prisma.$connect()
      await prisma.$executeRawUnsafe('SELECT 1')
      isDbAvailable = true

      xpLedgerService = new XpLedgerService(prisma as any)
      taskTransitionService = new TaskTransitionService()
      tasksService = new TasksService(
        prisma as any,
        undefined,
        undefined,
        taskTransitionService,
        xpLedgerService,
      )
      execScoresService = new ExecScoresService(prisma as any)
      frozenXpService = new FrozenXpConsensusService(prisma as any, xpLedgerService)
      pmMilestoneXpService = new PmMilestoneXpService(prisma as any, xpLedgerService, frozenXpService)
      execWeeklyKpiService = new ExecWeeklyKpiService(prisma as any)
      weeklySweepService = new WeeklySweepService(prisma as any, xpLedgerService, frozenXpService)
      disciplinaryService = new DisciplinaryService(prisma as any)
      performanceReadService = new PerformanceReadService(prisma as any)

      // Seed test employees and squad structure
      await prisma.employee.createMany({
        data: [
          { id: devId, name: 'Phase 4 Dev', email: `${devId}@pointfex.com`, title: 'Software Engineer', initials: 'P4D' },
          { id: pmId, name: 'Phase 4 PM', email: `${pmId}@pointfex.com`, title: 'Project Manager', initials: 'P4P' },
          { id: foreignDevId, name: 'Foreign Dev', email: `${foreignDevId}@pointfex.com`, title: 'Software Engineer', initials: 'FD' },
          { id: foreignPmId, name: 'Foreign PM', email: `${foreignPmId}@pointfex.com`, title: 'Project Manager', initials: 'FP' },
          { id: chroId, name: 'Phase 4 CHRO', email: `${chroId}@pointfex.com`, title: 'Chief Human Resources Officer', initials: 'CH' },
          { id: ctoId, name: 'Phase 4 CTO', email: `${ctoId}@pointfex.com`, title: 'Chief Technology Officer', initials: 'CT' },
          { id: cpoId, name: 'Phase 4 CPO', email: `${cpoId}@pointfex.com`, title: 'Chief Product Officer', initials: 'CP' },
          { id: cfoId, name: 'Phase 4 CFO', email: `${cfoId}@pointfex.com`, title: 'Chief Financial Officer', initials: 'CF' },
          { id: ceoId, name: 'Phase 4 CEO', email: `${ceoId}@pointfex.com`, title: 'Chief Executive Officer', initials: 'CE' },
        ],
        skipDuplicates: true,
      })

      await prisma.project.create({
        data: {
          id: projId,
          name: `Phase 4 Project ${testSuffix}`,
          code: `P4_${Date.now().toString().slice(-4)}`,
          description: 'Phase 4 project testing',
          startDate: new Date(),
          deadline: new Date(Date.now() + 30 * 86400000),
        },
      })

      await prisma.team.create({
        data: {
          id: teamId,
          name: `Phase 4 Team ${testSuffix}`,
          code: `T${Date.now().toString().slice(-3)}`,
          focus: 'Core Platform',
        },
      })

      await prisma.teamMembership.createMany({
        data: [
          { employeeId: devId, teamId, isActive: true },
          { employeeId: pmId, teamId, isActive: true, isLead: true },
        ],
      })
    } catch (err) {
      console.warn('PostgreSQL test DB unreachable:', err)
      isDbAvailable = false
    }
  })

  afterAll(async () => {
    if (prisma && isDbAvailable) {
      try {
        await prisma.sweepRun.deleteMany({})
        await prisma.disciplinaryAction.deleteMany({ where: { userId: { in: [devId, foreignDevId, pmId] } } })
        await prisma.taskExecScore.deleteMany({ where: { task: { projectId: projId } } })
        await prisma.taskWeightConsensusVote.deleteMany({})
        await prisma.taskWeightVerification.deleteMany({})
        await prisma.projectMilestone.deleteMany({ where: { projectId: projId } })
        await prisma.task.deleteMany({ where: { projectId: projId } })
        await prisma.teamMembership.deleteMany({ where: { teamId } })
        await prisma.team.deleteMany({ where: { id: teamId } })
        await prisma.project.deleteMany({ where: { id: projId } })
        await prisma.xpBalance.deleteMany({ where: { userId: { in: [devId, pmId, foreignDevId, foreignPmId, chroId, ctoId, cpoId, cfoId, ceoId] } } })
        await prisma.employee.deleteMany({ where: { id: { in: [devId, pmId, foreignDevId, foreignPmId, chroId, ctoId, cpoId, cfoId, ceoId] } } })
      } catch {
        // Cleanup error ignore
      }
      await prisma.$disconnect()
    }
  })

  // ==========================================================================
  // 1. Frozen-XP Consensus Voting Flow
  // ==========================================================================
  describe('1. Frozen-XP Consensus Voting Engine', () => {
    let verificationId: string
    let massiveTaskId: string

    it('creates a task with massive XP (20 pts = 200 XP) and freezes it upon completion', async () => {
      if (!isDbAvailable) return

      // Create task with CUSTOM 20 pts
      const task = await tasksService.create(
        {
          title: 'Massive GIS Engine',
          projectId: projId,
          assigneeId: devId,
          weightCategory: 'CUSTOM',
          proposedWeight: 20,
        },
        { id: pmId, role: 'pm' } as any,
      )
      massiveTaskId = task.id

      // CHRO verifies weight
      await tasksService.verifyWeight(task.id, { action: 'APPROVE' }, { id: chroId, role: 'chro' } as any)

      // Dev submits work -> IN_REVIEW
      await tasksService.submitWork(task.id, { notes: 'Done' }, { id: devId, role: 'developer' } as any)

      // PM approves -> Freeze 200 XP
      await tasksService.approve(task.id, { pmScore: 90 }, { id: pmId, role: 'pm' } as any)

      const bal = await xpLedgerService.rebuildBalance(devId)
      expect(bal.frozenXp).toBe(200)
      expect(bal.postedXp).toBe(0)

      // Verify verification record
      const v = await prisma.taskWeightVerification.findFirst({
        where: { taskId: task.id },
      })
      expect(v).toBeDefined()
      expect(v!.massiveXpFrozen).toBe(true)
      verificationId = v!.id

      // Open consensus request
      await frozenXpService.openConsensusRequest(verificationId)
    })

    it('strictly forbids developer (beneficiary) and PM (proposer) from voting on their own massive XP', async () => {
      if (!isDbAvailable) return

      // Dev tries to vote
      await expect(
        frozenXpService.castVote(verificationId, { id: devId, role: 'developer' } as any, 'APPROVE'),
      ).rejects.toThrow(ForbiddenException)

      // PM tries to vote
      await expect(
        frozenXpService.castVote(verificationId, { id: pmId, role: 'pm' } as any, 'APPROVE'),
      ).rejects.toThrow(ForbiddenException)
    })

    it('strictly prevents double voting by the same executive', async () => {
      if (!isDbAvailable) return

      // CTO votes APPROVE
      const res = await frozenXpService.castVote(
        verificationId,
        { id: ctoId, role: 'cto' } as any,
        'APPROVE',
        'Looks solid',
      )
      expect(res.approvals).toBe(1)

      // CTO tries to vote again -> 409 Conflict
      await expect(
        frozenXpService.castVote(verificationId, { id: ctoId, role: 'cto' } as any, 'APPROVE'),
      ).rejects.toThrow(ConflictException)
    })

    it('approves and releases frozen XP once strictly more than half of eligible voters approve', async () => {
      if (!isDbAvailable) return

      // CPO votes APPROVE -> 2 approvals
      await frozenXpService.castVote(verificationId, { id: cpoId, role: 'cpo' } as any, 'APPROVE')

      // CFO votes APPROVE -> 3 approvals (strictly more than half of 4 voters)
      const outcome = await frozenXpService.castVote(
        verificationId,
        { id: cfoId, role: 'cfo' } as any,
        'APPROVE',
      )
      expect(outcome.status).toBe('APPROVED')

      // Verify XP moved from frozen to posted
      const bal = await xpLedgerService.rebuildBalance(devId)
      expect(bal.frozenXp).toBe(0)
      expect(bal.postedXp).toBe(200)

      // Check notification sent to developer and PM
      const notifs = await prisma.notification.findMany({
        where: { userId: devId, title: 'Massive XP Released' },
      })
      expect(notifs.length).toBeGreaterThan(0)
    })

    it('rejects early when approval becomes mathematically unreachable and reverses pending XP', async () => {
      if (!isDbAvailable) return

      // Create another massive task for rejection test
      const task2 = await tasksService.create(
        { title: 'Failed Architecture', projectId: projId, assigneeId: devId, weightCategory: 'CUSTOM', proposedWeight: 20 },
        { id: pmId, role: 'pm' } as any,
      )
      await tasksService.verifyWeight(task2.id, { action: 'APPROVE' }, { id: chroId, role: 'chro' } as any)
      await tasksService.submitWork(task2.id, { notes: 'Done' }, { id: devId, role: 'developer' } as any)
      await tasksService.approve(task2.id, { pmScore: 90 }, { id: pmId, role: 'pm' } as any)

      const v2 = await prisma.taskWeightVerification.findFirst({ where: { taskId: task2.id } })
      await frozenXpService.openConsensusRequest(v2!.id)

      // CTO votes REJECT
      await frozenXpService.castVote(v2!.id, { id: ctoId, role: 'cto' } as any, 'REJECT', 'Buggy')

      // CPO votes REJECT -> 2 rejections out of 4 voters means max possible approvals = 2 < 3 (threshold). Early reject!
      const outcome = await frozenXpService.castVote(
        v2!.id,
        { id: cpoId, role: 'cpo' } as any,
        'REJECT',
        'Not ready',
      )
      expect(outcome.status).toBe('REJECTED')

      // Verify REVERSAL event appended and balance is clean
      const bal = await xpLedgerService.rebuildBalance(devId)
      expect(bal.frozenXp).toBe(0) // Reversed, not stuck!
    })

    it('allows CEO unilateral override to approve or reject with logged reason', async () => {
      if (!isDbAvailable) return

      const task3 = await tasksService.create(
        { title: 'CEO Direct Milestone', projectId: projId, assigneeId: devId, weightCategory: 'CUSTOM', proposedWeight: 20 },
        { id: pmId, role: 'pm' } as any,
      )
      await tasksService.verifyWeight(task3.id, { action: 'APPROVE' }, { id: chroId, role: 'chro' } as any)
      await tasksService.submitWork(task3.id, { notes: 'Done' }, { id: devId, role: 'developer' } as any)
      await tasksService.approve(task3.id, { pmScore: 90 }, { id: pmId, role: 'pm' } as any)

      const v3 = await prisma.taskWeightVerification.findFirst({ where: { taskId: task3.id } })
      await frozenXpService.openConsensusRequest(v3!.id)

      // CEO supreme override
      const override = await frozenXpService.ceoOverride(
        v3!.id,
        { id: ceoId, role: 'ceo' } as any,
        'APPROVE',
        'Executive board strategic directive approval',
      )
      expect(override.status).toBe('APPROVED')

      const bal = await xpLedgerService.rebuildBalance(devId)
      expect(bal.frozenXp).toBe(0)
    })
  })

  // ==========================================================================
  // 2. PM Milestone XP (PMs Never Earn Micro-Task XP)
  // ==========================================================================
  describe('2. PM Milestone XP Governance', () => {
    it('strictly forbids PM from earning XP on micro-tasks they complete', async () => {
      if (!isDbAvailable) return

      // Create task assigned to PM
      const pmTask = await tasksService.create(
        { title: 'PM Direct Task', projectId: projId, assigneeId: pmId, weightCategory: 'SMALL', proposedWeight: 1 },
        { id: pmId, role: 'pm' } as any,
      )
      await tasksService.verifyWeight(pmTask.id, { action: 'APPROVE' }, { id: chroId, role: 'chro' } as any)
      await tasksService.submitWork(pmTask.id, { notes: 'PM finished' }, { id: pmId, role: 'pm' } as any)

      // Executive approves PM deliverable
      await tasksService.approve(pmTask.id, { pmScore: 90 }, { id: ctoId, role: 'cto' } as any)

      // Verify PM balance did NOT increase from this task
      const pmBal = await xpLedgerService.rebuildBalance(pmId)
      expect(pmBal.postedXp).toBe(0)
      expect(pmBal.pendingXp).toBe(0)
    })

    it('routes milestone completion XP to C-Level consensus approval before posting', async () => {
      if (!isDbAvailable) return

      const milestoneId = `ms_${Date.now()}`
      await prisma.projectMilestone.create({
        data: {
          id: milestoneId,
          projectId: projId,
          title: 'Core Platform v1.0 Launch',
          dueDate: new Date(Date.now() + 14 * 86400000),
          status: 'in_progress',
        },
      })

      // Complete milestone with 15 pts (150 XP)
      const res = await pmMilestoneXpService.completeMilestoneWithXp(
        milestoneId,
        pmId,
        15,
        { id: chroId, role: 'chro' } as any,
      )
      expect(res.status).toBe('PENDING_C_LEVEL_CONSENSUS')

      // PM has pending XP
      let pmBal = await xpLedgerService.rebuildBalance(pmId)
      expect(pmBal.pendingXp).toBe(150)
      expect(pmBal.postedXp).toBe(0)

      // C-Level approves consensus
      await pmMilestoneXpService.approveMilestoneConsensus(res.verificationId, { id: ctoId, role: 'cto' } as any)

      pmBal = await xpLedgerService.rebuildBalance(pmId)
      expect(pmBal.postedXp).toBe(150)
      expect(pmBal.pendingXp).toBe(0)
    })
  })

  // ==========================================================================
  // 3. Weekly KPI Flows for PM, C-Level, CEO
  // ==========================================================================
  describe('3. Weekly KPI Flow (PM, C-Level, CEO)', () => {
    let pmRecordId: string
    let ctoEvalId: string

    it('generates 4 executive evaluations (CTO, CPO, CFO, CHRO) for PM and allows confirm/adjust', async () => {
      if (!isDbAvailable) return

      const rec = await prisma.weeklyKpiRecord.upsert({
        where: {
          employeeId_year_weekNumber: {
            employeeId: pmId,
            year: 2026,
            weekNumber: 47,
          },
        },
        create: {
          employeeId: pmId,
          year: 2026,
          weekNumber: 47,
          weekStart: new Date('2026-11-15T18:00:00Z'),
          score: new Prisma.Decimal(85),
          isInactive: false,
          evaluationStatus: 'PROVISIONAL',
          evaluationBreakdown: { pm: true },
        },
        update: {
          score: new Prisma.Decimal(85),
          isInactive: false,
          evaluationStatus: 'PROVISIONAL',
        },
      })
      pmRecordId = rec.id

      await prisma.kpiExecEvaluation.deleteMany({ where: { weeklyKpiRecordId: rec.id } })

      // Create the 4 evaluation rows
      const ctoRow = await prisma.kpiExecEvaluation.create({
        data: { weeklyKpiRecordId: rec.id, evaluatorRole: 'CTO', score: new Prisma.Decimal(85), suggestedScore: new Prisma.Decimal(85), status: 'UNREAD' },
      })
      ctoEvalId = ctoRow.id

      await prisma.kpiExecEvaluation.createMany({
        data: [
          { weeklyKpiRecordId: rec.id, evaluatorRole: 'CPO', score: new Prisma.Decimal(85), suggestedScore: new Prisma.Decimal(85), status: 'UNREAD' },
          { weeklyKpiRecordId: rec.id, evaluatorRole: 'CFO', score: new Prisma.Decimal(85), suggestedScore: new Prisma.Decimal(85), status: 'UNREAD' },
          { weeklyKpiRecordId: rec.id, evaluatorRole: 'CHRO', score: new Prisma.Decimal(85), suggestedScore: new Prisma.Decimal(85), status: 'UNREAD' },
        ],
      })

      // CTO confirms
      const confirmed = await execWeeklyKpiService.confirmPmEvaluation(ctoEvalId, { id: ctoId, role: 'cto' } as any)
      expect(confirmed.status).toBe('CONFIRMED')

      // Role mismatch block: CTO cannot adjust CPO's evaluation
      const cpoRow = await prisma.kpiExecEvaluation.findFirst({
        where: { weeklyKpiRecordId: rec.id, evaluatorRole: 'CPO' },
      })
      await expect(
        execWeeklyKpiService.adjustPmEvaluation(cpoRow!.id, 92, 'CTO intruding', { id: ctoId, role: 'cto' } as any),
      ).rejects.toThrow(ForbiddenException)

      // CPO adjusts with valid score & reason
      const adjusted = await execWeeklyKpiService.adjustPmEvaluation(
        cpoRow!.id,
        92,
        'Exceeded user satisfaction metrics for milestone',
        { id: cpoId, role: 'cpo' } as any,
      )
      expect(adjusted.status).toBe('ADJUSTED')
      expect(adjusted.score).toBe(92)
    })

    it('records C-Level peer synergy evaluation and forbids self-rating', async () => {
      if (!isDbAvailable) return

      // Self-rating blocked
      await expect(
        execWeeklyKpiService.recordCLevelPeerEval(ctoId, 95, 'Self praise', { id: ctoId, role: 'cto' } as any),
      ).rejects.toThrow(ForbiddenException)

      // CPO rates CTO
      const peerRes = await execWeeklyKpiService.recordCLevelPeerEval(
        ctoId,
        90,
        'Great platform architectural leadership',
        { id: cpoId, role: 'cpo' } as any,
      )
      expect(peerRes.status).toBe('RECORDED')
    })
  })

  // ==========================================================================
  // 4. Weekly Cron Sweep (Idempotent, Zero-Completions, Inactivity Penalty)
  // ==========================================================================
  describe('4. Weekly Sweep Idempotency & Inactivity Penalty', () => {
    it('executes weekly sweep idempotently and queues inactivity penalty for zero-completion users', async () => {
      if (!isDbAvailable) return

      // Run sweep
      const sweepResult = await weeklySweepService.runWeeklySweep({
        referenceDate: new Date('2026-11-23T00:00:00Z'), // Monday following week 47
        forcePreviousWeek: true,
      })
      expect(sweepResult.status).toBe('COMPLETED')
      expect(sweepResult.counts.inactivityPenaltiesQueued).toBeGreaterThanOrEqual(1)

      // Verify foreignDevId (zero tasks) has NA KPI and queued penalty
      const foreignDevKpi = await prisma.weeklyKpiRecord.findFirst({
        where: { employeeId: foreignDevId },
      })
      expect(foreignDevKpi).toBeDefined()
      expect(foreignDevKpi!.isInactive).toBe(true)
      expect(foreignDevKpi!.score).toBeNull()

      const penaltyCount = await prisma.inactivityPenalty.count({
        where: { userId: foreignDevId },
      })
      expect(penaltyCount).toBe(1)

      // RERUN SWEEP (Idempotency check)
      const secondSweep = await weeklySweepService.runWeeklySweep({
        referenceDate: new Date('2026-11-23T00:00:00Z'),
        forcePreviousWeek: true,
      })
      expect(secondSweep.status).toBe('COMPLETED')

      // Inactivity penalty count should STILL be exactly 1 (no duplicates!)
      const penaltyCountAfter = await prisma.inactivityPenalty.count({
        where: { userId: foreignDevId },
      })
      expect(penaltyCountAfter).toBe(1)
    })
  })

  // ==========================================================================
  // 5. CHRO Disciplinary Deduction & Reversal
  // ==========================================================================
  describe('5. CHRO Disciplinary Deduction', () => {
    let actionId: string
    const weekStart = new Date('2026-11-15T18:00:00Z')

    it('strictly forbids self-targeting for disciplinary actions', async () => {
      if (!isDbAvailable) return

      await expect(
        disciplinaryService.applyDisciplinaryDeduction(
          {
            userId: chroId,
            points: 15,
            reason: 'Self penalty violation attempt',
            referenceDocId: 'DOC_123',
            targetWeekStart: weekStart,
          },
          { id: chroId, role: 'chro' } as any,
        ),
      ).rejects.toThrow(ForbiddenException)
    })

    it('applies negative deduction to weekly KPI, clamps to 0, and records audit entry', async () => {
      if (!isDbAvailable) return

      // Create a developer weekly KPI record with score 80
      await prisma.weeklyKpiRecord.upsert({
        where: {
          employeeId_year_weekNumber: {
            employeeId: devId,
            year: 2026,
            weekNumber: 47,
          },
        },
        create: {
          employeeId: devId,
          year: 2026,
          weekNumber: 47,
          weekStart,
          score: new Prisma.Decimal(80),
          isInactive: false,
          evaluationStatus: 'CONFIRMED',
          evaluationBreakdown: {},
        },
        update: { score: new Prisma.Decimal(80) },
      })

      const applied = await disciplinaryService.applyDisciplinaryDeduction(
        {
          userId: devId,
          points: 15,
          reason: 'Severe SLA violation on client deployment delivery',
          referenceDocId: 'HR_DOC_2026_099',
          targetWeekStart: weekStart,
        },
        { id: chroId, role: 'chro' } as any,
      )
      expect(applied.status).toBe('APPLIED')
      expect(applied.scoreBefore).toBe(80)
      expect(applied.scoreAfter).toBe(65)
      actionId = applied.id

      // Verify audit log has negative delta
      const audit = await prisma.kpiXpAuditLog.findFirst({
        where: { employeeId: devId, actionType: 'CHRO_DISCIPLINARY' },
        orderBy: { sequence: 'desc' },
      })
      expect(audit).toBeDefined()
      expect(Number(audit!.deltaValue)).toBe(-15)
    })

    it('reverses disciplinary deduction via REVERSAL event without mutating existing row', async () => {
      if (!isDbAvailable) return

      const reversed = await disciplinaryService.reverseDisciplinaryDeduction(
        actionId,
        'HR dispute resolution board exonerated engineer',
        { id: chroId, role: 'chro' } as any,
      )
      expect(reversed.status).toBe('REVERSED')
      expect(reversed.scoreAfter).toBe(80)

      // Verify original action is marked reversed
      const action = await prisma.disciplinaryAction.findUnique({ where: { id: actionId } })
      expect(action!.isReversed).toBe(true)
      expect(action!.reversalReason).toContain('exonerated')

      // Verify REVERSAL audit log
      const revAudit = await prisma.kpiXpAuditLog.findFirst({
        where: { employeeId: devId, actionType: 'REVERSAL' },
        orderBy: { sequence: 'desc' },
      })
      expect(revAudit).toBeDefined()
      expect(Number(revAudit!.deltaValue)).toBe(15)
    })
  })

  // ==========================================================================
  // 6. Scoped Read APIs & Public Leaderboard
  // ==========================================================================
  describe('6. Scoped Read APIs & Public Leaderboard', () => {
    it('allows employee to view own ledger and PM to view squad member ledger', async () => {
      if (!isDbAvailable) return

      // Dev views own
      const devOwn = await performanceReadService.getLedger(devId, { id: devId, role: 'developer' } as any, {})
      expect(devOwn.items).toBeDefined()

      // PM views dev (in squad)
      const pmViewsDev = await performanceReadService.getLedger(devId, { id: pmId, role: 'pm' } as any, {})
      expect(pmViewsDev.items).toBeDefined()
    })

    it('strictly forbids PM from inspecting ledgers of developers outside their squad', async () => {
      if (!isDbAvailable) return

      await expect(
        performanceReadService.getLedger(foreignDevId, { id: pmId, role: 'pm' } as any, {}),
      ).rejects.toThrow(ForbiddenException)
    })

    it('returns minimal public leaderboard DTO stripping all private/sensitive fields', async () => {
      if (!isDbAvailable) return

      const leaderboard = await performanceReadService.getLeaderboard('lifetime_xp')
      expect(leaderboard.length).toBeGreaterThan(0)

      const entry = leaderboard[0]
      expect(entry.rank).toBe(1)
      expect(entry.userId).toBeDefined()
      expect(entry.name).toBeDefined()
      expect(entry.lifetimeXp).toBeDefined()

      // Verify NO email, salary, or private internal scores leak
      expect((entry as any).email).toBeUndefined()
      expect((entry as any).passwordHash).toBeUndefined()
      expect((entry as any).salary).toBeUndefined()
      expect((entry as any).componentScores).toBeUndefined()
    })
  })
})
