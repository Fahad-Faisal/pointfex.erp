import React, { useState, useMemo } from 'react'
import { Badge } from '../../components/common/Badge'
import { usePmData } from '../../hooks/usePmData'
import { useApp } from '../../context/AppContext'
import { usePermissions } from '../../hooks/usePermissions'
import { formatDate } from '../../utils/formatters'
import type { TaskStatus } from '../../types'
import {
  Clock,
  Layers,
  FolderGit2,
  Search,
  Lock,
} from 'lucide-react'

interface ColumnDef {
  id: TaskStatus
  label: string
  dot: string
  pmOnly?: boolean
}

export function PmTasksPage() {
  const { pmPersonalTasks, pm } = usePmData()
  const { data, currentUser, updatePmTaskStatus, setSelectedTaskModal, showToast } = useApp()
  const { hasPermission } = usePermissions()
  const canApproveTasks = hasPermission('tasks:approve')

  // Scoped strictly to the logged-in user
  const currentUserId = currentUser?.id || pm?.id
  const myTasks = useMemo(() => {
    return pmPersonalTasks.filter(
      (t) => t.assigneeId === currentUserId || t.assignedTo === currentUserId,
    )
  }, [pmPersonalTasks, currentUserId])

  // Filters
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [priorityFilter, setPriorityFilter] = useState<string>('all')
  const [cLevelFilter, setCLevelFilter] = useState<'all' | 'cto' | 'cfo' | 'chro' | 'ceo'>('all')

  // Drag and drop state
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)
  const [dragOverColId, setDragOverColId] = useState<string | null>(null)

  const columns: ColumnDef[] = [
    { id: 'todo', label: 'To Do', dot: 'bg-slate-400 dark:bg-slate-500' },
    { id: 'in_progress', label: 'In Progress', dot: 'bg-sky-500' },
    { id: 'in_review', label: 'In Review', dot: 'bg-purple-500' },
    { id: 'completed', label: 'Completed', dot: 'bg-emerald-500', pmOnly: true },
    { id: 'blocked', label: 'Blocked', dot: 'bg-rose-500' },
  ]

  // Extract all projects where the user has assigned tasks
  const userProjects = useMemo(() => {
    const projectIdsWithTasks = new Set(myTasks.map((t) => t.projectId).filter(Boolean))
    return data.projects.filter((p) => projectIdsWithTasks.has(p.id))
  }, [data.projects, myTasks])

  // Filter tasks based on project, priority, C-level executive assigner, and search
  const filteredTasks = useMemo(() => {
    return myTasks.filter((task) => {
      if (selectedProjectId !== 'all' && task.projectId !== selectedProjectId) {
        return false
      }

      if (cLevelFilter !== 'all') {
        const creator = task.creator || data.users.find((u) => u.id === task.creatorId)
        const creatorRole = (creator?.role || '').toLowerCase()
        const tags = task.tags || []
        const isMatch =
          creatorRole === cLevelFilter ||
          (cLevelFilter === 'cto' && (tags.includes('CTO Mandate') || tags.includes('Engineering Task') || tags.includes('CTO Task'))) ||
          (cLevelFilter === 'chro' && (tags.includes('CHRO Mandate') || tags.includes('CHRO Task') || tags.includes('People Task'))) ||
          (cLevelFilter === 'cfo' && (tags.includes('CFO Mandate') || tags.includes('Finance Directive') || tags.includes('Budget Task'))) ||
          (cLevelFilter === 'ceo' && (tags.includes('Executive Directive') || tags.includes('CEO Mandate')))
        if (!isMatch) return false
      }

      if (priorityFilter !== 'all' && task.priority !== priorityFilter) {
        return false
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const titleMatch = task.title.toLowerCase().includes(q)
        const descMatch = task.description?.toLowerCase().includes(q)
        const tagMatch = task.tags?.some((t) => t.toLowerCase().includes(q))
        const projectMatch = task.project?.name?.toLowerCase().includes(q)
        if (!titleMatch && !descMatch && !tagMatch && !projectMatch) return false
      }

      return true
    })
  }, [myTasks, selectedProjectId, cLevelFilter, priorityFilter, searchQuery, data.users])

  // Overall stats for left sidebar
  const totalTasksCount = myTasks.length
  const totalCompletedCount = myTasks.filter((t) => t.status === 'completed').length
  const totalActiveCount = totalTasksCount - totalCompletedCount
  const overallProgress =
    totalTasksCount > 0 ? Math.round((totalCompletedCount / totalTasksCount) * 100) : 0

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, taskId: string) => {
    setDraggedTaskId(taskId)
    e.dataTransfer.setData('text/plain', taskId)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragEnd = () => {
    setDraggedTaskId(null)
    setDragOverColId(null)
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, colId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverColId !== colId) {
      setDragOverColId(colId)
    }
  }

  const handleDragLeave = (_e: React.DragEvent<HTMLDivElement>, colId: string) => {
    if (dragOverColId === colId) {
      setDragOverColId(null)
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, targetColId: TaskStatus) => {
    e.preventDefault()
    setDragOverColId(null)
    const taskId = e.dataTransfer.getData('text/plain') || draggedTaskId
    if (!taskId) return

    const task = myTasks.find((t) => t.id === taskId)
    if (!task || task.status === targetColId) return

    // Permission constraint: users without tasks:approve cannot mark directly as completed
    if (targetColId === 'completed' && !canApproveTasks) {
      showToast(
        'Task completion requires executive sign-off. Please move to In Review for approval.',
        'error',
      )
      setDraggedTaskId(null)
      return
    }

    updatePmTaskStatus(taskId, targetColId)
    setDraggedTaskId(null)
  }

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white font-display">
            My Tasks
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Interactive Kanban board · Personal deliverables assigned to {currentUser?.name || pm?.name || 'you'}
          </p>
        </div>

        {!canApproveTasks && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/40 text-amber-800 dark:text-amber-300 text-xs font-medium self-start sm:self-auto">
            <Lock className="w-3.5 h-3.5" />
            <span>"Completed" status requires C-Level executive verification</span>
          </div>
        )}
      </div>

      {/* Main 2-Column Grid: Left Project Filter Sidebar + Right Kanban Board */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Side (3 cols): Project Filter Cards */}
        <div className="lg:col-span-3 space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <FolderGit2 className="w-3.5 h-3.5 text-slate-400" />
              Filter by Project
            </span>
            <span className="text-[11px] text-slate-400">{userProjects.length + 1} views</span>
          </div>

          {/* "All Tasks / All Projects" Card */}
          <button
            type="button"
            onClick={() => setSelectedProjectId('all')}
            className={`w-full text-left p-3.5 rounded-2xl transition-all cursor-pointer border ${
              selectedProjectId === 'all'
                ? 'bg-white dark:bg-[#131a2b] border-lime-400 dark:border-lime-400 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.06)] ring-1 ring-lime-400'
                : 'bg-white/80 dark:bg-[#0f1422] border-slate-200/80 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div
                  className={`w-7 h-7 rounded-xl flex items-center justify-center ${
                    selectedProjectId === 'all'
                      ? 'bg-lime-400 text-slate-950 font-bold'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                </div>
                <div>
                  <span className="font-bold text-xs text-slate-900 dark:text-white block">
                    All Projects / All C-Level Tasks
                  </span>
                  <span className="text-[10px] text-slate-400">All assigned C-level deliverables</span>
                </div>
              </div>
              <Badge variant="lime" size="xs">
                {totalTasksCount}
              </Badge>
            </div>

            <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-500 dark:text-slate-400">Progress</span>
                <span className="font-bold text-slate-900 dark:text-white font-display">
                  {overallProgress}%
                </span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-lime-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${overallProgress}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-400">
                <span>{totalActiveCount} Active</span>
                <span>{totalCompletedCount} Done</span>
              </div>
            </div>
          </button>

          {/* Individual Project Cards */}
          {userProjects.map((proj) => {
            const isSelected = selectedProjectId === proj.id
            const pTasks = myTasks.filter((t) => t.projectId === proj.id)
            const pTotal = pTasks.length
            const pCompleted = pTasks.filter((t) => t.status === 'completed').length
            const pActive = pTotal - pCompleted
            const pProgress = pTotal > 0 ? Math.round((pCompleted / pTotal) * 100) : 0

            return (
              <button
                key={proj.id}
                type="button"
                onClick={() => setSelectedProjectId(proj.id)}
                className={`w-full text-left p-3.5 rounded-2xl transition-all cursor-pointer border ${
                  isSelected
                    ? 'bg-white dark:bg-[#131a2b] border-lime-400 dark:border-lime-400 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.06)] ring-1 ring-lime-400'
                    : 'bg-white/80 dark:bg-[#0f1422] border-slate-200/80 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-1 mb-1.5">
                  <div className="min-w-0 flex-1">
                    <span className="font-bold text-xs text-slate-900 dark:text-white truncate block">
                      {proj.name}
                    </span>
                    <span className="text-[10px] text-slate-400 truncate block">
                      {proj.description || 'Assigned Project'}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded font-semibold shrink-0 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    {proj.code}
                  </span>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500 dark:text-slate-400">Completion</span>
                    <span className="font-bold text-slate-900 dark:text-white font-display">
                      {pProgress}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-sky-500 h-1.5 rounded-full transition-all"
                      style={{ width: `${pProgress}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>{pActive} Active</span>
                    <span>{pCompleted} Done</span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {/* Right Side (9 cols): Search, Priority Filter & 5-Column Kanban Board */}
        <div className="lg:col-span-9 space-y-4">
          {/* Top Bar: Search & Priority Filters */}
          <div className="p-3 rounded-2xl bg-white dark:bg-[#0f1422] border border-slate-200/70 dark:border-slate-800/80 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.03)] flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search tasks by title, tag, or project..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-850/60 border border-slate-200/80 dark:border-slate-700/60 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* C-Level Executive Filter */}
              <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
                <span className="text-[10px] font-semibold text-slate-400 pl-1.5 pr-0.5">Assigner:</span>
                {(['all', 'cto', 'cfo', 'chro', 'ceo'] as const).map((exec) => (
                  <button
                    key={exec}
                    type="button"
                    onClick={() => setCLevelFilter(exec)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-semibold uppercase transition-all cursor-pointer ${
                      cLevelFilter === exec
                        ? 'bg-lime-400 dark:bg-lime-500 text-slate-950 font-bold shadow-xs'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {exec === 'all' ? 'All C-Level' : exec}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
                {(['all', 'urgent', 'high', 'medium', 'low'] as const).map((pri) => (
                  <button
                    key={pri}
                    type="button"
                    onClick={() => setPriorityFilter(pri)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-semibold capitalize transition-all cursor-pointer ${
                      priorityFilter === pri
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {pri}
                  </button>
                ))}
              </div>

              <span className="text-xs text-slate-400 shrink-0">
                Showing <strong>{filteredTasks.length}</strong> tasks
              </span>
            </div>
          </div>

          {/* 5-Column Kanban Board */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3.5 items-start">
            {columns.map((col) => {
              const colTasks = filteredTasks.filter((t) => t.status === col.id)
              const isDragOver = dragOverColId === col.id

              return (
                <div
                  key={col.id}
                  onDragOver={(e) => handleDragOver(e, col.id)}
                  onDragLeave={(e) => handleDragLeave(e, col.id)}
                  onDrop={(e) => handleDrop(e, col.id)}
                  className={`rounded-2xl p-3 min-h-[500px] flex flex-col transition-colors border ${
                    isDragOver
                      ? 'bg-lime-50/50 dark:bg-lime-950/20 border-lime-400 dark:border-lime-500 ring-2 ring-lime-400/30'
                      : 'bg-slate-100/70 dark:bg-[#0f1422] border-slate-200/60 dark:border-slate-800/80'
                  }`}
                >
                  {/* Column Header */}
                  <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-200/60 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                      <span className="font-bold text-xs text-slate-800 dark:text-slate-200">
                        {col.label}
                      </span>
                      {col.pmOnly && !canApproveTasks && (
                        <span title="Requires C-Level verification">
                          <Lock className="w-3 h-3 text-amber-500" />
                        </span>
                      )}
                    </div>
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 shadow-2xs">
                      {colTasks.length}
                    </span>
                  </div>

                  {/* Tasks List */}
                  <div className="space-y-2.5 flex-1 overflow-y-auto">
                    {colTasks.length === 0 ? (
                      <div className="h-32 rounded-xl border border-dashed border-slate-200 dark:border-slate-800/80 bg-white/30 dark:bg-[#131a2b]/30 flex flex-col items-center justify-center text-[11px] text-slate-400 dark:text-slate-500 text-center p-3">
                        {col.pmOnly && !canApproveTasks ? (
                          <span className="flex items-center gap-1">
                            <Lock className="w-3 h-3" />
                            Sign-off required
                          </span>
                        ) : (
                          'Drop task here'
                        )}
                      </div>
                    ) : (
                      colTasks.map((task) => {
                        const isDragging = draggedTaskId === task.id
                        const creator = task.creator
                        const projCode =
                          task.project?.code ||
                          data.projects.find((p) => p.id === task.projectId)?.code ||
                          'PROJ'

                        return (
                          <div
                            key={task.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, task.id)}
                            onDragEnd={handleDragEnd}
                            onClick={() => setSelectedTaskModal(task)}
                            className={`p-3.5 rounded-xl bg-white dark:bg-[#182033] border border-slate-200/80 dark:border-slate-700/70 shadow-2xs hover:shadow-xs transition-all cursor-grab active:cursor-grabbing group space-y-2.5 ${
                              isDragging
                                ? 'opacity-40 scale-95 border-lime-400 ring-2 ring-lime-400/30'
                                : 'hover:border-slate-300 dark:hover:border-slate-600'
                            }`}
                          >
                            {/* Card Top: Project Code & Priority Badge */}
                            <div className="flex items-center justify-between gap-1 text-[10px]">
                              <span className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                {projCode}
                              </span>
                              <Badge
                                variant={
                                  task.priority === 'urgent'
                                    ? 'rose'
                                    : task.priority === 'high'
                                      ? 'amber'
                                      : task.priority === 'medium'
                                        ? 'sky'
                                        : 'slate'
                                }
                                size="xs"
                              >
                                {task.priority}
                              </Badge>
                            </div>

                            {/* Task Title */}
                            <div className="font-semibold text-xs text-slate-900 dark:text-slate-100 group-hover:text-lime-600 dark:group-hover:text-lime-400 leading-snug line-clamp-2 transition-colors">
                              {task.title}
                            </div>

                            {/* Task Meta (Weight / Progress if available) */}
                            {task.projectPercentage != null && (
                              <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                                <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 font-medium">
                                  Weight: {task.projectPercentage}%
                                </span>
                              </div>
                            )}

                            {/* Card Footer: Assigned by & Due Date */}
                            <div className="flex items-center justify-between pt-1.5 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400 dark:text-slate-400">
                              <span
                                className="truncate max-w-[110px] text-slate-500 dark:text-slate-400 font-medium"
                                title={creator ? `${creator.name} (${creator.role.toUpperCase()})` : 'System'}
                              >
                                By: {creator?.name || 'Executive'}
                              </span>
                              <span className="flex items-center gap-1 shrink-0 font-medium">
                                <Clock className="w-3 h-3 text-slate-400" />
                                {formatDate(task.dueDate, 'short')}
                              </span>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export default PmTasksPage
