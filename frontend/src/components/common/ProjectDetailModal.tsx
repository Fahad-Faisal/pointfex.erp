import { useEffect, useMemo, useState } from 'react'
import { Modal } from './Modal'
import { Badge } from './Badge'
import { Button } from './Button'
import { StatusPill } from './StatusPill'
import { useApp } from '../../context/AppContext'
import { formatDate, getRelativeDeadline } from '../../utils/formatters'
import {
  Calendar,
  FileCode,
  ExternalLink,
  Clock,
  GitBranch,
  Users,
  Globe,
  CheckSquare,
  Check,
  MinusCircle,
} from 'lucide-react'
import type { Project, EnrichedProject } from '../../types'

export type FinalReviewItemStatus = 'pending' | 'completed' | 'na'

export interface FinalReviewSection {
  id: 'ui' | 'functionality' | 'technical' | 'deployment'
  title: string
  items: Array<{ id: string; label: string }>
}

// oxlint-disable-next-line react/only-export-components
export const FINAL_REVIEW_SECTIONS: FinalReviewSection[] = [
  {
    id: 'ui',
    title: 'A. UI & Responsiveness',
    items: [
      { id: 'ui_mobile', label: 'Responsive on mobile devices.' },
      { id: 'ui_tablet', label: 'Responsive on tablets.' },
      { id: 'ui_desktop', label: 'Works properly on desktop screens.' },
      { id: 'ui_consistency', label: 'Consistent layout, colors, typography, and spacing.' },
      { id: 'ui_no_overlap', label: 'No broken layouts or overlapping elements.' },
    ],
  },
  {
    id: 'functionality',
    title: 'B. Functionality',
    items: [
      { id: 'fn_navigation', label: 'All navigation links and buttons work.' },
      { id: 'fn_features', label: 'Main features work as expected.' },
      { id: 'fn_forms', label: 'Forms work correctly and validate user input.' },
      { id: 'fn_no_bugs', label: 'No major functional bugs.' },
      { id: 'fn_persistence', label: 'Data is saved and retrieved correctly, where applicable.' },
    ],
  },
  {
    id: 'technical',
    title: 'C. Technical Quality',
    items: [
      { id: 'tq_console', label: 'No major console errors.' },
      { id: 'tq_assets', label: 'No broken images or missing assets.' },
      { id: 'tq_perf', label: 'Reasonable loading performance.' },
      { id: 'tq_security', label: 'Basic security practices are followed.' },
      { id: 'tq_api', label: 'API and backend functionality work correctly, where applicable.' },
      { id: 'tq_no_demo', label: 'No unnecessary demo or placeholder content.' },
    ],
  },
  {
    id: 'deployment',
    title: 'D. Deployment & Documentation',
    items: [
      { id: 'dd_live_link', label: 'Live project link is accessible.' },
      { id: 'dd_repo', label: 'GitHub repository is accessible.' },
      { id: 'dd_readme', label: 'README or basic project documentation is available.' },
      { id: 'dd_setup', label: 'Required setup instructions are provided.' },
    ],
  },
]

export interface ProjectChecklistRecord {
  statuses: Record<string, FinalReviewItemStatus>
  comments: string
  updatedAt?: string
}

// oxlint-disable-next-line react/only-export-components
export function getProjectChecklistStorageKey(projectId: string): string {
  return `pointfex_project_checklist_${projectId}`
}

// oxlint-disable-next-line react/only-export-components
export function createDefaultProjectChecklist(): ProjectChecklistRecord {
  const statuses: Record<string, FinalReviewItemStatus> = {}
  for (const section of FINAL_REVIEW_SECTIONS) {
    for (const item of section.items) {
      statuses[item.id] = 'pending'
    }
  }
  return { statuses, comments: '' }
}

