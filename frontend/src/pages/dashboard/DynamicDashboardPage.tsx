import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  Award,
  CalendarDays,
  CheckSquare,
  ClipboardCheck,
  Clock,
  Coins,
  FolderGit2,
  Pin,
  Share2,
  SlidersHorizontal,
  Users,
  Wallet,
  ShieldCheck,
  TrendingUp,
  KeyRound,
} from 'lucide-react'
import { erpApi } from '../../api/client'
import { useApp } from '../../context/AppContext'
import { usePermissions } from '../../hooks/usePermissions'
import { resolveVisibleDashboardWidgets } from '../../dashboard/widgets'
import { resolveVisibleNavigation, resolveVisibleWorkspaces } from '../../config/nav-registry'
import { formatBDTCompact } from '../../utils/money'
import {
  getClockInStateKey,
  loadUserPreferences,
  saveUserPreferences,
  type UserPreferences,
} from '../../utils/user-prefs'
import { PageHeader } from '../../components/common/PageHeader'
import { StatCard, type StatCardProps } from '../../components/common/StatCard'
import { Button } from '../../components/common/Button'
import { Badge } from '../../components/common/Badge'
import { Modal } from '../../components/common/Modal'
import { StatusPill } from '../../components/common/StatusPill'
import { formatDate } from '../../utils/formatters'
import { HomePersonalizeModal } from './HomePersonalizeModal'
import {
  WeeklyKpiTrendGraph,
  LifetimeXpStackedChart,
  KpiXpAuditLedgerTable,
  type WeeklyKpiItem,
  type KpiXpAuditItem,
} from '../../components/performance/KpiXpWidgets'

function getDhakaGreeting(): string {
  try {
    const hourStr = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: 'Asia/Dhaka',
    }).format(new Date())
    const hour = Number(hourStr)
    if (hour >= 5 && hour < 12) return 'Good morning'
    if (hour >= 12 && hour < 17) return 'Good afternoon'
    if (hour >= 17 && hour < 21) return 'Good evening'
    return 'Working late'
  } catch {
    return 'Welcome back'
  }
}

