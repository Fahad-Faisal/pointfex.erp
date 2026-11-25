import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  Inbox,
  Mail,
  MailOpen,
  RefreshCw,
  Search,
  ShieldAlert,
  XCircle,
  Lock,
  Users,
  ThumbsUp,
  ThumbsDown,
  Award,
  Sparkles,
} from 'lucide-react'
import { erpApi } from '../../api/client'
import { useApp } from '../../context/AppContext'
import { usePermissions } from '../../hooks/usePermissions'
import {
  buildUnifiedInboxItems,
  filterUnifiedInboxItems,
  INBOX_TYPE_LABELS,
  loadReadInboxIds,
  saveReadInboxIds,
  type UnifiedInboxItem,
  type UnifiedInboxItemType,
} from '../../services/unified-inbox'
import { formatDate } from '../../utils/formatters'
import { PageHeader } from '../../components/common/PageHeader'
import { Card } from '../../components/common/Card'
import { Badge } from '../../components/common/Badge'
import { Button } from '../../components/common/Button'
import { EmptyState } from '../../components/common/EmptyState'
import { SkeletonCard } from '../../components/common/Skeleton'
import { Tabs } from '../../components/common/Tabs'
import { Modal } from '../../components/common/Modal'
import { MfaConfirmModal } from '../../components/common/MfaConfirmModal'
import { ApprovalInboxPage } from './ApprovalInboxPage'

