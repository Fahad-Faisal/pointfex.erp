import React, { useState, useMemo, useEffect } from 'react'
import { Badge } from '../../components/common/Badge'
import { Button } from '../../components/common/Button'
import { Modal } from '../../components/common/Modal'
import { ConfirmDialog } from '../../components/common/ConfirmDialog'
import { Avatar } from '../../components/common/Avatar'
import { useCtoData, type TeamWithDetails } from '../../hooks/useCtoData'
import { useApp } from '../../context/AppContext'
import { erpApi } from '../../api/client'
import { formatPlainEnglishLog } from '../../utils/plain-english-logs'
import {
  Users,
  Search,
  FolderGit2,
  ShieldCheck,
  UserCheck,
  Plus,
  Edit2,
  CheckCircle2,
  Kanban,
  History,
  Link2,
  ExternalLink,
} from 'lucide-react'

export function CtoTeamManagementPage() {
  const { teams, developers, projectManagers, pmEligibleUsers, projects } = useCtoData()
  const {
    createTeam,
    updateTeam,
    showToast,
    currentRole,
    currentUser,
    data,
    setSelectedTaskModal,
  } = useApp()

  const [inspectTab, setInspectTab] = useState<'kanban' | 'roster' | 'logs' | 'resources'>('kanban')

  const allCompanyPersonnel = useMemo(() => {
    return (data.users || []).filter((u) => !u.isSuspended)
  }, [data.users])

  const userRole = (currentUser?.role || currentRole || '').toLowerCase()
  const userTitle = (currentUser?.title || '').toLowerCase()
  const userActiveRoles = (currentUser?.activeRoleSlugs || []).map((r) => r.toLowerCase())

  const canEditSquads = useMemo(() => {
    const isCeo =
      userRole === 'ceo' ||
      userActiveRoles.includes('ceo') ||
      userTitle.includes('chief executive officer') ||
      Boolean((currentUser as any)?.isRoot)
    const isCto =
      userRole === 'cto' ||
      userActiveRoles.includes('cto') ||
      userTitle.includes('chief technology officer')
    const isChro =
      userRole === 'chro' ||
      userRole === 'cpo' ||
      userActiveRoles.includes('chro') ||
      userActiveRoles.includes('cpo') ||
      userTitle.includes('chief human resources officer') ||
      userTitle.includes('chief people officer')
    return isCeo || isCto || isChro
  }, [userRole, userTitle, userActiveRoles, currentUser])

  const canCreateSquad = canEditSquads
  const canManageSquad = canEditSquads

  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'current' | 'previous'>('all')
  const [selectedSquad, setSelectedSquad] = useState<TeamWithDetails | null>(null)
  const [squadResources, setSquadResources] = useState<any[]>([])

  useEffect(() => {
    if (!selectedSquad) {
      setSquadResources([])
      return
    }
    let isSubscribed = true
    erpApi.getTeamResources(selectedSquad.id)
      .then((res) => {
        if (isSubscribed && Array.isArray(res)) {
          setSquadResources(res)
        }
      })
      .catch(() => {
        if (isSubscribed) setSquadResources([])
      })
    return () => {
      isSubscribed = false
    }
  }, [selectedSquad?.id])

  const currentCount = useMemo(
    () =>
      teams.filter(
        (t) =>
          t.health !== 'paused' && t.health !== 'suspended' && t.health !== 'completed',
      ).length,
    [teams],
  )
  const previousCount = useMemo(
    () =>
      teams.filter(
        (t) =>
          t.health === 'paused' || t.health === 'suspended' || t.health === 'completed',
      ).length,
    [teams],
  )

  const activeSelectedSquad = useMemo(() => {
    if (!selectedSquad) return null
    return teams.find((t) => t.id === selectedSquad.id) || selectedSquad
  }, [teams, selectedSquad])

  // Create Squad Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [newSquadName, setNewSquadName] = useState('')
  const [newSquadCode, setNewSquadCode] = useState('')
  const [newPmId, setNewPmId] = useState('')
  const [newMemberIds, setNewMemberIds] = useState<string[]>([])
  const [newProjectIds, setNewProjectIds] = useState<string[]>([])

  // Edit Squad Modal State
  const [editingSquad, setEditingSquad] = useState<TeamWithDetails | null>(null)
  const [editSquadName, setEditSquadName] = useState('')
  const [editSquadCode, setEditSquadCode] = useState('')
  const [editPmId, setEditPmId] = useState('')
  const [editHealth, setEditHealth] = useState('on_track')
  const [editMemberIds, setEditMemberIds] = useState<string[]>([])
  const [editProjectIds, setEditProjectIds] = useState<string[]>([])

  const filteredTeams = useMemo(() => {
    return teams.filter((t) => {
      const isPausedOrSuspended =
        t.health === 'paused' || t.health === 'suspended' || t.health === 'completed'
      if (statusFilter === 'current' && isPausedOrSuspended) return false
      if (statusFilter === 'previous' && !isPausedOrSuspended) return false

      if (!searchQuery.trim()) return true
      const q = searchQuery.toLowerCase()
      return (
        t.name.toLowerCase().includes(q) ||
        t.code.toLowerCase().includes(q) ||
        (t.pm?.name || '').toLowerCase().includes(q)
      )
    })
  }, [teams, statusFilter, searchQuery])

  const handleOpenEdit = (squad: TeamWithDetails) => {
    setEditingSquad(squad)
    setEditSquadName(squad.name)
    setEditSquadCode(squad.code)
    setEditPmId(squad.pmId || '')
    setEditHealth(squad.health || 'on_track')
    setEditMemberIds(squad.memberIds || [])
    setEditProjectIds(squad.projectIds || [])
  }

  const [pendingSquadConfirm, setPendingSquadConfirm] = useState<
    | { mode: 'create' }
    | { mode: 'edit'; squadId: string; squadName: string }
    | null
  >(null)

  const handleSaveCreate = (e: React.FormEvent) => {
    e.preventDefault()
    const cleanName = newSquadName.trim()
    const cleanCode = newSquadCode.trim().toUpperCase()
    if (cleanName.length < 2 || cleanName.length > 100) {
      showToast('Squad name must be between 2 and 100 characters.', 'error')
      return
    }
    if (/^\d+$/.test(cleanName)) {
      showToast('Squad name must include letters, not numbers only.', 'error')
      return
    }
    if (!/^[A-Z0-9-]{2,16}$/.test(cleanCode)) {
      showToast('Squad code must be 2–16 letters, numbers, or hyphens (e.g. SQ-07).', 'error')
      return
    }
    setPendingSquadConfirm({ mode: 'create' })
  }

  const executeSquadConfirm = () => {
    if (!pendingSquadConfirm) return
    if (pendingSquadConfirm.mode === 'create') {
      createTeam({
        name: newSquadName.trim(),
        code: newSquadCode.trim().toUpperCase(),
        focus: 'General software engineering and delivery',
        pmId: newPmId || undefined,
        memberIds: newMemberIds,
        projectIds: newProjectIds,
      })
      setIsCreateModalOpen(false)
      setNewSquadName('')
      setNewSquadCode('')
      setNewPmId('')
      setNewMemberIds([])
      setNewProjectIds([])
    } else if (editingSquad) {
      updateTeam(editingSquad.id, {
        name: editSquadName.trim(),
        code: editSquadCode.trim().toUpperCase(),
        pmId: editPmId || '',
        health: editHealth,
        memberIds: editMemberIds,
        projectIds: editProjectIds,
      })
      setEditingSquad(null)
    }
    setPendingSquadConfirm(null)
  }

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingSquad) return
    const cleanName = editSquadName.trim()
    const cleanCode = editSquadCode.trim().toUpperCase()
    if (cleanName.length < 2 || cleanName.length > 100 || /^\d+$/.test(cleanName)) {
      showToast('Squad name must be 2–100 characters and include letters.', 'error')
      return
    }
    if (!/^[A-Z0-9-]{2,16}$/.test(cleanCode)) {
      showToast('Squad code must be 2–16 letters, numbers, or hyphens.', 'error')
      return
    }
    setPendingSquadConfirm({
      mode: 'edit',
      squadId: editingSquad.id,
      squadName: cleanName,
    })
  }

  const toggleCreateMember = (devId: string) => {
    setNewMemberIds((prev) =>
      prev.includes(devId) ? prev.filter((id) => id !== devId) : [...prev, devId],
    )
  }

  const toggleCreateProject = (projId: string) => {
    setNewProjectIds((prev) =>
      prev.includes(projId) ? prev.filter((id) => id !== projId) : [...prev, projId],
    )
  }

  const toggleEditMember = (devId: string) => {
    setEditMemberIds((prev) =>
      prev.includes(devId) ? prev.filter((id) => id !== devId) : [...prev, devId],
    )
  }

  const toggleEditProject = (projId: string) => {
    setEditProjectIds((prev) =>
      prev.includes(projId) ? prev.filter((id) => id !== projId) : [...prev, projId],
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white font-display">
            Engineering Squads &amp; Teams
          </h2>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">
            Organize cross-functional squads, project leads, and sprint allocation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canCreateSquad && (
            <Button
              variant="brand"
              size="sm"
              icon={Plus}
              onClick={() => setIsCreateModalOpen(true)}
            >
              Create New Squad
            </Button>
          )}
        </div>
      </div>

      {/* Top 4 Metric Pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <div className="text-base font-bold text-slate-900 dark:text-slate-100">
              {teams.length} Squads
            </div>
            <div className="text-[11px] text-slate-400">Total Teams</div>
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 flex items-center justify-center">
            <UserCheck className="w-4 h-4" />
          </div>
          <div>
            <div className="text-base font-bold text-slate-900 dark:text-slate-100">
              {developers.length} Developers
            </div>
            <div className="text-[11px] text-slate-400">Active Engineers</div>
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-lime-50 dark:bg-lime-950/40 text-lime-600 dark:text-lime-400 flex items-center justify-center">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <div className="text-base font-bold text-slate-900 dark:text-slate-100">
              {projectManagers.length} PMs
            </div>
            <div className="text-[11px] text-slate-400">Assigned Managers</div>
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <FolderGit2 className="w-4 h-4" />
          </div>
          <div>
            <div className="text-base font-bold text-slate-900 dark:text-slate-100">
              {projects.length} Projects
            </div>
            <div className="text-[11px] text-slate-400">Active Tasks</div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white dark:bg-slate-900/60 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search squads by name, code, or PM..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-lime-500"
          />
        </div>

        {/* Squad Status Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1 rounded-xl font-medium whitespace-nowrap transition-colors cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            All Squads ({teams.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('current')}
            className={`px-3 py-1 rounded-xl font-medium whitespace-nowrap transition-colors cursor-pointer ${
              statusFilter === 'current'
                ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Current Squads ({currentCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('previous')}
            className={`px-3 py-1 rounded-xl font-medium whitespace-nowrap transition-colors cursor-pointer ${
              statusFilter === 'previous'
                ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Previous / Paused ({previousCount})
          </button>
        </div>
      </div>

      {/* Squad Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredTeams.map((squad) => {
          const completionRate =
            squad.tasksCount > 0
              ? Math.round((squad.completedTasksCount / squad.tasksCount) * 100)
              : 0

          return (
            <div
              key={squad.id}
              className="p-5 rounded-3xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-200 flex flex-col justify-between shadow-2xs group space-y-4"
            >
              <div className="space-y-3">
                {/* Header Row: Code & Squad Name & Status */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="indigo" size="xs">
                      {squad.code}
                    </Badge>
                    <span className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                      {squad.name.split('—')[0]}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {squad.health === 'paused' && (
                      <Badge variant="amber" size="xs">PAUSED</Badge>
                    )}
                    {squad.health === 'suspended' && (
                      <Badge variant="rose" size="xs">SUSPENDED</Badge>
                    )}
                    {squad.health === 'completed' && (
                      <Badge variant="slate" size="xs">COMPLETED</Badge>
                    )}
                    <Badge variant="slate" size="xs">
                      {squad.members.length} Devs
                    </Badge>
                  </div>
                </div>

                {/* Assigned PM */}
                <div className="flex items-center justify-between text-xs py-2 px-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                  <span className="text-[11px] text-slate-400 font-medium">Project Manager</span>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Avatar
                      src={squad.pm?.avatarUrl || squad.pm?.avatar}
                      name={squad.pm?.name || 'Project Manager'}
                      initials={squad.pm?.initials}
                      size="xs"
                    />
                    <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs truncate">
                      {squad.pm?.name || 'Unassigned'}
                    </span>
                  </div>
                </div>

                {/* Assigned Projects */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Assigned Projects ({squad.projects.length})
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {squad.projects.length === 0 ? (
                      <span className="text-[11px] text-slate-400 italic">
                        No projects assigned
                      </span>
                    ) : (
                      squad.projects.map((proj) => (
                        <span
                          key={proj.id}
                          className="text-[10px] px-2 py-0.5 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-mono flex items-center gap-1 border border-indigo-100 dark:border-indigo-800/40"
                        >
                          <FolderGit2 className="w-3 h-3" />
                          {proj.code}
                        </span>
                      ))
                    )}
                  </div>
                </div>

                {/* Task Completion Progress Bar */}
                <div className="space-y-1 pt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Task Completion</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      {squad.completedTasksCount} / {squad.tasksCount} ({completionRate}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-lime-500 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${completionRate}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Footer: Member avatars + Actions */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center -space-x-1.5 overflow-hidden">
                  {squad.members.slice(0, 5).map((member) => (
                    <Avatar
                      key={member.id}
                      src={member.avatarUrl || member.avatar}
                      name={member.name}
                      initials={member.initials}
                      title={`${member.name} (${member.title})`}
                      className="w-6 h-6 text-[10px] ring-2 ring-white dark:ring-slate-900"
                    />
                  ))}
                  {squad.members.length > 5 && (
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 text-[10px] font-bold text-slate-700 dark:text-slate-200 ring-2 ring-white dark:ring-slate-900">
                      +{squad.members.length - 5}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  {canManageSquad && (
                    <Button
                      variant="ghost"
                      size="xs"
                      icon={Edit2}
                      onClick={() => handleOpenEdit(squad)}
                    >
                      Edit
                    </Button>
                  )}
                  <Button variant="secondary" size="xs" onClick={() => setSelectedSquad(squad)}>
                    Inspect
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Create Squad Modal */}
      {isCreateModalOpen && (
        <Modal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          title="Create New Engineering Squad"
        >
          <form onSubmit={handleSaveCreate} className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Squad Name *
                </label>
                <input
                  type="text"
                  value={newSquadName}
                  onChange={(e) => setNewSquadName(e.target.value)}
                  placeholder="e.g. Squad Theta — Quantum Services"
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-slate-400"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Squad Code *
                </label>
                <input
                  type="text"
                  value={newSquadCode}
                  onChange={(e) => setNewSquadCode(e.target.value)}
                  placeholder="e.g. SQ-07"
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-slate-400 uppercase"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                Assigned PM
              </label>
              <select
                value={newPmId}
                onChange={(e) => setNewPmId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-slate-400"
              >
                <option value="">Unassigned</option>
                {pmEligibleUsers.map((pm) => (
                  <option key={pm.id} value={pm.id}>
                    {pm.name} ({pm.title || 'Project Manager'})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                Assign Projects
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-32 overflow-y-auto p-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                {projects.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-[11px] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newProjectIds.includes(p.id)}
                      onChange={() => toggleCreateProject(p.id)}
                      className="rounded accent-lime-500"
                    />
                    <span className="truncate">
                      {p.code} — {p.name}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                Assign Squad Members (Any Company Personnel or Leadership)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-36 overflow-y-auto p-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                {allCompanyPersonnel.map((person) => (
                  <label
                    key={person.id}
                    className="flex items-center gap-2 text-[11px] cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/60 p-1 rounded-lg transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={newMemberIds.includes(person.id)}
                      onChange={() => toggleCreateMember(person.id)}
                      className="rounded accent-lime-500"
                    />
                    <span className="truncate">
                      {person.name} <span className="text-[10px] text-slate-400">({person.title || person.role?.toUpperCase()})</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setIsCreateModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="lime" size="sm" icon={Plus}>
                Create Squad
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Squad Modal */}
      {editingSquad && (
        <Modal
          isOpen={!!editingSquad}
          onClose={() => setEditingSquad(null)}
          title={`Edit Squad — ${editingSquad.name}`}
        >
          <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Squad Name
                </label>
                <input
                  type="text"
                  value={editSquadName}
                  onChange={(e) => setEditSquadName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-slate-400"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Squad Code
                </label>
                <input
                  type="text"
                  value={editSquadCode}
                  onChange={(e) => setEditSquadCode(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-slate-400 uppercase"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Assigned PM
                </label>
                <select
                  value={editPmId}
                  onChange={(e) => setEditPmId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-slate-400"
                >
                  <option value="">Unassigned</option>
                  {pmEligibleUsers.map((pm) => (
                    <option key={pm.id} value={pm.id}>
                      {pm.name} ({pm.title || 'Project Manager'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Squad Lifecycle &amp; State
                </label>
                <select
                  value={editHealth}
                  onChange={(e) => setEditHealth(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-slate-400"
                >
                  <option value="on_track">Active Sprint (On Track)</option>
                  <option value="needs_attention">Active Sprint (Needs Attention)</option>
                  <option value="delayed">Active Sprint (Delayed)</option>
                  <option value="paused">Paused Squad</option>
                  <option value="suspended">Suspended Squad</option>
                  <option value="completed">Completed / Previous Squad</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                Assigned Projects
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-32 overflow-y-auto p-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                {projects.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-[11px] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editProjectIds.includes(p.id)}
                      onChange={() => toggleEditProject(p.id)}
                      className="rounded accent-lime-500"
                    />
                    <span className="truncate">
                      {p.code} — {p.name}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                Squad Members (Any Company Personnel or Leadership)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-36 overflow-y-auto p-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                {allCompanyPersonnel.map((person) => (
                  <label
                    key={person.id}
                    className="flex items-center gap-2 text-[11px] cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/60 p-1 rounded-lg transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={editMemberIds.includes(person.id)}
                      onChange={() => toggleEditMember(person.id)}
                      className="rounded accent-lime-500"
                    />
                    <span className="truncate">
                      {person.name} <span className="text-[10px] text-slate-400">({person.title || person.role?.toUpperCase()})</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setEditingSquad(null)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="lime" size="sm" icon={CheckCircle2}>
                Save Squad Changes
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Squad Inspection Modal */}
      {activeSelectedSquad && (() => {
        const memberIds = new Set(activeSelectedSquad.members.map((m) => m.id))
        const projectIds = new Set(activeSelectedSquad.projects.map((p) => p.id))
        const squadTasks = (data.tasks || []).filter(
          (t) =>
            (t.assigneeId && memberIds.has(t.assigneeId)) ||
            (t.projectId && projectIds.has(t.projectId)) ||
            (Boolean((t as any).teamId) && (t as any).teamId === activeSelectedSquad.id),
        )

        const squadTaskIds = new Set(squadTasks.map((t) => t.id))
        const squadMovementLogs = (data.activityLogs || []).filter((log: any) => {
          const isMovement =
            log.action === 'TASK_STATUS_CHANGED' ||
            log.actionCode === 'TASK_STATUS_TRANSITION' ||
            (log.description || '').toLowerCase().includes('status updated from') ||
            Boolean(log.payload?.toStatus)

          if (!isMovement) return false

          if (log.payload?.teamName?.toLowerCase() === activeSelectedSquad.name.toLowerCase()) {
            return true
          }
          if (squadTaskIds.has(log.entityId)) {
            return true
          }
          const desc = (log.description || '').toLowerCase()
          const title = (log.entityTitle || '').toLowerCase()
          const nameLower = activeSelectedSquad.name.toLowerCase()
          const codeLower = activeSelectedSquad.code.toLowerCase()
          if (
            desc.includes(`(squad: ${nameLower})`) ||
            desc.includes(`[${nameLower}]`) ||
            desc.includes(`[${codeLower}]`) ||
            title.includes(`[${nameLower}]`) ||
            title.includes(`[${codeLower}]`)
          ) {
            return true
          }
          return false
        })

        const columns = [
          { id: 'todo', label: 'To Do', dot: 'bg-slate-400' },
          { id: 'in_progress', label: 'In Progress', dot: 'bg-sky-500' },
          { id: 'in_review', label: 'In Review', dot: 'bg-purple-500' },
          { id: 'completed', label: 'Completed', dot: 'bg-emerald-500' },
          { id: 'blocked', label: 'Blocked', dot: 'bg-rose-500' },
        ]

        return (
          <Modal
            isOpen={!!activeSelectedSquad}
            onClose={() => setSelectedSquad(null)}
            title={
              activeSelectedSquad
                ? `${activeSelectedSquad.name} (${activeSelectedSquad.code}) — Squad Task Board`
                : 'Squad'
            }
          >
            <div className="space-y-4 text-xs">
              {/* Tab Switcher: Kanban Board vs Squad Roster */}
              <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
                <button
                  type="button"
                  onClick={() => setInspectTab('kanban')}
                  className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                    inspectTab === 'kanban'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Kanban className="w-3.5 h-3.5" />
                  <span>Kanban Board ({squadTasks.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInspectTab('roster')}
                  className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                    inspectTab === 'roster'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Squad Overview &amp; Roster</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInspectTab('logs')}
                  className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                    inspectTab === 'logs'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <History className="w-3.5 h-3.5" />
                  <span>Movement Logs</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInspectTab('resources')}
                  className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                    inspectTab === 'resources'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Link2 className="w-3.5 h-3.5" />
                  <span>Squad Resources ({squadResources.length})</span>
                </button>
              </div>

              {inspectTab === 'kanban' && (
                /* Squad Kanban Task Board View */
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-slate-400">
                    <span>PM: <strong>{activeSelectedSquad.pm?.name || 'Unassigned'}</strong></span>
                    <span>{squadTasks.filter((t) => t.status === 'completed').length} of {squadTasks.length} tasks completed</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5 overflow-x-auto pb-2">
                    {columns.map((col) => {
                      const colTasks = squadTasks.filter((t) => (t.status || 'todo') === col.id)
                      return (
                        <div
                          key={col.id}
                          className="bg-slate-50/70 dark:bg-slate-850/50 rounded-xl p-2.5 border border-slate-200/60 dark:border-slate-800 flex flex-col min-h-[220px]"
                        >
                          <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-200/60 dark:border-slate-800 font-semibold text-[11px] text-slate-700 dark:text-slate-300">
                            <span className="flex items-center gap-1.5">
                              <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                              {col.label}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-slate-700 font-mono">
                              {colTasks.length}
                            </span>
                          </div>

                          <div className="space-y-2 flex-1">
                            {colTasks.length === 0 ? (
                              <div className="h-full flex items-center justify-center text-[10px] text-slate-400 py-6 text-center italic">
                                Drop task here
                              </div>
                            ) : (
                              colTasks.map((task) => {
                                const assigneeUser = (data.users || []).find((u) => u.id === task.assigneeId)
                                return (
                                  <div
                                    key={task.id}
                                    onClick={() => setSelectedTaskModal(task)}
                                    className="p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xs hover:border-indigo-400 dark:hover:border-indigo-500 cursor-pointer space-y-1.5 transition-all"
                                  >
                                    <div className="font-semibold text-slate-900 dark:text-slate-100 text-[11px] line-clamp-2">
                                      {task.title}
                                    </div>
                                    <div className="flex items-center justify-between gap-1 text-[10px] text-slate-400">
                                      <Badge variant="indigo" size="xs">
                                        {Math.round((Number(task.weightPoints) || 2) * 10)} XP
                                      </Badge>
                                      <span className="capitalize text-[10px]">{task.priority || 'medium'}</span>
                                    </div>
                                    <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-700/60">
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        <Avatar
                                          src={assigneeUser?.avatarUrl || assigneeUser?.avatar}
                                          name={assigneeUser?.name || 'Engineer'}
                                          initials={assigneeUser?.initials}
                                          className="w-4 h-4 text-[9px]"
                                        />
                                        <span className="truncate text-[10px] text-slate-600 dark:text-slate-300">
                                          {assigneeUser?.name || 'Unassigned'}
                                        </span>
                                      </div>
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
              )}

              {inspectTab === 'logs' && (
                /* Team-Scoped Movement Logs */
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Task Status &amp; Deliverable Movement Logs</span>
                    <span>{squadMovementLogs.length} events recorded</span>
                  </div>
                  {squadMovementLogs.length === 0 ? (
                    <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/40 rounded-xl text-slate-400 italic">
                      No status movement logs recorded for this squad yet.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                      {squadMovementLogs.map((log: any) => {
                        const { sentence, relativeTime } = formatPlainEnglishLog(
                          log,
                          data.tasks,
                          currentUser?.id,
                        )
                        return (
                          <div
                            key={log.id}
                            className="p-3 rounded-xl bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 space-y-1"
                          >
                            <div className="flex items-center justify-between text-xs">
                              <div className="text-slate-800 dark:text-slate-100 font-medium">
                                {sentence}
                              </div>
                              <span className="text-[10px] text-slate-400 shrink-0 ml-2">
                                {relativeTime}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-slate-400 pt-0.5">
                              <span>
                                Squad:{' '}
                                <strong className="text-indigo-600 dark:text-indigo-400">
                                  {activeSelectedSquad.name}
                                </strong>
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {inspectTab === 'resources' && (
                /* Squad Resources */
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Squad Tasks, Repositories &amp; Links</span>
                    <span>{squadResources.length} resources</span>
                  </div>
                  {squadResources.length === 0 ? (
                    <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/40 rounded-xl text-slate-400 italic">
                      No resources registered for this squad yet.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                      {squadResources.map((res: any) => (
                        <div
                          key={res.id}
                          className="p-3 rounded-xl bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3"
                        >
                          <div className="space-y-1 min-w-0">
                            <a
                              href={res.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-semibold text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 truncate"
                            >
                              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">{res.title || res.url}</span>
                            </a>
                            {res.description && (
                              <p className="text-[11px] text-slate-600 dark:text-slate-300">
                                {res.description}
                              </p>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400 shrink-0">
                            {res.createdAt ? new Date(res.createdAt).toLocaleDateString() : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {inspectTab === 'roster' && (
                /* Roster Overview */
                <div className="space-y-4">
                  {/* PM Card */}
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
                    <span className="text-slate-400 font-medium">Assigned Project Manager</span>
                    <div className="flex items-center gap-2">
                      <Avatar
                        src={activeSelectedSquad.pm?.avatarUrl || activeSelectedSquad.pm?.avatar}
                        name={activeSelectedSquad.pm?.name || 'Project Manager'}
                        initials={activeSelectedSquad.pm?.initials}
                        className="w-6 h-6 text-[10px]"
                      />
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {activeSelectedSquad.pm?.name || 'Unassigned'}
                      </span>
                    </div>
                  </div>

                  {/* Members List */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                      Dedicated Engineers ({activeSelectedSquad.members.length})
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {activeSelectedSquad.members.map((member) => (
                        <div
                          key={member.id}
                          className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center gap-2"
                        >
                          <Avatar
                            src={member.avatarUrl || member.avatar}
                            name={member.name}
                            initials={member.initials}
                            className="w-8 h-8 text-xs"
                          />
                          <div>
                            <h5 className="font-semibold text-xs text-slate-900 dark:text-slate-100">
                              {member.name}
                            </h5>
                            <span className="text-[10px] text-slate-400 block">{member.title}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Active Projects */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                      Managed Projects ({activeSelectedSquad.projects.length})
                    </h4>
                    <div className="space-y-2">
                      {activeSelectedSquad.projects.map((p) => (
                        <div
                          key={p.id}
                          className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs"
                        >
                          <div>
                            <span className="font-semibold text-slate-900 dark:text-slate-100">
                              {p.code} — {p.name}
                            </span>
                            <p className="text-[11px] text-slate-400 line-clamp-1">{p.description}</p>
                          </div>
                          <span className="font-bold text-sky-600 dark:text-sky-400">{p.progress}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-3 border-t border-slate-200 dark:border-slate-800">
                <Button variant="ghost" size="sm" onClick={() => setSelectedSquad(null)}>
                  Close
                </Button>
              </div>
            </div>
          </Modal>
        )
      })()}

      {pendingSquadConfirm && (
        <ConfirmDialog
          isOpen={!!pendingSquadConfirm}
          onClose={() => setPendingSquadConfirm(null)}
          onConfirm={executeSquadConfirm}
          title={
            pendingSquadConfirm.mode === 'create'
              ? 'Create Engineering Squad?'
              : `Save changes to ${pendingSquadConfirm.squadName}?`
          }
          message={
            pendingSquadConfirm.mode === 'create'
              ? `Create squad "${newSquadName.trim()}" (${newSquadCode.trim().toUpperCase()}) with ${newMemberIds.length} member(s) and ${newPmId ? 'an assigned PM' : 'no PM assigned yet'}?`
              : `Update squad configuration, PM assignment, and roster (${editMemberIds.length} member(s))?`
          }
          confirmLabel={pendingSquadConfirm.mode === 'create' ? 'Create Squad' : 'Save Changes'}
        />
      )}
    </div>
  )
}