export function DynamicDashboardPage() {
  const {
    currentUser,
    data,
    pendingApprovalsCount,
    activeDelegationsCount,
    authzSnapshot,
    setRoute,
    setSelectedTaskModal,
    can,
    canAny,
    showToast,
  } = useApp()
  const { permissions } = usePermissions()
  const effectivePermissions = authzSnapshot?.effectiveCodes ?? permissions

  const [prefs, setPrefs] = useState<UserPreferences>(() => loadUserPreferences(currentUser?.id))
  const [isPersonalizeOpen, setIsPersonalizeOpen] = useState(false)
  const [clockedInAt, setClockedInAt] = useState<string | null>(() => {
    if (!currentUser?.id || typeof localStorage === 'undefined') return null
    return localStorage.getItem(getClockInStateKey(currentUser.id))
  })

  const updatePrefs = (next: UserPreferences) => {
    setPrefs(next)
    saveUserPreferences(currentUser?.id, next)
  }

  const allRoleWidgets = useMemo(
    () => resolveVisibleDashboardWidgets(effectivePermissions),
    [effectivePermissions],
  )

  const { visibleItems: availablePages } = useMemo(
    () => resolveVisibleNavigation(effectivePermissions),
    [effectivePermissions],
  )
  const availableWorkspaces = useMemo(
    () => resolveVisibleWorkspaces(effectivePermissions).map((w) => w.workspace),
    [effectivePermissions],
  )

  const pinnedPages = useMemo(
    () => availablePages.filter((p) => prefs.pinnedRoutes.includes(p.route)),
    [availablePages, prefs.pinnedRoutes],
  )

  const [inboxPreview, setInboxPreview] = useState<any[]>([])
  const myPerformance = useMemo(
    () => data.performanceRecords.find((p) => p.userId === currentUser?.id) || null,
    [data.performanceRecords, currentUser?.id],
  )
  const xpBalance = myPerformance?.velocityPointsSprint3 ?? 0
  const xpLevel = Math.max(1, Math.floor(xpBalance / 250) + 1)

  // Pointfex KPI & XP Governance Suite State
  const userRole = (currentUser?.role || '').toLowerCase()
  const isCeo = userRole === 'ceo'
  const isChro = userRole === 'chro'
  const isCLevel = isCeo || isChro || ['cto', 'cfo', 'cpo'].includes(userRole)
  const isPm = userRole === 'pm' || currentUser?.title?.toLowerCase().includes('project manager')
  const canOverride = isCeo || isChro || isCLevel || isPm

  const [kpiHistory, setKpiHistory] = useState<WeeklyKpiItem[]>([])
  const [kpiAuditLogs, setKpiAuditLogs] = useState<KpiXpAuditItem[]>([])
  const [perfSummary, setPerfSummary] = useState<any>(null)
  const [xpSummary, setXpSummary] = useState<{ postedXp?: number; pendingXp?: number; frozenXp?: number } | null>(null)
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false)
  const [isOverrideModalOpen, setIsOverrideModalOpen] = useState(false)

  // Override Modal Form State
  const [overrideTargetEmployeeId, setOverrideTargetEmployeeId] = useState('')
  const [overrideMetricType, setOverrideMetricType] = useState<'KPI' | 'XP'>('KPI')
  const [overrideWeek, setOverrideWeek] = useState(47)
  const [overrideYear, setOverrideYear] = useState(2026)
  const [overrideScore, setOverrideScore] = useState<number | ''>(90)
  const [overrideIsInactive, setOverrideIsInactive] = useState(false)
  const [overrideDeltaXp, setOverrideDeltaXp] = useState<number | ''>(50)
  const [overrideReason, setOverrideReason] = useState('')
  const [overrideMfaCode, setOverrideMfaCode] = useState('')
  const [isSubmittingOverride, setIsSubmittingOverride] = useState(false)

  const fetchPerformanceData = useCallback(() => {
    if (!currentUser?.id) return
    erpApi
      .getMyKpiSeries()
      .then((rows) => {
        if (Array.isArray(rows) && rows.length > 0) {
          setKpiHistory(rows)
        }
      })
      .catch(() => {
        // Fallback to legacy endpoint if available
        erpApi
          .getEmployeeKpiHistory(currentUser.id)
          .then((rows) => {
            if (Array.isArray(rows) && rows.length > 0) setKpiHistory(rows)
          })
          .catch(() => {})
      })

    erpApi
      .getMyXpSummary()
      .then((summary) => {
        if (summary) setXpSummary(summary)
      })
      .catch(() => {})

    erpApi
      .getEmployeeKpiXpAuditLogs(currentUser.id)
      .then((rows) => {
        if (Array.isArray(rows)) setKpiAuditLogs(rows)
      })
      .catch(() => {})

    erpApi
      .getPerformanceSummary(currentUser.id)
      .then((summary) => {
        if (summary) setPerfSummary(summary)
      })
      .catch(() => {})
  }, [currentUser?.id])

  useEffect(() => {
    fetchPerformanceData()
  }, [fetchPerformanceData])

  const displayKpiHistory = useMemo<WeeklyKpiItem[]>(() => {
    if (kpiHistory.length > 0) return kpiHistory
    if (perfSummary?.currentWeeklyKpi && perfSummary.currentWeeklyKpi !== 'N/A') {
      const currentScore = Number(perfSummary.currentWeeklyKpi)
      return [
        {
          id: 'current-week',
          weekNumber: 46,
          year: 2026,
          score: currentScore,
          isInactive: perfSummary?.isInactive ?? false,
        },
      ]
    }
    return []
  }, [kpiHistory, perfSummary])

  const effectiveLifetimeXp =
    perfSummary?.lifetimeXp ?? (currentUser as any)?.lifetimeXp ?? xpBalance

  const eligibleTargetEmployees = useMemo(() => {
    if (isCeo || isChro || isCLevel) {
      return data.users
    }
    if (isPm) {
      const mySquadMemberIds = new Set<string>()
      data.teams
        .filter((t) => t.pmId === currentUser?.id)
        .forEach((t) => {
          t.memberIds.forEach((mId) => mySquadMemberIds.add(mId))
        })
      if (currentUser?.id) mySquadMemberIds.add(currentUser.id)
      return data.users.filter((u) => mySquadMemberIds.has(u.id))
    }
    return []
  }, [isCeo, isChro, isCLevel, isPm, data.users, data.teams, currentUser?.id])

  const handleSaveAuditReason = async (logId: string, newReason: string) => {
    try {
      await erpApi.updateKpiXpAuditLog(logId, { reason: newReason })
      showToast('Audit log updated successfully.', 'success')
      fetchPerformanceData()
    } catch (err: any) {
      showToast(err?.message || 'Failed to update audit log entry', 'error')
    }
  }

  const handleSaveOverride = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!overrideTargetEmployeeId) {
      showToast('Please select a target team member', 'error')
      return
    }

    if (isCeo) {
      if (!overrideMfaCode || !/^\d{6}$/.test(overrideMfaCode.trim())) {
        showToast(
          'CEO Override requires strictly and only a valid 6-digit MFA verification code',
          'error',
        )
        return
      }
    }

    setIsSubmittingOverride(true)
    try {
      await erpApi.overridePerformanceRecord(
        {
          targetEmployeeId: overrideTargetEmployeeId,
          metricType: overrideMetricType,
          weekNumber: Number(overrideWeek),
          year: Number(overrideYear),
          score: overrideIsInactive ? null : Number(overrideScore),
          deltaXp: overrideMetricType === 'XP' ? Number(overrideDeltaXp) : undefined,
          reason: overrideReason.trim() || undefined,
          mfaCode: overrideMfaCode.trim() || undefined,
        },
        overrideMfaCode.trim() || undefined,
      )

      showToast(`Successfully updated ${overrideMetricType} evaluation.`, 'success')
      setIsOverrideModalOpen(false)
      setOverrideReason('')
      setOverrideMfaCode('')
      fetchPerformanceData()
    } catch (err: any) {
      showToast(err?.message || 'Failed to apply override', 'error')
    } finally {
      setIsSubmittingOverride(false)
    }
  }

  const canClockAttendance = canAny([
    'attendance:clock_in',
    'attendance:clock_out',
    'attendance:read_own',
  ])

  const handleToggleClock = () => {
    if (!currentUser?.id) return
    const key = getClockInStateKey(currentUser.id)
    if (clockedInAt) {
      localStorage.removeItem(key)
      setClockedInAt(null)
      showToast('Clocked out for today.', 'info')
    } else {
      const nowIso = new Date().toISOString()
      localStorage.setItem(key, nowIso)
      setClockedInAt(nowIso)
      showToast('Clocked in for today.', 'success')
    }
  }

  useEffect(() => {
    if (!currentUser?.id) return
    if (can('approvals:read') || can('approvals:approve') || can('governance:approve_request')) {
      erpApi
        .getApprovalInbox()
        .then((rows) => setInboxPreview(Array.isArray(rows) ? rows.slice(0, 5) : []))
        .catch(() => setInboxPreview([]))
    }
  }, [currentUser?.id, can])

  const myTasks = useMemo(
    () =>
      data.tasks
        .filter((t) => t.assigneeId === currentUser?.id && t.status !== 'completed')
        .slice(0, 5),
    [data.tasks, currentUser?.id],
  )

  const myWallet = useMemo(
    () => data.wallets.find((w) => w.userId === currentUser?.id) || null,
    [data.wallets, currentUser?.id],
  )

  const [showCharts, setShowCharts] = useState(false)

  const primarySquad = useMemo(() => {
    if (!currentUser?.id) return data.teams[0] || null
    return (
      data.teams.find(
        (t) =>
          t.pmId === currentUser.id ||
          t.memberIds.includes(currentUser.id) ||
          currentUser.teamIds?.includes(t.id) ||
          currentUser.teamId === t.id,
      ) ||
      data.teams[0] ||
      null
    )
  }, [data.teams, currentUser])

  const statCards: StatCardProps[] = useMemo(() => {
    if (isCeo || isCLevel) {
      return [
        {
          label: 'Active Initiatives',
          value: data.projects.filter((p) => p.status === 'active').length,
          trend: `${data.projects.length} total tracked`,
          trendTone: 'neutral',
          icon: FolderGit2,
          onClick: () => setRoute('projects-repos'),
        },
        {
          label: 'Needs My Action',
          value: pendingApprovalsCount,
          trend: pendingApprovalsCount > 0 ? 'Executive sign-offs waiting' : 'All caught up',
          trendTone: pendingApprovalsCount > 0 ? 'warning' : 'neutral',
          icon: ClipboardCheck,
          onClick: () => setRoute('inbox'),
        },
        {
          label: 'Engineering Squads',
          value: data.teams.length,
          trend: `${data.users.length} active personnel`,
          trendTone: 'info',
          icon: Users,
          onClick: () => setRoute('team-management'),
        },
        {
          label: 'Treasury Reserves',
          value: formatBDTCompact(data.treasury.unallocatedReserves),
          trend: `Initial Capital ${formatBDTCompact(data.treasury.initialCapital)}`,
          trendTone: 'success',
          icon: Coins,
          onClick: () => setRoute('budget'),
        },
      ]
    }

    if (isPm) {
      const pmSquads = data.teams.filter((t) => t.pmId === currentUser?.id)
      const squadTaskTotal = data.tasks.filter((t) =>
        pmSquads.some((sq) => sq.memberIds.includes(t.assigneeId)),
      ).length

      return [
        {
          label: 'My Open Tasks',
          value: myTasks.length,
          trend: myTasks.some((t) => t.priority === 'urgent') ? 'Priority items due' : 'On schedule',
          trendTone: myTasks.some((t) => t.priority === 'urgent') ? 'warning' : 'success',
          icon: CheckSquare,
          onClick: () => setRoute('tasks'),
        },
        {
          label: 'Needs My Action',
          value: pendingApprovalsCount,
          trend: pendingApprovalsCount > 0 ? 'Waiting for sign-off' : 'All caught up',
          trendTone: pendingApprovalsCount > 0 ? 'warning' : 'neutral',
          icon: ClipboardCheck,
          onClick: () => setRoute('inbox'),
        },
        {
          label: 'Squad Tasks',
          value: squadTaskTotal > 0 ? squadTaskTotal : data.tasks.filter((t) => t.status !== 'completed').length,
          trend: `${pmSquads.length || 1} active squad(s)`,
          trendTone: 'info',
          icon: FolderGit2,
          onClick: () => setRoute('squads'),
        },
        {
          label: 'Squad Standing',
          value: `Level ${xpLevel}`,
          trend: `${xpBalance} XP • ${formatBDTCompact(myWallet?.balance ?? 0)}`,
          trendTone: 'success',
          icon: Award,
          onClick: () => setRoute('earnings'),
        },
      ]
    }

    // Default for Developers & Engineering staff
    return [
      {
        label: 'My Active Tasks',
        value: myTasks.length,
        trend: myTasks.some((t) => t.priority === 'urgent') ? 'Priority item due' : 'On schedule',
        trendTone: myTasks.some((t) => t.priority === 'urgent') ? 'warning' : 'success',
        icon: CheckSquare,
        onClick: () => setRoute('tasks'),
      },
      {
        label: 'Needs My Action',
        value: pendingApprovalsCount,
        trend: pendingApprovalsCount > 0 ? 'Action required in Inbox' : 'All caught up',
        trendTone: pendingApprovalsCount > 0 ? 'warning' : 'neutral',
        icon: ClipboardCheck,
        onClick: () => setRoute('inbox'),
      },
      {
        label: 'Career Standing',
        value: `Level ${xpLevel}`,
        trend: `${xpBalance} Lifetime XP`,
        trendTone: 'info',
        icon: Award,
        onClick: () => setRoute('earnings'),
      },
      {
        label: 'Wallet Balance',
        value: formatBDTCompact(myWallet?.balance ?? 0),
        trend: 'Available virtual wallet balance',
        trendTone: 'success',
        icon: Wallet,
        onClick: () => setRoute('earnings'),
      },
    ]
  }, [
    isCeo,
    isCLevel,
    isPm,
    data.projects,
    data.teams,
    data.treasury.initialCapital,
    data.treasury.unallocatedReserves,
    data.users,
    data.tasks,
    currentUser?.id,
    myTasks,
    myWallet?.balance,
    pendingApprovalsCount,
    setRoute,
    xpBalance,
    xpLevel,
  ])

  const isCompact = prefs.density === 'compact'

  return (
    <div className={isCompact ? 'space-y-4' : 'space-y-6'}>
      <PageHeader
        title={`${getDhakaGreeting()}, ${currentUser?.name || 'Team Member'}`}
        subtitle="Your daily focus, personal standing, and permission-matched workspace updates."
        action={
          <div className="flex items-center gap-2 flex-wrap">
            {canClockAttendance && (
              <Button
                variant={clockedInAt ? 'secondary' : 'primary'}
                size="sm"
                icon={Clock}
                onClick={handleToggleClock}
              >
                {clockedInAt ? 'Clock Out' : 'Clock In'}
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              icon={SlidersHorizontal}
              onClick={() => setIsPersonalizeOpen(true)}
            >
              Customize
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={ClipboardCheck}
              onClick={() => setRoute('inbox')}
            >
              Inbox ({pendingApprovalsCount})
            </Button>
          </div>
        }
      />

      {/* Personal Standing & Today's Chips */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="indigo" size="sm">
          <Award className="w-3.5 h-3.5 inline mr-1" />
          Level {xpLevel} • {xpBalance} XP
        </Badge>
        <Badge variant="emerald" size="sm">
          <Wallet className="w-3.5 h-3.5 inline mr-1" />
          {formatBDTCompact(myWallet?.balance ?? 0)}
        </Badge>
        <Badge variant="sky" size="sm">
          <CalendarDays className="w-3.5 h-3.5 inline mr-1" />
          {clockedInAt ? 'Status: Clocked In' : 'Status: Stand-by'}
        </Badge>
        {activeDelegationsCount > 0 && (
          <Badge variant="amber" size="sm">
            <Share2 className="w-3.5 h-3.5 inline mr-1" />
            {activeDelegationsCount} Active Delegation{activeDelegationsCount === 1 ? '' : 's'}
          </Badge>
        )}
      </div>

      {/* Pinned Favorite Pages */}
      {pinnedPages.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12px] font-medium text-[var(--muted)] inline-flex items-center gap-1">
            <Pin className="w-3.5 h-3.5" /> Pinned:
          </span>
          {pinnedPages.map((page) => {
            const Icon = page.icon
            return (
              <button
                key={page.id}
                type="button"
                onClick={() => setRoute(page.route)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--surface)] border border-[var(--border)] text-[12px] font-medium text-[var(--text)] hover:border-[var(--primary)] cursor-pointer transition-colors"
              >
                <Icon className="w-3.5 h-3.5 text-[var(--primary)]" />
                <span>{page.label}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Top Summary Strip (max 3–4 clean stat cards tailored to user's role) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <StatCard key={card.label} {...card} />
        ))}
      </div>

      {/* Primary Focus Section: My Active Tasks / Needs My Action with clear 1-click navigation */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left: My Active Tasks */}
        <div className="p-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xs space-y-3.5 flex flex-col">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <CheckSquare className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[var(--text)]">My Active Tasks</h3>
                <p className="text-[11px] text-[var(--muted)]">Items queued for your execution &amp; delivery</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="indigo" size="xs">
                {myTasks.length} open
              </Badge>
              <Button variant="ghost" size="xs" onClick={() => setRoute('tasks')}>
                View All
              </Button>
            </div>
          </div>

          <div className="space-y-2 flex-1">
            {myTasks.length === 0 ? (
              <div className="py-10 text-center text-xs text-[var(--muted)] italic">
                All caught up! No active tasks assigned to you right now.
              </div>
            ) : (
              myTasks.map((t) => {
                const project = data.projects.find((p) => p.id === t.projectId)
                return (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTaskModal(t)}
                    className="p-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:border-indigo-400/60 dark:hover:border-indigo-600 transition-all cursor-pointer flex items-center justify-between gap-3 shadow-2xs"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="text-xs font-semibold text-[var(--text)] truncate">
                        {t.title}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
                        <span className="font-mono">{project?.code || 'PROJECT'}</span>
                        <span>•</span>
                        <span>Due {formatDate(t.dueDate, 'short')}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        variant={
                          t.priority === 'urgent'
                            ? 'rose'
                            : t.priority === 'high'
                              ? 'amber'
                              : 'slate'
                        }
                        size="xs"
                      >
                        {t.priority}
                      </Badge>
                      <StatusPill status={t.status} />
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Right: Needs My Action */}
        <div className="p-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xs space-y-3.5 flex flex-col">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <ClipboardCheck className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[var(--text)]">Needs My Action</h3>
                <p className="text-[11px] text-[var(--muted)]">Approvals, sign-offs, and verification queues</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={pendingApprovalsCount > 0 ? 'amber' : 'slate'} size="xs">
                {pendingApprovalsCount} waiting
              </Badge>
              <Button variant="ghost" size="xs" onClick={() => setRoute('inbox')}>
                Open Inbox
              </Button>
            </div>
          </div>

          <div className="space-y-2 flex-1">
            {inboxPreview.length === 0 && pendingApprovalsCount === 0 ? (
              <div className="py-10 text-center text-xs text-[var(--muted)] italic">
                All clear! Nothing currently waiting for your review or decision.
              </div>
            ) : (
              (inboxPreview.length > 0
                ? inboxPreview
                : [
                    {
                      id: 'appr-1',
                      title: 'Pending Action Requests',
                      actorName: 'Governance Inbox',
                      createdAt: new Date().toISOString(),
                    },
                  ]
              )
                .slice(0, 4)
                .map((item: any) => (
                  <div
                    key={item.id}
                    onClick={() => setRoute('inbox')}
                    className="p-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:border-amber-400/60 dark:hover:border-amber-600 transition-all cursor-pointer flex items-center justify-between gap-3 shadow-2xs"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="text-xs font-semibold text-[var(--text)] truncate">
                        {item.title || item.description || 'Pending Request'}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
                        <span>From {item.actorName || item.requesterName || 'System'}</span>
                        {item.createdAt && (
                          <>
                            <span>•</span>
                            <span>{formatDate(item.createdAt, 'short')}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <Button variant="secondary" size="xs">
                      Review
                    </Button>
                  </div>
                ))
            )}
          </div>
        </div>
      </div>

      {/* Compact Recent Activity / Squad Snapshot */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left: Squad & Delivery Snapshot */}
        <div className="p-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-sky-50 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400 flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[var(--text)]">
                  {primarySquad ? `${primarySquad.name} (${primarySquad.code})` : 'Squad Snapshot'}
                </h3>
                <p className="text-[11px] text-[var(--muted)]">
                  {primarySquad?.focus || 'Current engineering team and sprint velocity'}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="xs" onClick={() => setRoute('squads')}>
              My Squads
            </Button>
          </div>

          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--muted)]">Sprint Health:</span>
              <Badge variant="emerald" size="xs" dot>
                On Track
              </Badge>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--muted)]">Active Squad Members:</span>
              <span className="font-semibold text-[var(--text)]">
                {primarySquad?.memberIds?.length || data.users.length} engineers
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--muted)]">Assigned Projects:</span>
              <span className="font-semibold text-[var(--text)]">
                {primarySquad?.projectIds?.length || 1} active
              </span>
            </div>
          </div>
        </div>

        {/* Right: Performance & Standing Summary */}
        <div className="p-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[var(--text)]">Performance &amp; Standing</h3>
                <p className="text-[11px] text-[var(--muted)]">Personal standing, weekly KPI, and career XP</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="xs"
                icon={ShieldCheck}
                onClick={() => setIsAuditModalOpen(true)}
              >
                Audit Log
              </Button>
              {canOverride && (
                <Button
                  variant="primary"
                  size="xs"
                  icon={Award}
                  onClick={() => {
                    setOverrideTargetEmployeeId(currentUser?.id || '')
                    setIsOverrideModalOpen(true)
                  }}
                >
                  Adjust
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--muted)]">Current Standing:</span>
              <Badge variant="indigo" size="xs">
                Level {xpLevel} • {xpBalance} Lifetime XP
              </Badge>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--muted)]">Wallet Balance:</span>
              <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400">
                {formatBDTCompact(myWallet?.balance ?? 0)}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--muted)]">Weekly Attendance:</span>
              <span className="text-[var(--text)] font-medium">
                {clockedInAt ? 'Clocked in for today' : 'Not clocked in'}
              </span>
            </div>

            <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between">
              <span className="text-[11px] text-[var(--muted)]">Dual-Metric Charts</span>
              <Button variant="ghost" size="xs" onClick={() => setShowCharts((prev) => !prev)}>
                {showCharts ? 'Hide Charts' : 'Show KPI & XP Graphs'}
              </Button>
            </div>

            {showCharts && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-3 border-t border-[var(--border)]">
                <WeeklyKpiTrendGraph data={displayKpiHistory} />
                <LifetimeXpStackedChart
                  lifetimeXp={effectiveLifetimeXp}
                  postedXp={xpSummary?.postedXp}
                  pendingXp={xpSummary?.pendingXp}
                  frozenXp={xpSummary?.frozenXp}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <HomePersonalizeModal
        isOpen={isPersonalizeOpen}
        onClose={() => setIsPersonalizeOpen(false)}
        prefs={prefs}
        onChangePrefs={updatePrefs}
        availableWidgets={allRoleWidgets}
        availablePages={availablePages}
        availableWorkspaces={availableWorkspaces}
      />

      {/* User-Facing Audit Log Modal */}
      {isAuditModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsAuditModalOpen(false)}
          title="User-Facing Immutable Audit Ledger"
        >
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
              <p className="font-semibold text-slate-800 dark:text-slate-200 mb-0.5">
                Cryptographically Linked Immutable Ledger
              </p>
              <p>
                Every KPI score recalculation, task XP payout, executive override, and inactivity
                penalty is permanently chained with SHA-256 integrity protection.
              </p>
            </div>

            <KpiXpAuditLedgerTable
              logs={kpiAuditLogs}
              canEdit={isCeo || isChro}
              onSaveAuditReason={handleSaveAuditReason}
            />

            <div className="flex justify-end pt-2">
              <Button variant="secondary" onClick={() => setIsAuditModalOpen(false)}>
                Close Ledger
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Governance Override Modal */}
      {isOverrideModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsOverrideModalOpen(false)}
          title={
            isCeo
              ? 'CEO Supreme Override (MFA)'
              : isChro
                ? 'CHRO Full Performance Governance (MFA)'
                : isCLevel
                  ? `${userRole.toUpperCase()} Authority Override (MFA)`
                  : 'PM Squad Performance Adjustment'
          }
        >
          <form onSubmit={handleSaveOverride} className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs">
              <div className="flex items-center gap-2 font-bold text-amber-600 dark:text-amber-400">
                <KeyRound className="h-4 w-4" />
                <span>Executive MFA Authorization Gate</span>
              </div>
              <p className="text-[var(--text)] opacity-90 mt-1">
                {isCeo
                  ? 'Exercising supreme executive authority across Pointfex. No written justification required. Strictly authorized with your 6-digit MFA code.'
                  : isChro
                    ? 'CHRO holds universal authority to adjust KPI/XP across all employees, verify weights, and modify audit logs.'
                    : 'Performance record adjustment authorized with your executive credentials and MFA.'}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-[var(--muted)] mb-1">
                Target Team Member
              </label>
              <select
                value={overrideTargetEmployeeId}
                onChange={(e) => setOverrideTargetEmployeeId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-sm font-medium text-[var(--text)] cursor-pointer"
                required
              >
                <option value="">Select team member...</option>
                {eligibleTargetEmployees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({emp.title || emp.id})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase text-[var(--muted)] mb-1">
                  Metric Type
                </label>
                <select
                  value={overrideMetricType}
                  onChange={(e) => setOverrideMetricType(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-sm font-medium text-[var(--text)]"
                >
                  <option value="KPI">Weekly KPI (0–100 Scale)</option>
                  <option value="XP">Lifetime Career XP</option>
                </select>
              </div>

              {overrideMetricType === 'KPI' ? (
                <div>
                  <label className="block text-xs font-semibold uppercase text-[var(--muted)] mb-1">
                    Week & Year
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={53}
                      value={overrideWeek}
                      onChange={(e) => setOverrideWeek(Number(e.target.value))}
                      className="w-20 px-2 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-sm font-medium text-[var(--text)] text-center font-mono"
                      title="Week Number"
                    />
                    <input
                      type="number"
                      min={2024}
                      max={2030}
                      value={overrideYear}
                      onChange={(e) => setOverrideYear(Number(e.target.value))}
                      className="w-24 px-2 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-sm font-medium text-[var(--text)] text-center font-mono"
                      title="Year"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold uppercase text-[var(--muted)] mb-1">
                    Delta XP (+/-)
                  </label>
                  <input
                    type="number"
                    value={overrideDeltaXp}
                    onChange={(e) =>
                      setOverrideDeltaXp(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-sm font-bold text-[var(--text)] font-mono"
                    placeholder="+/- Points"
                    required
                  />
                </div>
              )}
            </div>

            {overrideMetricType === 'KPI' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase text-[var(--muted)]">
                    Evaluated KPI Score (0–100)
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-rose-500 font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={overrideIsInactive}
                      onChange={(e) => setOverrideIsInactive(e.target.checked)}
                      className="rounded border-[var(--border)] text-rose-600 focus:ring-rose-500"
                    />
                    Mark as Inactive Week (N/A Flag)
                  </label>
                </div>
                {!overrideIsInactive && (
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={overrideScore}
                    onChange={(e) =>
                      setOverrideScore(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-base font-bold text-[var(--text)] font-mono"
                    required={!overrideIsInactive}
                  />
                )}
              </div>
            )}

            {/* 6-Digit MFA Input (No Written Reason Required) */}
            <div className="pt-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-1 flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5" />
                6-Digit Authenticator Code (MFA)
              </label>
              <div className="relative">
                <input
                  type="text"
                  maxLength={6}
                  placeholder="Enter 6-digit MFA code (e.g. 123456)"
                  value={overrideMfaCode}
                  onChange={(e) => setOverrideMfaCode(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-base font-mono font-bold tracking-widest text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-amber-500"
                  required={isCeo}
                  autoFocus
                />
              </div>
              <p className="text-[11px] text-[var(--muted)] mt-1">
                {isCeo
                  ? 'CEO override requires strictly and only a valid 6-digit MFA verification code.'
                  : 'Enter 6-digit MFA code to verify and authorize this modification.'}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-[var(--muted)] mb-1">
                Optional Note (No written reason required)
              </label>
              <input
                type="text"
                placeholder="Optional adjustment note..."
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--text)]"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              <Button
                variant="secondary"
                type="button"
                onClick={() => setIsOverrideModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                disabled={isSubmittingOverride}
                className={
                  isCeo ? 'bg-amber-600 hover:bg-amber-700 text-white border-amber-600' : ''
                }
              >
                {isSubmittingOverride
                  ? 'Authorizing...'
                  : isCeo
                    ? 'Authorize via MFA'
                    : 'Commit Override'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