export function UnifiedInboxPage() {
  const { currentUser, data, showToast, refreshPermissions, setRoute, markNotificationRead } =
    useApp()
  const { can, canAny } = usePermissions()

  const canAdminEngine =
    canAny(['approvals:manage', 'governance:manage_rules', 'approvals:admin']) ||
    currentUser?.role === 'system:root' ||
    Boolean((currentUser as any)?.roles?.includes?.('system:root'))

  const userRole = (currentUser?.role || '').toLowerCase()
  const isExecutive = ['ceo', 'cto', 'cpo', 'cfo', 'chro', 'system:root'].includes(userRole)

  const [tab, setTab] = useState<'queue' | 'executive' | 'workflows'>('queue')
  const [typeFilter, setTypeFilter] = useState<UnifiedInboxItemType | 'all'>('all')
  const [search, setSearch] = useState('')
  const [reasonDrafts, setReasonDrafts] = useState<Record<string, string>>({})
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [readIds, setReadIds] = useState<Set<string>>(() => loadReadInboxIds(currentUser?.id))
  const [focusedIndex, setFocusedIndex] = useState<number>(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isMutating, setIsMutating] = useState(false)

  // Executive KPI/XP Review State
  const [execScores, setExecScores] = useState<any[]>([])
  const [pmEvals, setPmEvals] = useState<any[]>([])
  const [consensusRequests, setConsensusRequests] = useState<any[]>([])
  const [adjustingItem, setAdjustingItem] = useState<{
    id: string
    type: 'score' | 'pm_eval'
    title: string
    currentScore: number
  } | null>(null)
  const [adjustmentScore, setAdjustmentScore] = useState<number>(85)
  const [adjustmentReason, setAdjustmentReason] = useState<string>('')
  const [votingConsensusItem, setVotingConsensusItem] = useState<{
    id: string
    title: string
    decision: 'APPROVE' | 'REJECT'
  } | null>(null)
  const [consensusVoteNotes, setConsensusVoteNotes] = useState<string>('')
  const [peerSynergyTarget, setPeerSynergyTarget] = useState<string>('')
  const [peerSynergyScore, setPeerSynergyScore] = useState<number>(4)
  const [peerSynergyNotes, setPeerSynergyNotes] = useState<string>('')

  const [approvals, setApprovals] = useState<any[]>([])
  const [accessRequests, setAccessRequests] = useState<any[]>([])
  const [emailRequests, setEmailRequests] = useState<any[]>([])
  const [myReceivedDelegations, setMyReceivedDelegations] = useState<any[]>([])
  const [pendingDelegations, setPendingDelegations] = useState<any[]>([])
  const [budgetRequests, setBudgetRequests] = useState<any[]>([])
  const [activeMfaItem, setActiveMfaItem] = useState<{
    item: UnifiedInboxItem
    decision: 'approve' | 'reject'
  } | null>(null)

  const canApproveTasks = canAny(['tasks:approve', 'tasks:reject'])
  const canApproveBudgets = canAny(['budgets:approve_request', 'budgets:reject_request', 'budgets:read_requests'])
  const canApproveAccess = canAny(['users:assign_role', 'governance:approve_request', 'roles:update'])
  const canApproveEmailRequests = can('login_allowlist:manage')
  const canApproveDelegations = can('delegations:approve')
  const canTriageReports = canAny(['reports:triage', 'reports:read_standard'])

  const fetchSources = useCallback(async () => {
    const [approvalsRes, accessRes, emailReqRes, myDelRes, allDelRes, budgetsRes] = await Promise.all([
      erpApi.getApprovalInbox().catch(() => []),
      canApproveAccess
        ? erpApi.listAccessRequests({ status: 'PENDING' }).catch(() => [])
        : Promise.resolve([]),
      canApproveEmailRequests ? erpApi.listAllowlistEmailRequests().catch(() => []) : Promise.resolve([]),
      erpApi.listMyDelegations().catch(() => ({ created: [], received: [] })),
      canApproveDelegations ? erpApi.listAllDelegations().catch(() => []) : Promise.resolve([]),
      canApproveBudgets ? erpApi.getBudgetRequests().catch(() => []) : Promise.resolve([]),
    ])

    return {
      approvals: Array.isArray(approvalsRes) ? approvalsRes : [],
      accessRequests: Array.isArray(accessRes) ? accessRes : [],
      emailRequests: Array.isArray(emailReqRes) ? emailReqRes : [],
      receivedDelegations: Array.isArray(myDelRes?.received) ? myDelRes.received : [],
      allDelegations: Array.isArray(allDelRes) ? allDelRes : [],
      budgets: Array.isArray(budgetsRes) ? budgetsRes : [],
    }
  }, [canApproveAccess, canApproveEmailRequests, canApproveDelegations, canApproveBudgets])

  const fetchExecutiveSources = useCallback(async () => {
    if (!isExecutive) return
    try {
      const [scores, evals, queue] = await Promise.all([
        erpApi.getExecScoresInbox().catch(() => []),
        erpApi.getPmEvaluationsInbox().catch(() => []),
        erpApi.getChroWeightQueue().catch(() => []),
      ])

      setExecScores(Array.isArray(scores) ? scores : [])
      setPmEvals(Array.isArray(evals) ? evals : [])
      setConsensusRequests(
        Array.isArray(queue)
          ? queue.filter(
              (q: any) =>
                q.isMassiveXp ||
                q.massiveXpFrozen ||
                q.status === 'PENDING_CONSENSUS' ||
                (q.consensusVotes && q.consensusVotes.length > 0),
            )
          : [],
      )
    } catch {
      // ignore
    }
  }, [isExecutive])

  const reloadInbox = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetchSources()
      setApprovals(res.approvals)
      setAccessRequests(res.accessRequests)
      setEmailRequests(res.emailRequests)
      setMyReceivedDelegations(res.receivedDelegations)
      setPendingDelegations(res.allDelegations)
      setBudgetRequests(res.budgets)
      await fetchExecutiveSources()
    } finally {
      setIsLoading(false)
    }
  }, [fetchSources, fetchExecutiveSources])

  useEffect(() => {
    let cancelled = false
    fetchSources()
      .then((res) => {
        if (cancelled) return
        setApprovals(res.approvals)
        setAccessRequests(res.accessRequests)
        setEmailRequests(res.emailRequests)
        setMyReceivedDelegations(res.receivedDelegations)
        setPendingDelegations(res.allDelegations)
        setBudgetRequests(res.budgets)
        void fetchExecutiveSources()
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [fetchSources, fetchExecutiveSources])

  const handleConfirmExecScore = async (id: string) => {
    try {
      await erpApi.confirmExecScore(id)
      showToast('Executive score confirmed and recorded.', 'success')
      void fetchExecutiveSources()
    } catch (err: any) {
      showToast(err.message || 'Failed to confirm score', 'error')
    }
  }

  const handleConfirmPmEval = async (id: string) => {
    try {
      await erpApi.confirmPmEvaluation(id)
      showToast('PM weekly evaluation confirmed.', 'success')
      void fetchExecutiveSources()
    } catch (err: any) {
      showToast(err.message || 'Failed to confirm evaluation', 'error')
    }
  }

  const handleAdjustScore = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!adjustingItem || !adjustmentReason.trim()) {
      showToast('Adjustment justification is required.', 'error')
      return
    }

    try {
      if (adjustingItem.type === 'score') {
        await erpApi.adjustExecScore(adjustingItem.id, {
          score: Number(adjustmentScore),
          reason: adjustmentReason.trim(),
        })
        showToast('Executive score adjusted with reason.', 'success')
      } else {
        await erpApi.adjustPmEvaluation(adjustingItem.id, {
          score: Number(adjustmentScore),
          reason: adjustmentReason.trim(),
        })
        showToast('PM evaluation adjusted with reason.', 'success')
      }
      setAdjustingItem(null)
      setAdjustmentReason('')
      void fetchExecutiveSources()
    } catch (err: any) {
      showToast(err.message || 'Failed to adjust score', 'error')
    }
  }

  const handleConsensusVote = async (mfaCode: string) => {
    if (!votingConsensusItem) return
    try {
      await erpApi.castConsensusVote(
        votingConsensusItem.id,
        {
          decision: votingConsensusItem.decision,
          notes: consensusVoteNotes.trim() || undefined,
        },
        mfaCode ? { 'x-mfa-code': mfaCode } : undefined,
      )
      showToast(`Consensus vote (${votingConsensusItem.decision.toLowerCase()}) recorded successfully.`, 'success')
      setVotingConsensusItem(null)
      setConsensusVoteNotes('')
      void fetchExecutiveSources()
    } catch (err: any) {
      showToast(err.message || 'Failed to cast consensus vote', 'error')
    }
  }

  const handleRecordPeerSynergy = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!peerSynergyTarget || !peerSynergyNotes.trim()) {
      showToast('Select peer executive and provide collaboration notes.', 'error')
      return
    }

    try {
      await erpApi.recordCLevelPeerEval({
        targetExecutiveId: peerSynergyTarget,
        score: Number(peerSynergyScore),
        notes: peerSynergyNotes.trim(),
      })
      showToast('Peer synergy evaluation recorded for weekly roll-up.', 'success')
      setPeerSynergyTarget('')
      setPeerSynergyNotes('')
    } catch (err: any) {
      showToast(err.message || 'Failed to record peer synergy', 'error')
    }
  }

  const allItems = useMemo(
    () =>
      buildUnifiedInboxItems({
        approvals,
        accessRequests,
        emailRequests,
        myReceivedDelegations,
        pendingDelegations,
        budgetRequests,
        tasks: data.tasks,
        reports: data.reports,
        notifications: data.notifications,
        canApproveTasks,
        canApproveBudgets,
        canApproveAccess,
        canApproveEmailRequests,
        canApproveDelegations,
        canTriageReports,
      }),
    [
      approvals,
      accessRequests,
      emailRequests,
      myReceivedDelegations,
      pendingDelegations,
      budgetRequests,
      data.tasks,
      data.reports,
      data.notifications,
      canApproveTasks,
      canApproveBudgets,
      canApproveAccess,
      canApproveEmailRequests,
      canApproveDelegations,
      canTriageReports,
    ],
  )

  const filteredItems = useMemo(
    () => filterUnifiedInboxItems(allItems, typeFilter, search),
    [allItems, typeFilter, search],
  )

  const countsByType = useMemo(() => {
    const counts: Partial<Record<UnifiedInboxItemType | 'all', number>> = { all: allItems.length }
    for (const item of allItems) {
      counts[item.type] = (counts[item.type] ?? 0) + 1
    }
    return counts
  }, [allItems])

  const markReadState = useCallback(
    (ids: string[], isRead: boolean) => {
      setReadIds((prev) => {
        const next = new Set(prev)
        for (const id of ids) {
          if (isRead) next.add(id)
          else next.delete(id)
        }
        saveReadInboxIds(currentUser?.id, next)
        return next
      })
      for (const id of ids) {
        if (id.startsWith('mention:') && isRead) {
          markNotificationRead(id.replace('mention:', ''))
        }
      }
    },
    [currentUser?.id, markNotificationRead],
  )

  const openMfaDecision = useCallback(
    (item: UnifiedInboxItem, decision: 'approve' | 'reject') => {
      setActiveMfaItem({ item, decision })
    },
    [],
  )

  const handleMfaDecision = useCallback(
    async (
      item: UnifiedInboxItem,
      decision: 'approve' | 'reject',
      mfaCode: string,
      reason?: string,
    ) => {
      setIsMutating(true)
      const effectiveReason =
        reason?.trim() ||
        (decision === 'approve' ? 'Approved via Unified Inbox' : 'Rejected via Unified Inbox')

      try {
        if (item.type === 'approval') {
          if (decision === 'approve') {
            await erpApi.approveWorkflowStep(item.sourceId, effectiveReason, mfaCode)
          } else {
            await erpApi.rejectWorkflowStep(item.sourceId, effectiveReason, mfaCode)
          }
        } else if (item.type === 'access_request') {
          if (decision === 'approve') {
            await erpApi.approveAccessRequest(item.sourceId, {
              reason: effectiveReason,
              mfaCode,
            })
          } else {
            await erpApi.rejectAccessRequest(item.sourceId, {
              reason: effectiveReason,
              mfaCode,
            })
          }
        } else if (item.type === 'email_request') {
          if (decision === 'approve') {
            await erpApi.approveAllowlistEmailRequest(item.sourceId, mfaCode, effectiveReason)
          } else {
            await erpApi.rejectAllowlistEmailRequest(item.sourceId, mfaCode, effectiveReason)
          }
        } else if (item.type === 'budget_request') {
          if (decision === 'approve') {
            await erpApi.approveBudgetRequest(
              item.sourceId,
              {
                approvedAmount: item.amountBDT ?? 0,
                feedback: effectiveReason,
              },
              mfaCode,
            )
          } else {
            await erpApi.rejectBudgetRequest(item.sourceId, effectiveReason, mfaCode)
          }
        } else if (item.type === 'delegation' && item.id.startsWith('delegation_approve:')) {
          if (decision === 'approve') {
            await erpApi.approveDelegation(item.sourceId)
          } else {
            await erpApi.revokeDelegation(item.sourceId, effectiveReason)
          }
        } else if (item.type === 'task_review') {
          if (decision === 'approve') {
            await erpApi.approveTask(item.sourceId, { feedback: effectiveReason })
          } else {
            await erpApi.rejectTask(item.sourceId, effectiveReason)
          }
        }

        // Immediately animate out from local state
        setApprovals((prev) => prev.filter((a) => a.id !== item.sourceId))
        setAccessRequests((prev) => prev.filter((r) => r.id !== item.sourceId))
        setEmailRequests((prev) => prev.filter((e) => e.id !== item.sourceId))
        setBudgetRequests((prev) => prev.filter((b) => b.id !== item.sourceId))
        markReadState([item.id], true)
        setActiveMfaItem(null)

        showToast(
          `${decision === 'approve' ? 'Approved' : 'Rejected'}: ${item.title}`,
          decision === 'approve' ? 'success' : 'info',
        )

        void reloadInbox()
        void refreshPermissions()
      } finally {
        setIsMutating(false)
      }
    },
    [markReadState, reloadInbox, refreshPermissions, showToast],
  )

  // Keyboard shortcuts: j/k move, a approve, r reject, Enter open/expand
  useEffect(() => {
    if (tab !== 'queue') return
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (filteredItems.length === 0) return

      const clampedIndex = Math.min(focusedIndex, filteredItems.length - 1)
      const currentItem = filteredItems[clampedIndex]

      if (e.key === 'j') {
        e.preventDefault()
        setFocusedIndex((prev) => Math.min(filteredItems.length - 1, prev + 1))
      } else if (e.key === 'k') {
        e.preventDefault()
        setFocusedIndex((prev) => Math.max(0, prev - 1))
      } else if (e.key === 'a' && currentItem?.canApprove) {
        e.preventDefault()
        openMfaDecision(currentItem, 'approve')
      } else if (e.key === 'r' && currentItem?.canReject) {
        e.preventDefault()
        openMfaDecision(currentItem, 'reject')
      } else if (e.key === 'Enter' && currentItem) {
        e.preventDefault()
        markReadState([currentItem.id], true)
        setExpandedId((prev) => (prev === currentItem.id ? null : currentItem.id))
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [tab, filteredItems, focusedIndex, openMfaDecision, markReadState])

  const selectedItems = useMemo(
    () => filteredItems.filter((i) => selectedIds.has(i.id)),
    [filteredItems, selectedIds],
  )

  const hasSensitiveSelected = useMemo(
    () =>
      selectedItems.some(
        (i) =>
          i.type === 'access_request' ||
          i.type === 'approval' ||
          i.type === 'email_request' ||
          i.type === 'budget_request',
      ),
    [selectedItems],
  )

  const executeBulkDecisionForNonSensitive = useCallback(
    async (items: UnifiedInboxItem[], decision: 'approve' | 'reject') => {
      const nonSensitive = items.filter(
        (i) =>
          i.type !== 'access_request' &&
          i.type !== 'approval' &&
          i.type !== 'email_request' &&
          i.type !== 'budget_request',
      )
      if (nonSensitive.length === 0) return
      setIsMutating(true)
      let okCount = 0
      try {
        for (const item of nonSensitive) {
          const reason =
            reasonDrafts[item.id]?.trim() ||
            (decision === 'approve' ? 'Approved via Unified Inbox' : 'Rejected via Unified Inbox')
          if (item.type === 'task_review') {
            if (decision === 'approve') await erpApi.approveTask(item.sourceId, { feedback: reason })
            else await erpApi.rejectTask(item.sourceId, reason)
          }
          okCount++
        }
        markReadState(
          nonSensitive.map((i) => i.id),
          true,
        )
        setSelectedIds(new Set())
        showToast(
          `${decision === 'approve' ? 'Approved' : 'Rejected'} ${okCount} task item${okCount === 1 ? '' : 's'}.`,
          decision === 'approve' ? 'success' : 'info',
        )
        await reloadInbox()
      } catch (err: any) {
        showToast(err?.message || 'Bulk action failed', 'error')
      } finally {
        setIsMutating(false)
      }
    },
    [reasonDrafts, markReadState, showToast, reloadInbox],
  )

  const filterTypes: Array<UnifiedInboxItemType | 'all'> = [
    'all',
    'approval',
    'task_review',
    'access_request',
    ...(canApproveEmailRequests ? (['email_request'] as const) : []),
    'delegation',
    'budget_request',
    'mention',
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Needs My Action"
        subtitle="Everything waiting on your decision or review across approvals, tasks, delegations, and mentions."
        action={
          <Button variant="secondary" size="sm" onClick={() => void reloadInbox()} disabled={isLoading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        }
      />

      {(canAdminEngine || isExecutive) && (
        <Tabs
          tabs={[
            { id: 'queue', label: 'Action Queue', count: allItems.length },
            ...(isExecutive
              ? [
                  {
                    id: 'executive',
                    label: 'Executive Reviews & Consensus',
                    count: execScores.length + pmEvals.length + consensusRequests.length,
                  },
                ]
              : []),
            ...(canAdminEngine ? [{ id: 'workflows', label: 'Approval Engine Admin' }] : []),
          ]}
          activeId={tab}
          onChange={(id) => setTab(id as any)}
        />
      )}

      {tab === 'workflows' && canAdminEngine ? (
        <ApprovalInboxPage />
      ) : tab === 'executive' && isExecutive ? (
        <div className="space-y-6">
          {/* Executive Read-Receipt Review Cards */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-[var(--text)] flex items-center gap-2">
                  <Award className="w-4 h-4 text-indigo-500" />
                  Deliverable Read-Receipt Scoring ({execScores.length})
                </h3>
                <p className="text-xs text-[var(--muted)]">
                  C-Suite provisional score confirmation. One-click confirm or adjust with justification.
                </p>
              </div>
            </div>

            {execScores.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="All Executive Score Reviews Complete"
                description="No pending deliverable read-receipts awaiting your confirmation."
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {execScores.map((scoreItem) => (
                  <Card key={scoreItem.id} className="p-4 space-y-3 border-[var(--border)]">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-600 uppercase font-mono">
                          {scoreItem.execRole} Score
                        </span>
                        <h4 className="text-sm font-bold text-[var(--text)] mt-1 line-clamp-1">
                          {scoreItem.task?.title || 'Deliverable'}
                        </h4>
                        <div className="text-xs text-[var(--muted)] mt-0.5">
                          Assignee: {scoreItem.task?.assignee?.name || 'Developer'} • Project:{' '}
                          {scoreItem.task?.project?.name || 'General'}
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-[11px] text-[var(--muted)] block">Score</span>
                        <span className="text-lg font-bold text-[var(--text)] font-mono">
                          {Number(scoreItem.score)} / 100
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-[var(--border)]">
                      <Button
                        variant="primary"
                        size="xs"
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => void handleConfirmExecScore(scoreItem.id)}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                        Confirm (a)
                      </Button>
                      <Button
                        variant="secondary"
                        size="xs"
                        onClick={() => {
                          setAdjustingItem({
                            id: scoreItem.id,
                            type: 'score',
                            title: scoreItem.task?.title || 'Deliverable',
                            currentScore: Number(scoreItem.score),
                          })
                          setAdjustmentScore(Number(scoreItem.score))
                        }}
                      >
                        Adjust Score
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* PM Weekly Evaluation Reviews */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-[var(--text)] flex items-center gap-2">
              <Users className="w-4 h-4 text-sky-500" />
              PM Weekly Evaluation Reviews ({pmEvals.length})
            </h3>

            {pmEvals.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="PM Weekly Evaluations Clear"
                description="No weekly PM evaluations require executive read-receipt confirmation."
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pmEvals.map((evalItem) => (
                  <Card key={evalItem.id} className="p-4 space-y-3 border-[var(--border)]">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <Badge variant="info">Week {evalItem.weekNumber}</Badge>
                        <h4 className="text-sm font-bold text-[var(--text)] mt-1">
                          {evalItem.employee?.name || 'Project Manager'}
                        </h4>
                        <div className="text-xs text-[var(--muted)] mt-0.5">
                          Weekly Roll-Up Evaluation • Score: {Number(evalItem.score)}
                        </div>
                      </div>

                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-600">
                        {evalItem.status || 'UNREAD'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-[var(--border)]">
                      <Button
                        variant="primary"
                        size="xs"
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => void handleConfirmPmEval(evalItem.id)}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                        Confirm Review
                      </Button>
                      <Button
                        variant="secondary"
                        size="xs"
                        onClick={() => {
                          setAdjustingItem({
                            id: evalItem.id,
                            type: 'pm_eval',
                            title: evalItem.employee?.name || 'PM Evaluation',
                            currentScore: Number(evalItem.score),
                          })
                          setAdjustmentScore(Number(evalItem.score))
                        }}
                      >
                        Adjust
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Frozen-XP Consensus Voting Cards */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-[var(--text)] flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-500" />
              Massive XP Consensus Voting Queue ({consensusRequests.length})
            </h3>

            {consensusRequests.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="Consensus Voting Queue Clear"
                description="No massive XP deliverables are currently locked awaiting 4-Executive consensus."
              />
            ) : (
              <div className="space-y-3">
                {consensusRequests.map((item) => {
                  const weight = Number(item.approvedWeight || item.proposedWeight || 1)
                  const xpAmount = weight * 10
                  const approvalsCount =
                    item.consensusVotes?.filter((v: any) => v.decision === 'APPROVE').length || 0

                  return (
                    <Card key={item.id} className="p-4 border-amber-500/30 bg-amber-500/5 space-y-3">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-600 dark:text-amber-400">
                              FROZEN ({xpAmount} XP)
                            </span>
                            <span className="text-xs text-[var(--muted)]">
                              Assignee: {item.task?.assignee?.name || 'Developer'}
                            </span>
                          </div>
                          <h4 className="text-base font-bold text-[var(--text)] mt-1">
                            {item.task?.title || item.milestone?.title || 'Deliverable'}
                          </h4>
                          <p className="text-xs text-[var(--muted)] mt-0.5">
                            Exceeds massive XP threshold (200 XP). Strictly requires consensus approval from CTO, CPO, CFO, CHRO.
                          </p>
                        </div>

                        {/* Live Quorum Tally */}
                        <div className="p-2.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-center min-w-[140px]">
                          <span className="text-[10px] text-[var(--muted)] block font-semibold uppercase">
                            Quorum Tally
                          </span>
                          <span className="text-base font-bold text-indigo-600 dark:text-indigo-400 font-mono">
                            {approvalsCount} of 4 Approved
                          </span>
                          <span className="text-[10px] text-[var(--muted)] block">
                            {Math.max(0, 3 - approvalsCount)} more needed
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
                        <Button
                          variant="secondary"
                          size="xs"
                          className="text-rose-600 border-rose-300 hover:bg-rose-50"
                          onClick={() => {
                            setVotingConsensusItem({
                              id: item.id,
                              title: item.task?.title || 'Deliverable',
                              decision: 'REJECT',
                            })
                          }}
                        >
                          <ThumbsDown className="w-3.5 h-3.5 mr-1" />
                          Reject Release (MFA)
                        </Button>
                        <Button
                          variant="primary"
                          size="xs"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white"
                          onClick={() => {
                            setVotingConsensusItem({
                              id: item.id,
                              title: item.task?.title || 'Deliverable',
                              decision: 'APPROVE',
                            })
                          }}
                        >
                          <ThumbsUp className="w-3.5 h-3.5 mr-1" />
                          Approve Release (MFA)
                        </Button>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>

          {/* Peer Synergy Scoring Form */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
              <div>
                <h3 className="text-sm font-bold text-[var(--text)] flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-500" />
                  C-Level Peer Synergy Scoring
                </h3>
                <p className="text-xs text-[var(--muted)]">
                  Weekly cross-functional executive collaboration review (1–5 scale). Feeds the 10% peer component.
                </p>
              </div>
            </div>

            <form onSubmit={handleRecordPeerSynergy} className="space-y-3 text-xs max-w-xl">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-[var(--muted)] mb-1">
                    Peer Executive <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={peerSynergyTarget}
                    onChange={(e) => setPeerSynergyTarget(e.target.value)}
                    className="w-full p-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-xs text-[var(--text)] cursor-pointer"
                  >
                    <option value="">Select Peer...</option>
                    {data.users
                      .filter(
                        (u) =>
                          ['cto', 'cpo', 'cfo', 'chro'].includes((u.role || '').toLowerCase()) &&
                          u.id !== currentUser?.id,
                      )
                      .map((exec) => (
                        <option key={exec.id} value={exec.id}>
                          {exec.name} ({exec.title || exec.role.toUpperCase()})
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-[var(--muted)] mb-1">
                    Synergy Rating (1–5)
                  </label>
                  <select
                    value={peerSynergyScore}
                    onChange={(e) => setPeerSynergyScore(Number(e.target.value))}
                    className="w-full p-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-xs text-[var(--text)] cursor-pointer"
                  >
                    <option value="1">1 - Severe Friction</option>
                    <option value="2">2 - Below Expectation</option>
                    <option value="3">3 - Standard Alignment</option>
                    <option value="4">4 - High Synergy</option>
                    <option value="5">5 - Exceptional Leadership</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[var(--muted)] mb-1">
                  Collaboration Notes &amp; Constructive Feedback <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder="Notes on strategic alignment, communication speed, or cross-squad block removal..."
                  value={peerSynergyNotes}
                  onChange={(e) => setPeerSynergyNotes(e.target.value)}
                  className="w-full p-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-xs text-[var(--text)] resize-none"
                />
              </div>

              <div className="pt-1">
                <Button type="submit" variant="primary" size="sm">
                  Record Peer Synergy Score
                </Button>
              </div>
            </form>
          </Card>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Search + Filter Chips */}
          <Card>
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-[var(--muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Filter inbox items..."
                    aria-label="Filter inbox items"
                    className="w-full pl-9 pr-3 py-2 text-[13px] rounded-[var(--radius-control)] bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  />
                </div>
                <div className="text-[12px] text-[var(--muted)] hidden md:flex items-center gap-2">
                  <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg)] border border-[var(--border)] font-mono">j/k</kbd>
                  <span>move</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg)] border border-[var(--border)] font-mono">a</kbd>
                  <span>approve</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg)] border border-[var(--border)] font-mono">r</kbd>
                  <span>reject</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg)] border border-[var(--border)] font-mono">Enter</kbd>
                  <span>open</span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                {filterTypes.map((ft) => {
                  const count = countsByType[ft] ?? 0
                  if (ft !== 'all' && count === 0) return null
                  const active = typeFilter === ft
                  return (
                    <button
                      key={ft}
                      type="button"
                      onClick={() => {
                        setTypeFilter(ft)
                        setFocusedIndex(0)
                      }}
                      className={`px-3 py-1.5 rounded-full text-[12px] font-medium cursor-pointer transition-colors ${
                        active
                          ? 'bg-[var(--primary)] text-white'
                          : 'bg-[var(--bg)] border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]'
                      }`}
                    >
                      {INBOX_TYPE_LABELS[ft]} ({count})
                    </button>
                  )
                })}
              </div>

              {selectedItems.length > 0 && (
                <div className="pt-2 border-t border-[var(--border)] space-y-2">
                  {hasSensitiveSelected && (
                    <div className="text-[12px] text-[var(--warning)] bg-[var(--warning)]/10 border border-[var(--warning)]/30 rounded-[var(--radius-control)] p-2.5 flex items-start gap-2">
                      <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>
                        Sensitive items (access, budget, approvals, email allowlist) require individual 6-digit MFA confirmation and cannot be approved in bulk. Please handle them individually.
                      </span>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[13px] font-medium text-[var(--text)]">
                      {selectedItems.length} selected
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          markReadState(
                            selectedItems.map((i) => i.id),
                            true,
                          )
                        }
                      >
                        Mark Read
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={
                          isMutating ||
                          hasSensitiveSelected ||
                          !selectedItems.some((i) => i.canReject)
                        }
                        onClick={() =>
                          void executeBulkDecisionForNonSensitive(selectedItems, 'reject')
                        }
                      >
                        Bulk Reject
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={
                          isMutating ||
                          hasSensitiveSelected ||
                          !selectedItems.some((i) => i.canApprove)
                        }
                        onClick={() =>
                          void executeBulkDecisionForNonSensitive(selectedItems, 'approve')
                        }
                      >
                        Bulk Approve
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {isLoading ? (
            <div className="space-y-3">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : filteredItems.length === 0 ? (
            <Card>
              <EmptyState
                icon={Inbox}
                title="All caught up"
                description="Nothing is waiting for your approval or review right now."
              />
            </Card>
          ) : (
            <div className="space-y-2.5">
              {filteredItems.map((item, idx) => {
                const isFocused = idx === Math.min(focusedIndex, filteredItems.length - 1)
                const isRead = readIds.has(item.id)
                const isSelected = selectedIds.has(item.id)
                const isExpanded = expandedId === item.id

                return (
                  <div
                    key={item.id}
                    onClick={() => setFocusedIndex(idx)}
                    className={`rounded-[var(--radius-card)] border bg-[var(--surface)] p-4 transition-colors ${
                      isFocused
                        ? 'border-[var(--primary)] ring-1 ring-[var(--primary)]/30'
                        : 'border-[var(--border)]'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        aria-label={`Select ${item.title}`}
                        onChange={(e) => {
                          setSelectedIds((prev) => {
                            const next = new Set(prev)
                            if (e.target.checked) next.add(item.id)
                            else next.delete(item.id)
                            return next
                          })
                        }}
                        className="mt-1 cursor-pointer"
                      />

                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {!isRead && (
                                <span
                                  className="w-2 h-2 rounded-full bg-[var(--primary)] shrink-0"
                                  title="Unread"
                                />
                              )}
                              <span
                                className={`text-[14px] ${
                                  isRead ? 'font-medium text-[var(--muted)]' : 'font-semibold text-[var(--text)]'
                                }`}
                              >
                                {item.title}
                              </span>
                              <Badge variant="default" size="xs">
                                {INBOX_TYPE_LABELS[item.type]}
                              </Badge>
                              {item.isCritical && (
                                <Badge variant="warning" size="xs">
                                  <ShieldAlert className="w-3 h-3 inline mr-1" />
                                  Critical
                                </Badge>
                              )}
                            </div>
                            <p className="text-[13px] text-[var(--muted)] mt-0.5">{item.subtitle}</p>
                            <p className="text-[12px] text-[var(--muted)] mt-0.5">
                              {item.requesterName ? `${item.requesterName} • ` : ''}
                              {formatDate(item.createdAt, 'short')}
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => markReadState([item.id], !isRead)}
                              className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-[var(--radius-control)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-muted)] cursor-pointer"
                              title={isRead ? 'Mark unread' : 'Mark read'}
                              aria-label={isRead ? 'Mark unread' : 'Mark read'}
                            >
                              {isRead ? <Mail className="w-4 h-4" /> : <MailOpen className="w-4 h-4" />}
                            </button>

                            {item.routeHint && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  markReadState([item.id], true)
                                  setRoute(item.routeHint!)
                                }}
                              >
                                Open
                              </Button>
                            )}
                          </div>
                        </div>

                        {(item.canApprove || item.canReject || isExpanded) && (
                          <div className="pt-2 border-t border-[var(--border)] flex flex-col sm:flex-row sm:items-center gap-2">
                            {(item.canApprove || item.canReject) && (
                              <input
                                type="text"
                                value={reasonDrafts[item.id] || ''}
                                onChange={(e) =>
                                  setReasonDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                                }
                                placeholder="Optional note or rejection reason..."
                                className="flex-1 px-3 py-1.5 text-[13px] rounded-[var(--radius-control)] bg-[var(--bg)] border border-[var(--border)] text-[var(--text)]"
                              />
                            )}
                            <div className="flex items-center gap-2 justify-end">
                              {item.canReject && (
                                <Button
                                  size="sm"
                                  variant="danger"
                                  disabled={isMutating}
                                  onClick={() => openMfaDecision(item, 'reject')}
                                >
                                  <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
                                </Button>
                              )}
                              {item.canApprove && (
                                <Button
                                  size="sm"
                                  variant="primary"
                                  disabled={isMutating}
                                  onClick={() => openMfaDecision(item, 'approve')}
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve
                                </Button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {activeMfaItem && (
        <MfaConfirmModal
          isOpen={!!activeMfaItem}
          onClose={() => setActiveMfaItem(null)}
          onConfirm={async ({ mfaCode, reason }) => {
            await handleMfaDecision(activeMfaItem.item, activeMfaItem.decision, mfaCode, reason)
          }}
          isSubmitting={isMutating}
          isCritical={activeMfaItem.item.isCritical || activeMfaItem.decision === 'reject'}
          title={`${activeMfaItem.decision === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}: ${activeMfaItem.item.title}`}
          actionSummary={`${activeMfaItem.decision === 'approve' ? 'Approving' : 'Rejecting'} ${activeMfaItem.item.title}. This action takes effect immediately and writes an immutable audit event.`}
          whoAffected={activeMfaItem.item.subtitle || activeMfaItem.item.requesterName}
          requiresReason={true}
          initialReason={reasonDrafts[activeMfaItem.item.id] || ''}
          confirmLabel={activeMfaItem.decision === 'approve' ? 'Approve & Apply' : 'Confirm Rejection'}
        />
      )}

      {/* Adjust Score Modal */}
      {adjustingItem && (
        <Modal
          isOpen={!!adjustingItem}
          onClose={() => setAdjustingItem(null)}
          title={`Adjust Score: ${adjustingItem.title}`}
          subtitle="Modifying the score requires mandatory justification notes which are logged to the immutable audit trail."
          maxWidth="max-w-md"
        >
          <div className="space-y-4 py-2">
            <div>
              <label className="block text-xs font-semibold text-[var(--text)] mb-1">
                New Score (0–100)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={adjustmentScore}
                onChange={(e) => setAdjustmentScore(Math.min(100, Math.max(0, Number(e.target.value))))}
                className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] font-mono font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--text)] mb-1">
                Reason for Adjustment <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                required
                value={adjustmentReason}
                onChange={(e) => setAdjustmentReason(e.target.value)}
                placeholder="Detailed rationale for diverging from the proposed score..."
                className="w-full px-3 py-2 text-xs rounded-lg bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] resize-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
              <Button variant="secondary" size="sm" onClick={() => setAdjustingItem(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={!adjustmentReason.trim()}
                onClick={handleAdjustScore}
              >
                Save Adjustment
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Consensus Voting MFA Modal */}
      {votingConsensusItem && (
        <MfaConfirmModal
          isOpen={!!votingConsensusItem}
          onClose={() => setVotingConsensusItem(null)}
          onConfirm={async ({ mfaCode, reason }) => {
            if (reason) setConsensusVoteNotes(reason)
            await handleConsensusVote(mfaCode)
          }}
          isSubmitting={isMutating}
          isCritical={true}
          title={`Consensus Vote: ${votingConsensusItem.decision} (${votingConsensusItem.title})`}
          actionSummary={`Casting your 1-of-4 C-Suite executive consensus vote (${votingConsensusItem.decision}) for deliverable "${votingConsensusItem.title}". Requires fresh MFA verification.`}
          whoAffected="Deliverable Owner & C-Suite Quorum"
          requiresReason={votingConsensusItem.decision === 'REJECT'}
          initialReason={consensusVoteNotes}
          confirmLabel={`Cast ${votingConsensusItem.decision} Vote`}
        />
      )}
    </div>
  )
}
