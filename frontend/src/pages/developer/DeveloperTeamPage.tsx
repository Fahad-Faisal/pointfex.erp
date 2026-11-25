import { Card } from '../../components/common/Card'
import { Badge } from '../../components/common/Badge'
import { Button } from '../../components/common/Button'
import { StatusPill } from '../../components/common/StatusPill'
import { useDeveloperData } from '../../hooks/useDeveloperData'
import { useApp } from '../../context/AppContext'
import { formatDate } from '../../utils/formatters'
import { Mail, Shield, FolderGit2, Layers } from 'lucide-react'

export function DeveloperTeamPage() {
  const { team, teamMembers, pm, devProjects } = useDeveloperData()
  const { currentDevId, currentUser, setRoute, setSelectedProjectModal } = useApp()

  const isUserSquadPm = Boolean(currentUser?.id && team?.pmId === currentUser.id)

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white font-display">
          {team?.name || 'My Engineering Squad'}
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          {team?.focus || 'General software engineering and delivery'}
        </p>
      </div>

      {/* Squad PM Management Authority Banner */}
      {isUserSquadPm && (
        <div className="p-4 rounded-2xl bg-lime-500/10 border border-lime-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="lime" size="xs">
                Squad Project Manager
              </Badge>
              <span className="font-semibold text-slate-900 dark:text-white text-xs">
                You are the assigned PM for {team?.name}
              </span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
              You have full authority to create and assign tasks, verify deliverables, and score member KPIs for this squad.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="lime"
              size="sm"
              icon={Layers}
              onClick={() => setRoute('task-management')}
            >
              Task Operations
            </Button>
          </div>
        </div>
      )}

      {/* PM Card */}
      <Card title="Project Manager" icon={Shield}>
        <div className="flex items-center justify-between gap-3 text-xs">
          {pm ? (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white dark:bg-lime-400 dark:text-slate-950 flex items-center justify-center font-bold">
                {pm.initials}
              </div>
              <div>
                <div className="font-semibold text-slate-900 dark:text-white text-sm flex items-center gap-1.5">
                  {pm.name}
                  {isUserSquadPm && (
                    <Badge variant="lime" size="xs">
                      YOU (ASSIGNED PM)
                    </Badge>
                  )}
                </div>
                <div className="text-slate-500 dark:text-slate-400">{pm.title}</div>
              </div>
            </div>
          ) : (
            <div className="text-slate-400 italic">No Project Manager currently assigned</div>
          )}
          <Badge variant={pm ? 'emerald' : 'slate'} size="xs" dot>
            {pm ? 'Assigned' : 'Unassigned'}
          </Badge>
        </div>
      </Card>

      {/* Team Squad */}
      <div>
        <h3 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">
          Dedicated Engineers ({teamMembers.length})
        </h3>
        {teamMembers.length === 0 ? (
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-xs text-slate-400 italic text-center">
            No developers currently assigned to this squad.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {teamMembers.map((member) => (
              <Card key={member.id} noPadding>
                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 flex items-center justify-center font-bold text-xs border border-slate-200/60 dark:border-slate-700">
                        {member.initials}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white text-xs flex items-center gap-1.5">
                          {member.name}
                          {member.id === currentDevId && (
                            <Badge variant="lime" size="xs">
                              YOU
                            </Badge>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {member.title}
                        </div>
                      </div>
                    </div>

                    <Badge variant={member.status === 'online' ? 'emerald' : 'slate'} size="xs" dot>
                      {member.status}
                    </Badge>
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
                    <div className="flex items-center gap-1 truncate">
                      <Mail className="w-3 h-3 text-slate-400" />
                      <span className="truncate">{member.email}</span>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Squad Managed Projects */}
      <div>
        <h3 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">
          Managed Projects ({devProjects.length})
        </h3>
        {devProjects.length === 0 ? (
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-xs text-slate-400 italic text-center">
            No projects currently assigned to this squad.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {devProjects.map((project) => (
              <Card key={project.id} noPadding>
                <div className="p-4 space-y-3 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-slate-100 text-xs flex items-center gap-1.5">
                        <FolderGit2 className="w-3.5 h-3.5 text-indigo-500" />
                        {project.code} — {project.name}
                      </div>
                      <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                        {project.description}
                      </p>
                    </div>
                    <StatusPill status={project.status} size="sm" />
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-slate-400">Progress</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {project.progress}%
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-sky-500 h-1.5 rounded-full"
                        style={{ width: `${project.progress}%` }}
                      />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                    <span>Due {formatDate(project.deadline, 'short')}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedProjectModal(project)}
                      className="text-sky-600 dark:text-sky-400 hover:underline font-medium cursor-pointer"
                    >
                      View Details
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