// oxlint-disable-next-line react/only-export-components
export function loadProjectChecklist(projectId: string): ProjectChecklistRecord {
  const defaults = createDefaultProjectChecklist()
  if (typeof localStorage === 'undefined') return defaults
  try {
    const raw = localStorage.getItem(getProjectChecklistStorageKey(projectId))
    if (!raw) return defaults
    const parsed = JSON.parse(raw) as Partial<ProjectChecklistRecord>
    return {
      statuses: { ...defaults.statuses, ...(parsed.statuses || {}) },
      comments: typeof parsed.comments === 'string' ? parsed.comments : '',
      updatedAt: parsed.updatedAt,
    }
  } catch {
    return defaults
  }
}

// oxlint-disable-next-line react/only-export-components
export function saveProjectChecklist(
  projectId: string,
  record: ProjectChecklistRecord,
): ProjectChecklistRecord {
  const next: ProjectChecklistRecord = {
    ...record,
    updatedAt: new Date().toISOString(),
  }
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(getProjectChecklistStorageKey(projectId), JSON.stringify(next))
    } catch {
      // ignore storage quota failures
    }
  }
  return next
}

// oxlint-disable-next-line react/only-export-components
export function computeProjectChecklistStats(record: ProjectChecklistRecord): {
  totalCount: number
  completedCount: number
  remainingCount: number
  naCount: number
  applicableCount: number
  completionPercentage: number
} {
  const allIds = FINAL_REVIEW_SECTIONS.flatMap((s) => s.items.map((i) => i.id))
  let completedCount = 0
  let naCount = 0
  for (const id of allIds) {
    const st = record.statuses[id] || 'pending'
    if (st === 'completed') completedCount += 1
    else if (st === 'na') naCount += 1
  }
  const applicableCount = allIds.length - naCount
  const remainingCount = Math.max(applicableCount - completedCount, 0)
  const completionPercentage =
    applicableCount > 0 ? Math.round((completedCount / applicableCount) * 100) : 100
  return {
    totalCount: allIds.length,
    completedCount,
    remainingCount,
    naCount,
    applicableCount,
    completionPercentage,
  }
}

export interface ProjectDetailModalProps {
  project: (Project & { repo?: any; srs?: any }) | (EnrichedProject & { srs?: any }) | null
  isOpen: boolean
  onClose: () => void
}

