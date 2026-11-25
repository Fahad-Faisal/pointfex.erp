import React, { useState, useMemo } from 'react'
import {
  Crown,
  Search,
  Check,
  X,
  AlertTriangle,
} from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { Badge } from '../../components/common/Badge'
import { Button } from '../../components/common/Button'
import { Modal } from '../../components/common/Modal'
import { Avatar } from '../../components/common/Avatar'
import type { Task } from '../../types'

export function ApprovalsTaskControlPage() {
  const { data, currentUser, currentRole, approveTask, rejectTask, showToast } = useApp()

  const role = (currentUser?.role || currentRole || '').toLowerCase()
  const activeRoles = currentUser?.activeRoleSlugs || []
  const title = (currentUser?.title || '').toLowerCase()

  const isCeo =
    role === 'ceo' || activeRoles.includes('ceo') || title.includes('chief executive officer')
  const isCLevel =
    ['cto', 'cfo', 'chro', 'cpo', 'coo', 'cmo', 'cro'].includes(role) ||
    activeRoles.some((r) => ['cto', 'cfo', 'chro', 'cpo', 'coo', 'cmo', 'cro'].includes(r.toLowerCase())) ||
    title.includes('chief')
  const isSquadPm =
    role === 'pm' ||
    activeRoles.includes('pm') ||
    data.teams.some((t) => t.pmId === currentUser?.id)

  // PM Squad Scoping: Find squad IDs that current PM manages
  const pmManagedSquadIds = useMemo(() => {
    if (!currentUser) return []
    return data.teams.filter((t) => t.pmId === currentUser.id).map((t) => t.id)
  }, [data.teams, currentUser])

  const pmManagedProjectIds = useMemo(() => {
    return data.projects
      .filter((p) => pmManagedSquadIds.includes(p.teamId || ''))
      .map((p) => p.id)
  }, [data.projects, pmManagedSquadIds])

  // Scope tasks according to role authority:
  // - CEO & C-Level: See all tasks across organization
  // - PM: STRICTLY ISOLATED to tasks in their squad(s)
  // - Developer: Their own assigned/created tasks
  const visibleTasks = useMemo(() => {
    if (!currentUser) return []

    if (isCeo || isCLevel) {
      return data.tasks
    }

    if (isSquadPm) {
      return data.tasks.filter((t) => {
        const isCreatedByPm = t.creatorId === currentUser.id
        const isInManagedProject = pmManagedProjectIds.includes(t.projectId)
        const teamOfProject = data.teams.find((tm) => tm.projectIds?.includes(t.projectId))
        const isManagedTeam = teamOfProject ? pmManagedSquadIds.includes(teamOfProject.id) : false
        return isCreatedByPm || isInManagedProject || isManagedTeam
      })
    }

    // Developer / regular staff: See own tasks
    return data.tasks.filter((t) => t.assigneeId === currentUser.id || t.creatorId === currentUser.id)
  }, [currentUser, isCeo, isCLevel, isSquadPm, data.tasks, pmManagedProjectIds, pmManagedSquadIds, data.teams])

  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed' | 'finalized'>('all')

  const filteredTasks = useMemo(() => {
    return visibleTasks.filter((t) => {
      if (statusFilter === 'pending') {
        if (t.status === 'completed') return false
      } else if (statusFilter === 'completed') {
        if (t.status !== 'completed') return false
      } else if (statusFilter === 'finalized') {
        if (!t.ceoFinalized) return false
      }

      if (!searchQuery.trim()) return true
      const q = searchQuery.toLowerCase()
      const project = data.projects.find((p) => p.id === t.projectId)
      const assignee = data.users.find((u) => u.id === t.assigneeId)
      return (
        t.title.toLowerCase().includes(q) ||
        (project?.name || '').toLowerCase().includes(q) ||
        (assignee?.name || '').toLowerCase().includes(q)
      )
    })
  }, [visibleTasks, statusFilter, searchQuery, data.projects, data.users])

  // Modals state
  const [approvingTask, setApprovingTask] = useState<Task | null>(null)
  const [approvalKpiScore, setApprovalKpiScore] = useState<number>(95)
  const [approvalFeedback, setApprovalFeedback] = useState<string>('Deliverable verified and approved')

  const [rejectingTask, setRejectingTask] = useState<Task | null>(null)
  const [rejectionFeedback, setRejectionFeedback] = useState<string>('')

  const handleOpenApproveModal = (task: Task) => {
    if (task.ceoFinalized && !isCeo) {
      showToast('This deliverable has been finalized by the CEO and cannot be altered.', 'error')
      return
    }
    setApprovingTask(task)
    setApprovalKpiScore(task.pmScore || 95)
    setApprovalFeedback('Approved without reservation. High quality delivery.')
  }

  const handleConfirmApproval = (e: React.FormEvent) => {
    e.preventDefault()
    if (!approvingTask) return
    approveTask(approvingTask.id, approvalFeedback, approvalKpiScore)
    setApprovingTask(null)
  }

  const handleOpenRejectModal = (task: Task) => {
    if (task.ceoFinalized && !isCeo) {
      showToast('This deliverable has been finalized by the CEO and cannot be altered.', 'error')
      return
    }
    setRejectingTask(task)
    setRejectionFeedback('')
  }

  const handleConfirmRejection = (e: React.FormEvent) => {
    e.preventDefault()
    if (!rejectingTask) return
    if (!rejectionFeedback.trim()) {
      showToast('Please provide rejection feedback for the assignee.', 'error')
      return
    }
    rejectTask(rejectingTask.id, rejectionFeedback.trim())
    setRejectingTask(null)
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white font-display">
              Approvals & Task Control
            </h2>
            {isCeo && (
              <Badge variant="ceo" size="xs">
                <Crown className="w-3 h-3 mr-1 inline" />
                SUPREME FINAL AUTHORITY
              </Badge>
            )}
            {!isCeo && isCLevel && (
              <Badge variant="clevel" size="xs">
                C-LEVEL OVERVIEW
              </Badge>
            )}
            {!isCeo && !isCLevel && isSquadPm && (
              <Badge variant="pm" size="xs">
                SQUAD-ISOLATED PM CONTROL
              </Badge>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {isCeo
              ? 'Supreme authority to review, approve, score, and finalize deliverables across all squads.'
              : isCLevel
                ? 'Organization-wide review and approval of deliverables and task weights.'
                : isSquadPm
                  ? 'Manage and approve deliverables strictly within your assigned squads.'
                  : 'Track the approval status of your submitted deliverables.'}
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto bg-slate-100 dark:bg-slate-800/60 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition-all cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-200 dark:border-slate-700'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            All ({visibleTasks.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('pending')}
            className={`px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition-all cursor-pointer ${
              statusFilter === 'pending'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-200 dark:border-slate-700'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Pending Review ({visibleTasks.filter((t) => t.status !== 'completed').length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('completed')}
            className={`px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition-all cursor-pointer ${
              statusFilter === 'completed'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-200 dark:border-slate-700'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Completed ({visibleTasks.filter((t) => t.status === 'completed').length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('finalized')}
            className={`px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition-all cursor-pointer ${
              statusFilter === 'finalized'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-200 dark:border-slate-700'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            CEO Finalized ({visibleTasks.filter((t) => t.ceoFinalized).length})
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white dark:bg-slate-900/60 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search deliverables by title, project, or assignee..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Approvals Control Table */}
      <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4">Deliverable</th>
                <th className="py-3 px-4">Project & Scope</th>
                <th className="py-3 px-4">Assignee</th>
                <th className="py-3 px-4 text-center">Weight & Score</th>
                <th className="py-3 px-4">Authority Status</th>
                <th className="py-3 px-4 text-right">Approval Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredTasks.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 italic">
                    No deliverables found matching the current scope and filter.
                  </td>
                </tr>
              ) : (
                filteredTasks.map((task) => {
                  const project = data.projects.find((p) => p.id === task.projectId)
                  const assignee = data.users.find((u) => u.id === task.assigneeId)
                  const isCompleted = task.status === 'completed'
                  const isFinalized = task.ceoFinalized === true
                  const canAct = (isCeo || isCLevel || isSquadPm) && (!isFinalized || isCeo)

                  return (
                    <tr
                      key={task.id}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {task.title}
                        </div>
                        {task.description && (
                          <div className="text-[11px] text-slate-400 truncate max-w-xs mt-0.5">
                            {task.description}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {project?.code || 'GEN'} — {project?.name || 'Initiative'}
                        </span>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {task.isMainProjectTask !== false ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                              Linked ({task.projectPercentage || 0}%)
                            </span>
                          ) : (
                            <span>Standalone</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {assignee ? (
                          <div className="flex items-center gap-2">
                            <Avatar
                              src={assignee.avatarUrl || assignee.avatar}
                              name={assignee.name}
                              initials={assignee.initials}
                              className="w-6 h-6"
                            />
                            <div>
                              <div className="font-medium text-slate-900 dark:text-white">
                                {assignee.name}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                {assignee.title || assignee.role}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Unassigned</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <div className="font-mono font-medium text-slate-700 dark:text-slate-300">
                          {task.weightPoints || 2} pts
                        </div>
                        {task.pmScore !== undefined ? (
                          <div className="text-[10px] font-mono font-bold text-amber-500">
                            KPI: {task.pmScore}/100
                          </div>
                        ) : (
                          <div className="text-[10px] text-slate-400 italic">Not scored</div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {isFinalized ? (
                          <Badge variant="ceo" size="xs">
                            <Crown className="w-2.5 h-2.5 mr-1 inline" />
                            CEO FINALIZED
                          </Badge>
                        ) : isCompleted ? (
                          <Badge variant="emerald" size="xs">
                            APPROVED
                          </Badge>
                        ) : (
                          <Badge variant="amber" size="xs">
                            PENDING REVIEW
                          </Badge>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        {canAct ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="primary"
                              size="xs"
                              icon={Check}
                              onClick={() => handleOpenApproveModal(task)}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                              {task.status === 'completed' ? 'Modify / Re-Score' : 'Approve'}
                            </Button>
                            {!isCompleted && (
                              <Button
                                variant="danger"
                                size="xs"
                                icon={X}
                                onClick={() => handleOpenRejectModal(task)}
                              >
                                Reject
                              </Button>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">
                            {isFinalized ? 'Permanent' : 'View only'}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Approve Modal */}
      {approvingTask && (
        <Modal
          isOpen={!!approvingTask}
          onClose={() => setApprovingTask(null)}
          title={isCeo ? 'CEO Supreme Approval & Finalization' : 'Approve Deliverable'}
        >
          <form onSubmit={handleConfirmApproval} className="space-y-4 text-xs">
            {isCeo && (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 flex items-center gap-2">
                <Crown className="w-4 h-4 shrink-0 text-amber-500" />
                <span>
                  <strong>CEO Action:</strong> Approving this deliverable will mark it permanently finalized (`ceoFinalized: true`), locking it from further changes by non-CEO accounts.
                </span>
              </div>
            )}

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
              <div className="font-semibold text-slate-900 dark:text-white">
                {approvingTask.title}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Assignee: {data.users.find((u) => u.id === approvingTask.assigneeId)?.name || 'Engineer'}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Award KPI Score (0–100)
                </label>
                <span className="font-mono font-bold text-amber-500 text-sm">
                  {approvalKpiScore}/100
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={approvalKpiScore}
                onChange={(e) => setApprovalKpiScore(Number(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Approval Feedback & Verification Note
              </label>
              <textarea
                rows={3}
                value={approvalFeedback}
                onChange={(e) => setApprovalFeedback(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500 resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setApprovingTask(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                Confirm Approval
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Reject Modal */}
      {rejectingTask && (
        <Modal
          isOpen={!!rejectingTask}
          onClose={() => setRejectingTask(null)}
          title="Reject Deliverable / Request Changes"
        >
          <form onSubmit={handleConfirmRejection} className="space-y-4 text-xs">
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-rose-800 dark:text-rose-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>
                Rejecting this task will return it to In Progress and notify the assignee to make revisions.
              </span>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Reason for Rejection *
              </label>
              <textarea
                required
                rows={3}
                value={rejectionFeedback}
                onChange={(e) => setRejectionFeedback(e.target.value)}
                placeholder="Detail what changes are required before this deliverable can be approved..."
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-rose-500 resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setRejectingTask(null)}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" type="submit">
                Reject Deliverable
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
