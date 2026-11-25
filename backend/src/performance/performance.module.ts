import { Module } from '@nestjs/common'
import { PerformanceService } from './performance.service'
import { PerformanceController } from './performance.controller'
import { ChroGovernanceController } from './chro-governance.controller'
import { KpiEngineService } from './kpi-engine.service'
import { XpLedgerService } from './xp-ledger.service'
import { ExecScoresService } from './exec-scores.service'
import { FrozenXpConsensusService } from './frozen-xp-consensus.service'
import { PmMilestoneXpService } from './pm-milestone-xp.service'
import { ExecWeeklyKpiService } from './exec-weekly-kpi.service'
import { WeeklySweepService } from './weekly-sweep.service'
import { DisciplinaryService } from './disciplinary.service'
import { PerformanceReadService } from './performance-read.service'
import { FinanceModule } from '../finance/finance.module'

@Module({
  imports: [FinanceModule],
  controllers: [ChroGovernanceController, PerformanceController],
  providers: [
    PerformanceService,
    KpiEngineService,
    XpLedgerService,
    ExecScoresService,
    FrozenXpConsensusService,
    PmMilestoneXpService,
    ExecWeeklyKpiService,
    WeeklySweepService,
    DisciplinaryService,
    PerformanceReadService,
  ],
  exports: [
    PerformanceService,
    KpiEngineService,
    XpLedgerService,
    ExecScoresService,
    FrozenXpConsensusService,
    PmMilestoneXpService,
    ExecWeeklyKpiService,
    WeeklySweepService,
    DisciplinaryService,
    PerformanceReadService,
  ],
})
export class PerformanceModule {}