export function ProjectDetailModal({ project, isOpen, onClose }: ProjectDetailModalProps) {
  const { data, resolvers, showToast } = useApp()
  const [checklist, setChecklist] = useState<ProjectChecklistRecord>(() =>
    project ? loadProjectChecklist(project.id) : createDefaultProjectChecklist(),
  )

  useEffect(() => {
    if (project?.id) {
      setChecklist(loadProjectChecklist(project.id))
    }
  }, [project?.id])

  const checklistStats = useMemo(() => computeProjectChecklistStats(checklist), [checklist])

  if (!project) return null

  const deadlineInfo = getRelativeDeadline(project.deadline)
  const assignedTeam = project.teamId
    ? data.teams.find((t) => t.id === project.teamId) || resolvers.getTeam(project.teamId)
    : data.teams.find((t) => t.projectIds?.includes(project.id)) || null
  const assignedPm =
    (project as EnrichedProject).pm ||
    (project.pmId ? resolvers.getUser(project.pmId) : null) ||
    (assignedTeam?.pmId ? resolvers.getUser(assignedTeam.pmId) : null)

  const handleSetItemStatus = (itemId: string, nextStatus: FinalReviewItemStatus) => {
    setChecklist((prev) => {
      const updated = saveProjectChecklist(project.id, {
        ...prev,
        statuses: { ...prev.statuses, [itemId]: nextStatus },
      })
      return updated
    })
  }

  const handleSaveComments = () => {
    const updated = saveProjectChecklist(project.id, checklist)
    setChecklist(updated)
    showToast('Final Product Review feedback saved', 'success')
  }

  const srs = project.srs || null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <Badge variant="indigo" size="sm">
            {project.code}
          </Badge>
          <span className="truncate">{project.name}</span>
        </div>
      }
      subtitle={`Sprint Cycle: Week ${project.currentWeek || 3} of ${project.totalWeeks || 5}`}
      maxWidth="max-w-3xl"
      footer={
        <Button variant="secondary" size="sm" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-4 text-xs">
        {/* 1. Progress & Status Section */}
        <div className="p-4 bg-slate-50 dark:bg-[#131a2b] rounded-2xl border border-slate-100 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Status:</span>
              <StatusPill status={project.status} size="sm" />
            </div>
            <span className="text-xs font-bold text-slate-900 dark:text-white">
              {project.progress}% Complete
            </span>
          </div>

          <div className="w-full bg-slate-200 dark:bg-slate-700/80 rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-sky-500 h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${project.progress}%` }}
            />
          </div>
        </div>

        {/* 2. Title, Description, Team/PM & Technology Stack */}
        <div className="p-4 bg-slate-50/70 dark:bg-[#131a2b] rounded-2xl border border-slate-100 dark:border-slate-800 space-y-3">
          <div>
            <h4 className="font-bold text-slate-900 dark:text-white text-xs">{project.name}</h4>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-xs mt-1">
              {project.description}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200/70 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              <div>
                <span className="text-[10px] uppercase text-slate-400 block">Assigned Team</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {assignedTeam ? `${assignedTeam.name} (${assignedTeam.code})` : 'Unassigned'}
                </span>
              </div>
            </div>
            <div>
              <span className="text-[10px] uppercase text-slate-400 block">Project Manager</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {assignedPm ? `${assignedPm.name} (${assignedPm.title || 'PM'})` : 'Unassigned'}
              </span>
            </div>
          </div>

          {project.tags && project.tags.length > 0 && (
            <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800">
              <span className="text-[10px] uppercase text-slate-400 block mb-1.5">
                Technology Stack
              </span>
              <div className="flex flex-wrap gap-1.5">
                {project.tags.map((tag) => (
                  <Badge key={tag} variant="neutral" size="xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 3. Deadlines Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 bg-slate-50 dark:bg-[#131a2b] rounded-2xl border border-slate-100 dark:border-slate-800">
          <div>
            <span className="text-slate-400 dark:text-slate-500 block text-[11px]">
              Sprint Start
            </span>
            <span className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              {formatDate(project.startDate, 'medium')}
            </span>
          </div>

          <div>
            <span className="text-slate-400 dark:text-slate-500 block text-[11px]">
              Final Deadline
            </span>
            <span className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              {formatDate(project.deadline, 'medium')}
            </span>
          </div>

          <div>
            <span className="text-slate-400 dark:text-slate-500 block text-[11px]">
              Time Remaining
            </span>
            <span className="font-semibold text-sky-600 dark:text-sky-400 mt-0.5 block">
              {deadlineInfo.label}
            </span>
          </div>
        </div>

        {/* 4. Links & Documents (GitHub, Live Demo, SRS) */}
        <div className="space-y-2">
          {project.repositoryUrl && (
            <div className="p-3 bg-slate-50 dark:bg-[#131a2b] rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center justify-between text-slate-600 dark:text-slate-400 font-mono text-[11px]">
              <a
                href={project.repositoryUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 text-sky-600 dark:text-sky-400 hover:underline truncate"
              >
                <GitBranch className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="truncate">{project.repositoryUrl}</span>
                <ExternalLink className="w-3 h-3 ml-0.5 opacity-70 shrink-0" />
              </a>
              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 shrink-0">
                {project.repo?.activeBranch || 'main'}
              </span>
            </div>
          )}

          {project.demoUrl && (
            <div className="p-3 bg-slate-50 dark:bg-[#131a2b] rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center justify-between text-slate-600 dark:text-slate-400 text-[11px]">
              <a
                href={project.demoUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 hover:underline truncate font-mono"
              >
                <Globe className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Live Preview: {project.demoUrl}</span>
                <ExternalLink className="w-3 h-3 ml-0.5 opacity-70 shrink-0" />
              </a>
            </div>
          )}

          {srs ? (
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#131a2b] border border-slate-200/80 dark:border-slate-700/80 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300">
                    <FileCode className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs">
                      {srs.documentTitle || 'Software Requirements Specification (SRS)'}
                    </h4>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">
                      {srs.version || 'v1.0'} · Updated {formatDate(srs.lastUpdated, 'short')}
                    </span>
                  </div>
                </div>

                {srs.documentUrl && (
                  <a
                    href={srs.documentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/80 border border-indigo-100 dark:border-indigo-800/60 transition-colors text-xs font-semibold"
                  >
                    <span>View Spec</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>

              {srs.overview && (
                <p className="text-slate-600 dark:text-slate-300 text-[11px] leading-relaxed bg-white dark:bg-[#0b101b] p-3 rounded-xl border border-slate-200/60 dark:border-slate-800">
                  {srs.overview}
                </p>
              )}
            </div>
          ) : (
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-[#131a2b] border border-slate-200/70 dark:border-slate-800 text-[11px] text-slate-400">
              No SRS or concept document attached to this project yet.
            </div>
          )}
        </div>

        {/* 5. Final Product Review Checklist (Per-Project Persistent Evaluation) */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#131a2b] border border-slate-200/80 dark:border-slate-700/80 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <div>
                <h4 className="font-bold text-slate-900 dark:text-white text-xs">
                  Final Product Review Checklist
                </h4>
                <span className="text-[11px] text-slate-400">
                  {checklistStats.completedCount} Completed · {checklistStats.remainingCount}{' '}
                  Remaining · {checklistStats.naCount} N/A
                </span>
              </div>
            </div>
            <Badge variant="emerald" size="sm">
              {checklistStats.completionPercentage}% Reviewed
            </Badge>
          </div>

          <div className="w-full bg-slate-200 dark:bg-slate-700/80 rounded-full h-2 overflow-hidden">
            <div
              className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${checklistStats.completionPercentage}%` }}
            />
          </div>

          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
            {FINAL_REVIEW_SECTIONS.map((section) => (
              <div
                key={section.id}
                className="p-3 rounded-xl bg-white dark:bg-[#0b101b] border border-slate-200/60 dark:border-slate-800 space-y-2"
              >
                <div className="font-bold text-[11px] uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  {section.title}
                </div>
                <div className="space-y-1.5">
                  {section.items.map((item) => {
                    const status = checklist.statuses[item.id] || 'pending'
                    return (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-2 py-1 text-[11px]"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            handleSetItemStatus(
                              item.id,
                              status === 'completed' ? 'pending' : 'completed',
                            )
                          }
                          className="flex items-center gap-2 text-left flex-1 cursor-pointer"
                        >
                          <span
                            className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${
                              status === 'completed'
                                ? 'bg-emerald-600 border-emerald-600 text-white'
                                : status === 'na'
                                  ? 'bg-slate-200 dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-500'
                                  : 'border-slate-300 dark:border-slate-600'
                            }`}
                          >
                            {status === 'completed' && <Check className="w-3 h-3" />}
                            {status === 'na' && <MinusCircle className="w-3 h-3" />}
                          </span>
                          <span
                            className={
                              status === 'completed'
                                ? 'text-slate-900 dark:text-slate-100 font-medium'
                                : status === 'na'
                                  ? 'text-slate-400 line-through'
                                  : 'text-slate-600 dark:text-slate-300'
                            }
                          >
                            {item.label}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            handleSetItemStatus(item.id, status === 'na' ? 'pending' : 'na')
                          }
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold border shrink-0 cursor-pointer ${
                            status === 'na'
                              ? 'bg-slate-800 text-white border-slate-700 dark:bg-slate-200 dark:text-slate-900'
                              : 'bg-slate-50 dark:bg-slate-800/70 text-slate-500 border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          N/A
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2 pt-1">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
              C-Level Review Comments & Feedback
            </label>
            <textarea
              rows={2}
              value={checklist.comments}
              onChange={(e) => setChecklist((prev) => ({ ...prev, comments: e.target.value }))}
              placeholder="Document release readiness notes, UX observations, or deployment blockers..."
              className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#0b101b] border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 resize-none focus:outline-none focus:border-slate-400"
            />
            <div className="flex justify-end">
              <Button type="button" variant="primary" size="xs" onClick={handleSaveComments}>
                Save Review Notes
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}
