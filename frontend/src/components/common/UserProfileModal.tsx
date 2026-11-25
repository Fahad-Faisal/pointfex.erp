import { useState, useEffect } from 'react'
import { Modal } from './Modal'
import { Avatar } from './Avatar'
import { Button } from './Button'
import { useApp } from '../../context/AppContext'
import { erpApi } from '../../api/client'
import { formatDate } from '../../utils/formatters'
import type { User } from '../../types'
import {
  Award,
  Layers,
  Calendar,
  MessageSquare,
} from 'lucide-react'

export interface UserProfileModalProps {
  user: User | any | null
  isOpen: boolean
  onClose: () => void
}

export function UserProfileModal({ user, isOpen, onClose }: UserProfileModalProps) {
  const { data } = useApp()
  const [weeklyKpis, setWeeklyKpis] = useState<any[]>([])
  const [tasks, setTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'tasks' | 'kpis'>('tasks')

  useEffect(() => {
    if (!user || !isOpen) return

    setLoading(true)
    let isMounted = true

    Promise.all([
      erpApi.getEmployeeKpiHistory(user.id).catch(() => []),
      erpApi.getTasksByAssignee(user.id).catch(() => []),
    ])
      .then(([history, userTasks]) => {
        if (!isMounted) return
        setWeeklyKpis(Array.isArray(history) ? history : [])
        const fetchedTasks =
          Array.isArray(userTasks) && userTasks.length > 0
            ? userTasks
            : data.tasks.filter((t: any) => t.assigneeId === user.id)
        setTasks(fetchedTasks)
      })
      .catch(() => {
        if (!isMounted) return
        setWeeklyKpis([])
        setTasks(data.tasks.filter((t: any) => t.assigneeId === user.id))
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [user, isOpen, data.tasks])

  if (!user) return null

  // Resolve team
  const userTeam = data.teams.find(
    (t) => t.id === user.teamId || t.memberIds?.includes(user.id),
  )

  // Find performance record if available
  const perf = (data as any).performanceRecords?.find(
    (p: any) => p.employeeId === user.id || p.userId === user.id,
  )

  const overallKpi =
    weeklyKpis.length > 0 && weeklyKpis[0].score !== null
      ? Number(weeklyKpis[0].score)
      : typeof perf?.overallScore === 'number'
        ? perf.overallScore
        : null

  const performanceTier =
    overallKpi === null
      ? 'UNRATED'
      : overallKpi >= 92
        ? 'TOP PERFORMER'
        : overallKpi >= 80
          ? 'STRONG CONTRIBUTOR'
          : 'NEEDS SUPPORT'

  const completedCount = tasks.filter((t) => t.status === 'completed').length

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Staff Profile: ${user.name}`}
      maxWidth="max-w-3xl"
      footer={
        <Button variant="secondary" size="sm" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-4 text-xs">
        {/* User Card Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <Avatar
              src={user.avatarUrl || user.avatar}
              name={user.name}
              initials={user.initials}
              className="w-12 h-12 text-base ring-2 ring-indigo-500/20"
            />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {user.name}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono uppercase bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                  {user.role}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {user.title || 'Staff Member'} · {userTeam?.name || 'Pointfex Team'}
              </p>
              <p className="text-[11px] text-slate-400 font-mono">{user.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-indigo-500 block">
                Performance Standing
              </span>
              <span className="text-sm font-extrabold text-indigo-600 dark:text-indigo-400">
                {performanceTier}
              </span>
            </div>
          </div>
        </div>

        {/* 4-Stat Metric Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          <div className="p-3 rounded-2xl bg-indigo-50/80 dark:bg-indigo-950/30 border border-indigo-200/60 dark:border-indigo-800/60">
            <div className="text-[10px] uppercase font-bold text-indigo-600 dark:text-indigo-400">
              Overall KPI
            </div>
            <div className="text-2xl font-black font-mono text-indigo-700 dark:text-indigo-300 mt-0.5">
              {overallKpi !== null ? `${overallKpi}%` : 'N/A'}
            </div>
            <div className="text-[9px] text-indigo-500 font-semibold mt-0.5">
              Calculated Standing
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/60">
            <div className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400">
              Tasks Completed
            </div>
            <div className="text-2xl font-black font-mono text-emerald-700 dark:text-emerald-300 mt-0.5">
              {completedCount} / {tasks.length}
            </div>
            <div className="text-[9px] text-emerald-500 font-semibold mt-0.5">
              Tasks Completed
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-purple-50/80 dark:bg-purple-950/30 border border-purple-200/60 dark:border-purple-800/60">
            <div className="text-[10px] uppercase font-bold text-purple-600 dark:text-purple-400">
              Morale / Rating
            </div>
            <div className="text-2xl font-black font-mono text-purple-700 dark:text-purple-300 mt-0.5">
              {typeof perf?.satisfactionIndex === 'number' ? `${perf.satisfactionIndex} / 5` : 'N/A'}
            </div>
            <div className="text-[9px] text-purple-500 font-semibold mt-0.5">
              Satisfaction Index
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/60">
            <div className="text-[10px] uppercase font-bold text-amber-600 dark:text-amber-400">
              Lifetime XP
            </div>
            <div className="text-2xl font-black font-mono text-amber-700 dark:text-amber-300 mt-0.5">
              {typeof user.lifetimeXp === 'number' ? `${user.lifetimeXp} XP` : '0 XP'}
            </div>
            <div className="text-[9px] text-amber-500 font-semibold mt-0.5">
              Rank Points
            </div>
          </div>
        </div>

        {/* Tab Selector: Tasks & Deliverables vs Weekly KPI Ledger */}
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab('tasks')}
            className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'tasks'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Tasks &amp; Grading ({tasks.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('kpis')}
            className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'kpis'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            Weekly KPI History ({weeklyKpis.length} {weeklyKpis.length === 1 ? 'Week Recorded' : 'Weeks Recorded'})
          </button>
        </div>

        {/* TAB 1: Tasks, Who Marked What & Comments */}
        {activeTab === 'tasks' && (
          <div className="space-y-3">
            {loading ? (
              <div className="py-10 text-center text-slate-400">Loading deliverables...</div>
            ) : tasks.length === 0 ? (
              <div className="py-10 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-slate-400">
                No deliverables found for this member.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                {tasks.map((task: any) => {
                  const isCompleted = task.status === 'completed'
                  const weightPts = Number(task.weightPoints || 2)
                  const comments = task.comments || []
                  const execScores = task.execScores || []

                  return (
                    <div
                      key={task.id}
                      className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-2xs space-y-2.5"
                    >
                      {/* Top row: Title, Project & Badges */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] font-bold text-slate-400">
                              {task.project?.code || 'PRJ'}
                            </span>
                            <h4 className="font-bold text-xs text-slate-900 dark:text-white">
                              {task.title}
                            </h4>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">
                            {task.description || 'No description provided'}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${
                              isCompleted
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                                : task.status === 'in_progress'
                                  ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-400'
                                  : task.status === 'in_review'
                                    ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-400'
                                    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                          >
                            {task.status.toUpperCase().replace('_', ' ')}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                            {weightPts} pts ({task.weightCategory || 'MEDIUM'})
                          </span>
                        </div>
                      </div>

                      {/* Who Marked What: PM Score & Executive Marks */}
                      <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 space-y-1.5 text-[11px]">
                        <div className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1 text-[11px]">
                          <Award className="w-3.5 h-3.5 text-indigo-500" />
                          Evaluation &amp; Marks Breakdown:
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
                          {/* PM Score */}
                          <div className="p-2 rounded-lg bg-white dark:bg-slate-850 border border-slate-200/60 dark:border-slate-700">
                            <span className="text-slate-400 block text-[10px]">PM Satisfaction Score:</span>
                            {task.pmScore !== null && task.pmScore !== undefined ? (
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-xs">
                                  {Number(task.pmScore)} / 100
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  (Graded by Squad PM)
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400 italic text-[10px]">
                                Pending PM review
                              </span>
                            )}
                          </div>

                          {/* C-Level Executive Marks */}
                          <div className="p-2 rounded-lg bg-white dark:bg-slate-850 border border-slate-200/60 dark:border-slate-700">
                            <span className="text-slate-400 block text-[10px]">C-Level Executive Mark:</span>
                            {execScores.length > 0 ? (
                              <div className="space-y-1 mt-0.5">
                                {execScores.map((es: any, idx: number) => (
                                  <div key={idx} className="flex flex-col">
                                    <div className="flex items-center gap-1.5">
                                      <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
                                        {es.execRole}
                                      </span>
                                      <span className="font-mono font-bold text-purple-600 dark:text-purple-400 text-xs">
                                        {Number(es.score)} / 100
                                      </span>
                                      {es.actedBy ? (
                                        <span className="text-[10px] text-slate-500 font-medium">
                                          (by {es.actedBy.name})
                                        </span>
                                      ) : (
                                        <span className="text-[9px] text-slate-400 italic">
                                          (Provisional PM mirror)
                                        </span>
                                      )}
                                    </div>
                                    {es.reason && (
                                      <p className="text-[10px] text-slate-500 italic mt-0.5">
                                        &ldquo;{es.reason}&rdquo;
                                      </p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-400 italic text-[10px]">
                                No executive mark added
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Comments Section */}
                      <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
                        <div className="text-[10px] font-semibold text-slate-500 flex items-center gap-1 mb-1.5">
                          <MessageSquare className="w-3 h-3 text-slate-400" />
                          Deliverable Feedback &amp; Review Comments ({comments.length}):
                        </div>
                        {comments.length > 0 ? (
                          <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
                            {comments.map((c: any) => (
                              <div
                                key={c.id}
                                className="p-2 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-100 dark:border-slate-800 text-[11px]"
                              >
                                <div className="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">
                                  <span className="font-bold text-slate-800 dark:text-slate-200">
                                    {c.author?.name ||
                                      data.users?.find((u) => u.id === c.authorId)?.name ||
                                      'Reviewer'}
                                  </span>
                                  <span>{c.createdAt ? formatDate(c.createdAt, 'short') : ''}</span>
                                </div>
                                <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                                  {c.content}
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-[10px] text-slate-400 italic py-1">
                            No comments recorded on this deliverable.
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: Weekly KPI Records Table */}
        {activeTab === 'kpis' && (
          <div>
            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden max-h-60 overflow-y-auto">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-500 sticky top-0">
                  <tr>
                    <th className="p-2.5 font-semibold">Week</th>
                    <th className="p-2.5 font-semibold">Score</th>
                    <th className="p-2.5 font-semibold">PM Score</th>
                    <th className="p-2.5 font-semibold">CTO Score</th>
                    <th className="p-2.5 font-semibold">CHRO Score</th>
                    <th className="p-2.5 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                  {weeklyKpis.length > 0 ? (
                    weeklyKpis.map((k: any) => (
                      <tr key={k.id || `${k.year}-${k.weekNumber}`}>
                        <td className="p-2.5 font-semibold">
                          W{k.weekNumber} &apos;{String(k.year).slice(2)}
                        </td>
                        <td className="p-2.5 font-bold text-indigo-600 dark:text-indigo-400">
                          {k.score ? `${Number(k.score)}%` : 'N/A'}
                        </td>
                        <td className="p-2.5">{k.pmScore ? Number(k.pmScore) : '-'}</td>
                        <td className="p-2.5">{k.ctoScore ? Number(k.ctoScore) : '-'}</td>
                        <td className="p-2.5">{k.chroScore ? Number(k.chroScore) : '-'}</td>
                        <td className="p-2.5">
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                            {k.evaluationStatus || 'CONFIRMED'}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-400">
                        No historical weekly KPI records found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
