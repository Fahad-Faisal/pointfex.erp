import { useState, useMemo, useEffect } from 'react'
import { Card } from '../../components/common/Card'
import { StatusPill } from '../../components/common/StatusPill'
import { useCtoData } from '../../hooks/useCtoData'
import { useApp } from '../../context/AppContext'
import { erpApi } from '../../api/client'
import { formatCurrency, formatDate } from '../../utils/formatters'
import {
  WeeklyKpiTrendGraph,
  LifetimeXpStackedChart,
  type WeeklyKpiItem,
} from '../../components/performance/KpiXpWidgets'
import {
  Wallet,
  ShieldCheck,
  AlertTriangle,
  ShoppingBag,
  ArrowDownRight,
  ArrowUpRight,
  Award,
  Clock,
  Sparkles,
  Zap,
  TrendingUp,
  Coins,
  CheckCircle2,
} from 'lucide-react'

export function CtoEarningsPage() {
  const { ctoWallet, ctoTransactions, companyStats, codeQualityGates, tasks } = useCtoData()
  const { currentUser } = useApp()
  const [filterType, setFilterType] = useState<'all' | 'payout' | 'penalty'>('all')

  const [kpiSeries, setKpiSeries] = useState<WeeklyKpiItem[]>([])
  const [xpSummary, setXpSummary] = useState<{
    lifetimeXp: number
    postedXp?: number
    pendingXp?: number
    frozenXp?: number
  } | null>(null)

  const totalPenalties = ctoWallet?.totalPenalties || 0
  const totalSpendings = ctoWallet?.totalSpendings || 0

  useEffect(() => {
    let cancelled = false
    const fetchPerfData = async () => {
      try {
        const [series, xp] = await Promise.all([
          erpApi.getMyKpiSeries().catch(() => null),
          erpApi.getMyXpSummary().catch(() => null),
        ])
        if (cancelled) return

        if (Array.isArray(series)) {
          setKpiSeries(series)
        } else {
          setKpiSeries([])
        }

        if (xp && typeof xp.lifetimeXp === 'number') {
          setXpSummary(xp)
        } else {
          const lifetime = currentUser?.lifetimeXp ?? 0
          setXpSummary({
            lifetimeXp: lifetime,
            postedXp: lifetime,
            pendingXp: 0,
            frozenXp: 0,
          })
        }
      } catch {
        // graceful fallback
      }
    }

    void fetchPerfData()
    return () => {
      cancelled = true
    }
  }, [currentUser?.id, currentUser?.lifetimeXp])

  const lifetimeXp = xpSummary?.lifetimeXp ?? currentUser?.lifetimeXp ?? 0
  const postedXp = xpSummary?.postedXp ?? lifetimeXp
  const pendingXp = xpSummary?.pendingXp ?? 0
  const frozenXp = xpSummary?.frozenXp ?? 0

  const taskCompletionPct =
    tasks.length > 0 ? Math.round((companyStats.completedTasks / tasks.length) * 100) : null
  const gatesPassPct =
    codeQualityGates.length > 0
      ? Math.round(
          (codeQualityGates.filter((g) => g.status === 'passed').length /
            codeQualityGates.length) *
            100,
        )
      : null

  const filteredTransactions = useMemo(() => {
    return ctoTransactions.filter((tx) => {
      if (filterType === 'payout' && tx.type === 'penalty') return false
      if (filterType === 'penalty' && tx.type !== 'penalty') return false
      return true
    })
  }, [ctoTransactions, filterType])

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white font-display">
            Performance, XP & Compensation Wallet
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Architecture governance metrics, executive XP progression, and CFO project disbursements
          </p>
        </div>

        {/* Priority Indicator */}
        <div className="flex items-center gap-2 self-start sm:self-auto text-[11px] font-medium bg-slate-100 dark:bg-slate-800/80 px-3 py-1.5 rounded-2xl border border-slate-200/70 dark:border-slate-700">
          <span className="text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1">
            <Award className="w-3.5 h-3.5" /> 1. KPI
          </span>
          <span className="text-slate-300 dark:text-slate-600">•</span>
          <span className="text-purple-600 dark:text-purple-400 font-semibold flex items-center gap-1">
            <Zap className="w-3.5 h-3.5" /> 2. XP
          </span>
          <span className="text-slate-300 dark:text-slate-600">•</span>
          <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
            <ShoppingBag className="w-3.5 h-3.5" /> 3. Money
          </span>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 1. PRIORITY 1: KPI (GRAPH & METRICS) */}
      {/* ========================================================= */}
      <div className="space-y-4">
        {/* KPI Banner */}
        <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider font-display">
                Priority 1 — Executive Key Performance Indicators (KPI)
              </h3>
              <p className="text-[11px] text-slate-400">
                Technical standards, quality gates, and system uptime governance
              </p>
            </div>
          </div>
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
            Target &ge; 90%
          </span>
        </div>

        {/* 4 KPI Metric Cards (Live Engineering Telemetry — N/A when telemetry absent) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-4 rounded-3xl bg-slate-50 dark:bg-slate-850/80 border border-slate-100 dark:border-slate-800 text-center space-y-1 shadow-2xs">
            <div className="flex items-center justify-center gap-1.5 text-slate-400 dark:text-slate-500 text-[11px] font-medium">
              <Award className="w-3.5 h-3.5 text-amber-500" />
              <span>Architecture Quality</span>
            </div>
            <div className="text-2xl font-bold font-display text-slate-900 dark:text-white">
              {companyStats.averageQualityScore !== null
                ? `${companyStats.averageQualityScore}/100`
                : 'N/A'}
            </div>
            <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
              {codeQualityGates.length} quality gates tracked
            </div>
          </div>

          <div className="p-4 rounded-3xl bg-slate-50 dark:bg-slate-850/80 border border-slate-100 dark:border-slate-800 text-center space-y-1 shadow-2xs">
            <div className="flex items-center justify-center gap-1.5 text-slate-400 dark:text-slate-500 text-[11px] font-medium">
              <Clock className="w-3.5 h-3.5 text-sky-500" />
              <span>Task Completion</span>
            </div>
            <div className="text-2xl font-bold font-display text-slate-900 dark:text-white">
              {taskCompletionPct !== null ? `${taskCompletionPct}%` : 'N/A'}
            </div>
            <div className="text-[10px] text-slate-400 dark:text-slate-500">
              {companyStats.completedTasks} of {tasks.length} completed
            </div>
          </div>

          <div className="p-4 rounded-3xl bg-slate-50 dark:bg-slate-850/80 border border-slate-100 dark:border-slate-800 text-center space-y-1 shadow-2xs">
            <div className="flex items-center justify-center gap-1.5 text-slate-400 dark:text-slate-500 text-[11px] font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span>Security Gates</span>
            </div>
            <div className="text-2xl font-bold font-display text-slate-900 dark:text-white">
              {gatesPassPct !== null ? `${gatesPassPct}%` : 'N/A'}
            </div>
            <div className="text-[10px] text-slate-400 dark:text-slate-500">
              {companyStats.criticalSecurityAlertsCount} Critical vulnerabilities
            </div>
          </div>

          <div className="p-4 rounded-3xl bg-slate-50 dark:bg-slate-850/80 border border-slate-100 dark:border-slate-800 text-center space-y-1 shadow-2xs">
            <div className="flex items-center justify-center gap-1.5 text-slate-400 dark:text-slate-500 text-[11px] font-medium">
              <Zap className="w-3.5 h-3.5 text-purple-500" />
              <span>Squad Velocity</span>
            </div>
            <div className="text-2xl font-bold font-display text-slate-900 dark:text-white">
              {companyStats.totalVelocity !== null ? `${companyStats.totalVelocity} pts` : 'N/A'}
            </div>
            <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
              {companyStats.totalTeams} active squads
            </div>
          </div>
        </div>

        {/* Weekly KPI Trend Graph */}
        <WeeklyKpiTrendGraph data={kpiSeries} />
      </div>

      {/* ========================================================= */}
      {/* 2. PRIORITY 2: XP (STACKED VOLUME CHART & STATS) */}
      {/* ========================================================= */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider font-display">
                Priority 2 — Experience Points (XP)
              </h3>
              <p className="text-[11px] text-slate-400">
                Lifetime engineering progression, architectural milestones, and governance score
              </p>
            </div>
          </div>
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-800">
            Level {Math.floor(postedXp / 1000) + 1} Executive
          </span>
        </div>

        {/* 4 XP Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-4 rounded-3xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-100/80 dark:border-purple-900/40 text-center space-y-1 shadow-2xs">
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Posted XP</div>
            <div className="text-2xl font-bold font-display text-purple-600 dark:text-purple-400">
              {postedXp.toLocaleString()}
            </div>
            <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
              Verified & Active
            </div>
          </div>

          <div className="p-4 rounded-3xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-100/80 dark:border-amber-900/40 text-center space-y-1 shadow-2xs">
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Pending XP</div>
            <div className="text-2xl font-bold font-display text-amber-600 dark:text-amber-400">
              {pendingXp.toLocaleString()}
            </div>
            <div className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
              Under Review
            </div>
          </div>

          <div className="p-4 rounded-3xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-100/80 dark:border-rose-900/40 text-center space-y-1 shadow-2xs">
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Frozen XP</div>
            <div className="text-2xl font-bold font-display text-rose-600 dark:text-rose-400">
              {frozenXp.toLocaleString()}
            </div>
            <div className="text-[10px] text-rose-600 dark:text-rose-400 font-medium">
              Hold
            </div>
          </div>

          <div className="p-4 rounded-3xl bg-slate-50 dark:bg-slate-850/80 border border-slate-100 dark:border-slate-800 text-center space-y-1 shadow-2xs">
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Lifetime XP</div>
            <div className="text-2xl font-bold font-display text-slate-900 dark:text-white">
              {lifetimeXp.toLocaleString()}
            </div>
            <div className="text-[10px] text-slate-400 font-medium">
              Cumulative Total
            </div>
          </div>
        </div>

        {/* Lifetime XP Stacked Progression Bar Chart */}
        <LifetimeXpStackedChart
          lifetimeXp={lifetimeXp}
          postedXp={postedXp}
          pendingXp={pendingXp}
          frozenXp={frozenXp}
        />
      </div>

      {/* ========================================================= */}
      {/* 3. PRIORITY 3: MONEY & CFO DISBURSEMENTS (MONEY BAG) */}
      {/* ========================================================= */}
      <div className="space-y-4 pt-2">
        {/* Money Bag Header Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-3xl bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent border border-emerald-500/20">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shadow-xs">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-white font-display">
                  Priority 3 — CFO Project Disbursements & Money Bag
                </h3>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                  <Coins className="w-3 h-3" />
                  CFO Disbursed
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Executive compensation, architecture project disbursements, and bonuses verified by Finance
              </p>
            </div>
          </div>

          <div className="text-right self-start sm:self-auto">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">
              Wallet Status
            </div>
            <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Active & Verified
            </div>
          </div>
        </div>

        {/* 4 Money Cards: Available Balance, Total Earned, Penalty, Spendings */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Balance (Money Bag) */}
          <div className="bg-[#fff8f2] dark:bg-amber-950/20 border border-amber-100/80 dark:border-amber-900/40 rounded-3xl p-5 shadow-2xs">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
              <span className="font-medium">Available Balance</span>
              <div className="p-2 rounded-xl bg-amber-100/80 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300">
                <ShoppingBag className="w-4 h-4" />
              </div>
            </div>
            <div className="text-3xl font-bold font-display text-slate-900 dark:text-white">
              {formatCurrency(ctoWallet?.balance ?? 0)}
            </div>
            <div className="mt-2 text-[11px] text-amber-700 dark:text-amber-400 font-medium flex items-center gap-1">
              <ArrowUpRight className="w-3 h-3" />
              Available in Money Bag
            </div>
          </div>

          {/* 2. Total Earned */}
          <div className="bg-[#f0fdf9] dark:bg-emerald-950/20 border border-emerald-100/80 dark:border-emerald-900/40 rounded-3xl p-5 shadow-2xs">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
              <span className="font-medium">Total Earned</span>
              <div className="p-2 rounded-xl bg-emerald-100/80 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300">
                <ShieldCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="text-3xl font-bold font-display text-slate-900 dark:text-white">
              {formatCurrency(ctoWallet?.totalEarnedToDate ?? 0)}
            </div>
            <div className="mt-2 text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
              Cumulative executive earnings
            </div>
          </div>

          {/* 3. Penalty */}
          <div className="bg-[#fff1f2] dark:bg-rose-950/20 border border-rose-100/80 dark:border-rose-900/40 rounded-3xl p-5 shadow-2xs">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
              <span className="font-medium">Deductions</span>
              <div className="p-2 rounded-xl bg-rose-100/80 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <div className="text-3xl font-bold font-display text-rose-600 dark:text-rose-400">
              -{formatCurrency(totalPenalties)}
            </div>
            <div className="mt-2 text-[11px] text-rose-700 dark:text-rose-400 font-medium flex items-center gap-1">
              <ArrowDownRight className="w-3 h-3" />
              Deductions & SLA penalties
            </div>
          </div>

          {/* 4. Spendings */}
          <div className="bg-[#f2f7ff] dark:bg-sky-950/20 border border-sky-100/80 dark:border-sky-900/40 rounded-3xl p-5 shadow-2xs">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
              <span className="font-medium">Spendings</span>
              <div className="p-2 rounded-xl bg-sky-100/80 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300">
                <Wallet className="w-4 h-4" />
              </div>
            </div>
            <div className="text-3xl font-bold font-display text-slate-900 dark:text-white">
              {formatCurrency(totalSpendings)}
            </div>
            <div className="mt-2 text-[11px] text-sky-700 dark:text-sky-400 font-medium">
              Perk store & internal deductions
            </div>
          </div>
        </div>

        {/* Executive Milestone Bonus Highlight Card */}
        <div className="p-4 rounded-3xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2.5 text-slate-700 dark:text-slate-200">
            <div className="p-2 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-semibold text-slate-900 dark:text-white block">
                Executive Architecture Delivery Bonus
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Disbursed upon successful organization-wide release cycles and QA sign-off
              </span>
            </div>
          </div>
          <span className="font-bold text-amber-700 dark:text-amber-300 font-display text-base">
            +{formatCurrency(ctoWallet?.sprintBonusEarned ?? 0)}
          </span>
        </div>

        {/* Transactions & CFO Disbursement Ledger */}
        <Card
          title="CFO Disbursement Ledger & Transactions"
          icon={ShoppingBag}
          action={
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              <button
                onClick={() => setFilterType('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  filterType === 'all'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilterType('payout')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  filterType === 'payout'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800'
                }`}
              >
                Payouts
              </button>
              <button
                onClick={() => setFilterType('penalty')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  filterType === 'penalty'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800'
                }`}
              >
                Penalties
              </button>
            </div>
          }
          noPadding
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-500 bg-slate-50/50 dark:bg-slate-850">
                  <th className="py-3 px-5 font-medium">Description</th>
                  <th className="py-3 px-3 font-medium">Type</th>
                  <th className="py-3 px-3 font-medium">Date</th>
                  <th className="py-3 px-3 font-medium">Status</th>
                  <th className="py-3 px-5 font-medium text-right">Disbursement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400 dark:text-slate-500">
                      No CFO transactions match the selected filter.
                    </td>
                  </tr>
                ) : (
                  filteredTransactions.map((tx) => {
                    const isPenalty = tx.type === 'penalty' || tx.amount < 0
                    return (
                      <tr
                        key={tx.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                      >
                        <td className="py-3.5 px-5 font-medium text-slate-900 dark:text-slate-100">
                          <div className="flex items-center gap-2">
                            {isPenalty ? (
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                            ) : (
                              <ShoppingBag className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            )}
                            <span>{tx.description}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              isPenalty
                                ? 'bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300'
                                : tx.type === 'bonus'
                                  ? 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300'
                                  : 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300'
                            }`}
                          >
                            {isPenalty ? 'Penalty' : tx.type === 'bonus' ? 'Bonus' : 'CFO Payout'}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 whitespace-nowrap text-slate-400 dark:text-slate-500">
                          {formatDate(tx.date, 'short')}
                        </td>
                        <td className="py-3.5 px-3 whitespace-nowrap">
                          <StatusPill status={tx.status} size="sm" />
                        </td>
                        <td
                          className={`py-3.5 px-5 whitespace-nowrap text-right font-semibold font-mono ${
                            isPenalty
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {isPenalty
                            ? `-${formatCurrency(Math.abs(tx.amount))}`
                            : `+${formatCurrency(tx.amount)}`}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  )
}

export default CtoEarningsPage
