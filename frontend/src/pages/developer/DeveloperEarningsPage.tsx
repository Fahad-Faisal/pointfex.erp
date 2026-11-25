import { useState, useMemo, useEffect } from 'react'
import { Card } from '../../components/common/Card'
import { Badge } from '../../components/common/Badge'
import { StatusPill } from '../../components/common/StatusPill'
import { EmptyState } from '../../components/common/EmptyState'
import { useDeveloperData } from '../../hooks/useDeveloperData'
import { useApp } from '../../context/AppContext'
import { erpApi } from '../../api/client'
import { formatCurrency, formatDate } from '../../utils/formatters'
import {
  WeeklyKpiTrendGraph,
  LifetimeXpStackedChart,
  KpiXpAuditLedgerTable,
  type WeeklyKpiItem,
  type KpiXpAuditItem,
} from '../../components/performance/KpiXpWidgets'
import {
  Wallet,
  ShieldCheck,
  AlertTriangle,
  ShoppingBag,
  ArrowDownRight,
  ArrowUpRight,
  Award,
  CheckCircle2,
  Clock,
  Sparkles,
  Zap,
} from 'lucide-react'

export function DeveloperEarningsPage() {
  const { wallet, transactions, performance, allDevTasks } = useDeveloperData()
  const { currentUser } = useApp()
  const [filterType, setFilterType] = useState<'all' | 'payout' | 'penalty'>('all')

  const [kpiHistory, setKpiHistory] = useState<WeeklyKpiItem[]>([])
  const [auditLogs, setAuditLogs] = useState<KpiXpAuditItem[]>([])
  const [perfSummary, setPerfSummary] = useState<any>(null)

  const liveMetrics = useMemo(() => {
    const tasks = allDevTasks || []
    const completedTasks = tasks.filter((t) => t.status === 'completed')
    const totalCount = tasks.length
    const completionPct =
      totalCount > 0
        ? Math.round((completedTasks.length / totalCount) * 100)
        : performance?.completionRate
          ? Math.round(Number(performance.completionRate))
          : 0

    const tasksWithDueDate = tasks.filter((t) => Boolean(t.dueDate))
    const metCount = tasksWithDueDate.filter(
      (t) =>
        t.status === 'completed' &&
        (!(t as any).completedAt ||
          new Date((t as any).completedAt) <= new Date(t.dueDate)),
    ).length
    const totalDeadlines = tasksWithDueDate.length
    const onTimePct =
      totalDeadlines > 0
        ? Math.round((metCount / totalDeadlines) * 100)
        : performance?.onTimeDeliveryRate
          ? Math.round(Number(performance.onTimeDeliveryRate))
          : 0
    const deadlineText =
      totalDeadlines > 0
        ? `${metCount} of ${totalDeadlines} deadlines met`
        : totalCount > 0
          ? 'No deadlines set'
          : 'No tasks assigned'

    const scoredTasks = completedTasks.filter(
      (t) => t.pmScore !== undefined && t.pmScore !== null,
    )
    const avgScore =
      scoredTasks.length > 0
        ? Math.round(
            scoredTasks.reduce((acc, t) => acc + Number(t.pmScore), 0) /
              scoredTasks.length,
          )
        : perfSummary?.currentWeeklyKpi &&
            typeof perfSummary.currentWeeklyKpi === 'number'
          ? Math.round(perfSummary.currentWeeklyKpi)
          : performance?.overallScore
            ? Math.round(Number(performance.overallScore))
            : 0

    const totalVelocity = completedTasks.reduce(
      (sum, t) => sum + (Number(t.weightPoints) || 0),
      0,
    )

    const bonusAmount =
      perfSummary?.bonusAmount ??
      (avgScore >= 85 && totalVelocity > 0 ? Math.round(totalVelocity * 15) : 0)

    return {
      completionPct,
      onTimePct,
      deadlineText,
      avgScore,
      totalVelocity,
      bonusAmount,
    }
  }, [allDevTasks, performance, perfSummary])

  useEffect(() => {
    let cancelled = false
    if (currentUser?.id) {
      void erpApi
        .getEmployeeKpiHistory(currentUser.id)
        .then((res) => {
          if (!cancelled && Array.isArray(res)) setKpiHistory(res)
        })
        .catch(() => undefined)

      void erpApi
        .getEmployeeKpiXpAuditLogs(currentUser.id)
        .then((res) => {
          if (!cancelled && Array.isArray(res)) setAuditLogs(res)
        })
        .catch(() => undefined)

      void erpApi
        .getPerformanceSummary(currentUser.id)
        .then((res) => {
          if (!cancelled && res) setPerfSummary(res)
        })
        .catch(() => undefined)
    }
    return () => {
      cancelled = true
    }
  }, [currentUser?.id])

  const totalPenalties = wallet?.totalPenalties ?? 0
  const totalSpendings = wallet?.totalSpendings ?? 0

  const deliverableLogs = useMemo(() => {
    return (allDevTasks || [])
      .filter((t) => t.status === 'completed')
      .sort((a, b) => new Date(b.completedAt || 0).getTime() - new Date(a.completedAt || 0).getTime())
  }, [allDevTasks])

  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      if (filterType === 'payout' && tx.type === 'penalty') return false
      if (filterType === 'penalty' && tx.type !== 'penalty') return false
      return true
    })
  }, [transactions, filterType])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white font-display">
            Performance, KPI & Compensation Wallet
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Priority KPI & XP progression, sprint metrics, deliverable settlement log, and CFO disbursements
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

      {/* 1. Priority Section: Performance & Delivery Metrics */}
      <Card title="Performance & Delivery Metrics" icon={Award}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            {/* Metric 1: Quality Score */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-center space-y-1">
              <div className="flex items-center justify-center gap-1.5 text-slate-400 dark:text-slate-500 text-[11px] font-medium">
                <Award className="w-3.5 h-3.5 text-amber-500" />
                <span>Overall Quality</span>
              </div>
              <div className="text-2xl font-bold font-display text-slate-900 dark:text-white">
                {liveMetrics.avgScore}/100
              </div>
              <div
                className={`text-[10px] font-semibold ${
                  liveMetrics.avgScore >= 85
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : liveMetrics.avgScore >= 70
                      ? 'text-sky-600 dark:text-sky-400'
                      : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                {liveMetrics.avgScore >= 85
                  ? 'Tier 1 Band'
                  : liveMetrics.avgScore >= 70
                    ? 'Tier 2 Band'
                    : liveMetrics.avgScore > 0
                      ? 'Tier 3 Band'
                      : 'Not Evaluated'}
              </div>
            </div>

            {/* Metric 2: On-Time Delivery */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-center space-y-1">
              <div className="flex items-center justify-center gap-1.5 text-slate-400 dark:text-slate-500 text-[11px] font-medium">
                <Clock className="w-3.5 h-3.5 text-sky-500" />
                <span>On-Time Rate</span>
              </div>
              <div className="text-2xl font-bold font-display text-slate-900 dark:text-white">
                {liveMetrics.onTimePct}%
              </div>
              <div className="text-[10px] text-slate-400 dark:text-slate-500">
                {liveMetrics.deadlineText}
              </div>
            </div>

            {/* Metric 3: Completion Rate */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-center space-y-1">
              <div className="flex items-center justify-center gap-1.5 text-slate-400 dark:text-slate-500 text-[11px] font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span>Task Completion</span>
              </div>
              <div className="text-2xl font-bold font-display text-slate-900 dark:text-white">
                {liveMetrics.completionPct}%
              </div>
              <div className="text-[10px] text-slate-400 dark:text-slate-500">
                Sprint tasks completed
              </div>
            </div>

            {/* Metric 4: Team Pace */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-center space-y-1">
              <div className="flex items-center justify-center gap-1.5 text-slate-400 dark:text-slate-500 text-[11px] font-medium">
                <Zap className="w-3.5 h-3.5 text-purple-500" />
                <span>Team Pace</span>
              </div>
              <div className="text-2xl font-bold font-display text-slate-900 dark:text-white">
                {liveMetrics.totalVelocity} pts
              </div>
              <div className="text-[10px] text-slate-400 dark:text-slate-500">
                {liveMetrics.totalVelocity > 0
                  ? `${liveMetrics.totalVelocity} completed pts`
                  : 'No pace points logged'}
              </div>
            </div>
          </div>

          {/* Simple bonus indicator */}
          <div className="p-3 rounded-2xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
              <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
              <span>Current Sprint Performance Bonus Qualified:</span>
            </div>
            <span className="font-bold text-amber-700 dark:text-amber-300 font-display text-sm">
              {liveMetrics.bonusAmount > 0
                ? `+${formatCurrency(liveMetrics.bonusAmount)}`
                : '৳0 (Requires 85+ score)'}
            </span>
          </div>
        </div>
      </Card>

      {/* 2. Priority Section: Pointfex KPI & XP Governance Suite */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <WeeklyKpiTrendGraph data={kpiHistory} />
        <LifetimeXpStackedChart
          lifetimeXp={perfSummary?.lifetimeXp || currentUser?.lifetimeXp || wallet?.balance || 0}
        />
      </div>

      {/* 3. Priority Section: Deliverable KPI & XP Settlement Log */}
      <Card title="Deliverable KPI & XP Settlement Log" icon={Clock}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/40 text-[11px] uppercase tracking-wider text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4">Deliverable / Task</th>
                <th className="py-3 px-3">Date Completed</th>
                <th className="py-3 px-3">Weight & XP</th>
                <th className="py-3 px-3">KPI Score</th>
                <th className="py-3 px-4">Review & Settlement Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {deliverableLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-400">
                    No completed deliverables yet to settle.
                  </td>
                </tr>
              ) : (
                deliverableLogs.map((task) => {
                  const points = Number(task.weightPoints || 2)
                  const xp = points * 10
                  const score = task.pmScore !== undefined && task.pmScore !== null ? Number(task.pmScore) : null

                  const isCeoLocked = Boolean(task.ceoFinalized)
                  const isStatusFinalized = task.reviewStatus === 'FINALIZED'
                  let isAutoFinalized = false
                  let remainingHours = 0

                  if (task.reviewDeadlineAt) {
                    const diffMs = new Date(task.reviewDeadlineAt).getTime() - Date.now()
                    if (diffMs <= 0) {
                      isAutoFinalized = true
                    } else {
                      remainingHours = Math.ceil(diffMs / (1000 * 60 * 60))
                    }
                  } else if (task.completedAt) {
                    const completedTime = new Date(task.completedAt).getTime()
                    const diffMs = completedTime + 24 * 60 * 60 * 1000 - Date.now()
                    if (diffMs <= 0) {
                      isAutoFinalized = true
                    } else {
                      remainingHours = Math.ceil(diffMs / (1000 * 60 * 60))
                    }
                  } else {
                    isAutoFinalized = true
                  }

                  const isFinal = isCeoLocked || isStatusFinalized || isAutoFinalized

                  return (
                    <tr key={task.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {task.title}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {task.isMainProjectTask ? `${task.projectPercentage || 0}% Project Share` : 'Standalone Deliverable'}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-500 whitespace-nowrap">
                        {formatDate(task.completedAt ? String(task.completedAt) : new Date().toISOString(), 'short')}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap font-mono">
                        <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                          {points} pts
                        </span>
                        <span className="text-slate-400 ml-1">({xp} XP)</span>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap font-mono font-bold">
                        {score !== null ? (
                          <span className={score >= 85 ? 'text-emerald-600' : 'text-amber-600'}>
                            {score}/100
                          </span>
                        ) : (
                          <span className="text-slate-400 font-normal">Pending Score</span>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {isFinal ? (
                          <Badge variant="emerald" size="xs">
                            <CheckCircle2 className="w-3 h-3 mr-1 inline" />
                            Finalized
                          </Badge>
                        ) : (
                          <Badge variant="amber" size="xs">
                            <Clock className="w-3 h-3 mr-1 inline" />
                            Pending Review (auto-finalizes in {remainingHours}h)
                          </Badge>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {auditLogs.length > 0 && <KpiXpAuditLedgerTable logs={auditLogs} />}

      {/* 4. CFO Project-Based Compensation & Wallet Section */}
      <div className="pt-6 border-t border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white font-display flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-emerald-500" />
              Priority 3 — CFO Project Disbursements & Money Bag
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              All project compensation, milestone payouts, and adjustments are disbursed directly by the CFO
            </p>
          </div>
          <Badge variant="emerald" size="sm">
            Disbursed by CFO
          </Badge>
        </div>

        {/* 4 Metric Cards: Balance, Total Earned, Penalty, Spendings */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Balance */}
          <div className="bg-[#fff8f2] dark:bg-amber-950/20 border border-amber-100/80 dark:border-amber-900/40 rounded-3xl p-5 shadow-2xs">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
              <span className="font-medium">Available Balance</span>
              <div className="p-2 rounded-xl bg-amber-100/80 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300">
                <ShoppingBag className="w-4 h-4" />
              </div>
            </div>
            <div className="text-3xl font-bold font-display text-slate-900 dark:text-white">
              {formatCurrency(wallet?.balance ?? 0)}
            </div>
            <div className="mt-2 text-[11px] text-amber-700 dark:text-amber-400 font-medium flex items-center gap-1">
              <ArrowUpRight className="w-3 h-3" />
              Available in Money Bag
            </div>
          </div>

          {/* 2. Total Earned */}
          <div className="bg-[#f0fdf9] dark:bg-emerald-950/20 border border-emerald-100/80 dark:border-emerald-900/40 rounded-3xl p-5 shadow-2xs">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
              <span>Total Earned</span>
              <div className="p-2 rounded-xl bg-emerald-100/80 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300">
                <ShieldCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="text-3xl font-bold font-display text-slate-900 dark:text-white">
              {formatCurrency(wallet?.totalEarnedToDate ?? 0)}
            </div>
            <div className="mt-2 text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
              Cumulative career earnings
            </div>
          </div>

          {/* 3. Penalty */}
          <div className="bg-[#fff1f2] dark:bg-rose-950/20 border border-rose-100/80 dark:border-rose-900/40 rounded-3xl p-5 shadow-2xs">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
              <span>Penalty</span>
              <div className="p-2 rounded-xl bg-rose-100/80 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <div className="text-3xl font-bold font-display text-rose-600 dark:text-rose-400">
              -{formatCurrency(totalPenalties)}
            </div>
            <div className="mt-2 text-[11px] text-rose-700 dark:text-rose-400 font-medium flex items-center gap-1">
              <ArrowDownRight className="w-3 h-3" />
              SLA & quality deductions
            </div>
          </div>

          {/* 4. Spendings */}
          <div className="bg-[#f2f7ff] dark:bg-sky-950/20 border border-sky-100/80 dark:border-sky-900/40 rounded-3xl p-5 shadow-2xs">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
              <span>Spendings</span>
              <div className="p-2 rounded-xl bg-sky-100/80 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300">
                <ShoppingBag className="w-4 h-4" />
              </div>
            </div>
            <div className="text-3xl font-bold font-display text-slate-900 dark:text-white">
              {formatCurrency(totalSpendings)}
            </div>
            <div className="mt-2 text-[11px] text-sky-700 dark:text-sky-400 font-medium">
              Internal perk store (catalog coming soon)
            </div>
          </div>
        </div>
      </div>

      {/* Transactions & Ledger */}
      <Card
        title="Ledger & Transactions"
        icon={Wallet}
        action={
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            <button
              onClick={() => setFilterType('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                filterType === 'all'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterType('payout')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                filterType === 'payout'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800'
              }`}
            >
              Payouts
            </button>
            <button
              onClick={() => setFilterType('penalty')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
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
                <th className="py-3 px-5 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6">
                    <EmptyState
                      icon={Wallet}
                      title="No transactions found"
                      description="No wallet records match your current filter."
                    />
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx) => {
                  const isPenalty = tx.type === 'penalty'

                  return (
                    <tr
                      key={tx.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="py-3.5 px-5 font-medium text-slate-900 dark:text-slate-100">
                        <div className="flex items-center gap-2">
                          {isPenalty && (
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          )}
                          <span>{tx.description}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        <Badge
                          variant={isPenalty ? 'rose' : tx.type === 'bonus' ? 'amber' : 'emerald'}
                          size="xs"
                        >
                          {isPenalty ? 'Penalty' : tx.type === 'bonus' ? 'Bonus' : 'Payout'}
                        </Badge>
                      </td>
                      <td className="py-3.5 px-3 whitespace-nowrap text-slate-400 dark:text-slate-500">
                        {formatDate(tx.date, 'short')}
                      </td>
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        <StatusPill status={tx.status} size="sm" />
                      </td>
                      <td
                        className={`py-3.5 px-5 whitespace-nowrap text-right font-semibold ${
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
  )
}
