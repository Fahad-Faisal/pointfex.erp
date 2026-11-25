import { useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { getRelativeDeadline } from '../utils/formatters'
import type {
  User,
  Team,
  Wallet,
  Transaction,
  ActivityLog,
  Announcement,
  Report,
  EnrichedProject,
  EnrichedTask,
  PullRequest,
  CodeQualityGate,
  SecurityAlert,
  TestingSuite,
  BugBountyItem,
  ConsultancyRequest,
  Repository,
} from '../types'

const C_LEVEL_ROLE_SLUGS = new Set(['ceo', 'cto', 'cfo', 'chro', 'cpo', 'coo', 'cmo', 'cro'])

export function isCLevelUser(user?: Pick<User, 'role' | 'activeRoleSlugs'> | null): boolean {
  if (!user) return false
  if (C_LEVEL_ROLE_SLUGS.has((user.role || '').toLowerCase())) return true
  return Boolean(
    user.activeRoleSlugs?.some((slug) => C_LEVEL_ROLE_SLUGS.has(slug.toLowerCase())),
  )
}

export function resolveCtoAccount(users: User[], currentUser: User | null): User | null {
  if (currentUser && (currentUser.role || '').toLowerCase() === 'cto') {
    return currentUser
  }
  return users.find((u) => (u.role || '').toLowerCase() === 'cto') ?? null
}

export function deriveCtoPersonalTasks(tasks: EnrichedTask[], actorId: string): EnrichedTask[] {
  if (!actorId) return []
  return tasks.filter((t) => t.assigneeId === actorId || t.assignedTo === actorId)
}

export function deriveCtoEngineeringTasks(
  tasks: EnrichedTask[],
  actorId: string,
  cLevelUserIds: Set<string>,
): EnrichedTask[] {
  return tasks.filter(
    (t) =>
      (Boolean(actorId) && t.creatorId === actorId) ||
      (Boolean(t.creatorId) && cLevelUserIds.has(t.creatorId)) ||
      isCLevelUser(t.creator) ||
      t.isMainProjectTask === false,
  )
}

export function computeCtoQualityStats(
  codeQualityGates: CodeQualityGate[],
  teams: Array<{ weeklyVelocity?: number | null }>,
): {
  averageQualityScore: number | null
  averageTestCoverage: number | null
  totalVelocity: number | null
} {
  const averageQualityScore =
    codeQualityGates.length > 0
      ? Math.round(
          codeQualityGates.reduce((sum, g) => sum + g.complianceScore, 0) /
            codeQualityGates.length,
        )
      : null

  const averageTestCoverage =
    codeQualityGates.length > 0
      ? Math.round(
          codeQualityGates.reduce((sum, g) => sum + g.testCoverage, 0) / codeQualityGates.length,
        )
      : null

  const measuredTeams = teams.filter(
    (t) => typeof t.weeklyVelocity === 'number' && Number.isFinite(t.weeklyVelocity),
  )
  const totalVelocity =
    measuredTeams.length > 0
      ? measuredTeams.reduce((sum, t) => sum + Number(t.weeklyVelocity), 0)
      : null

  return {
    averageQualityScore,
    averageTestCoverage,
    totalVelocity,
  }
}

export interface TeamWithDetails extends Team {
  pm?: User | null
  leadDev?: User | null
  members: User[]
  projects: EnrichedProject[]
  tasksCount: number
  completedTasksCount: number
  inProgressTasksCount: number
}

export interface CtoData {
  cto: User | null
  isCtoAccountMissing: boolean
  teams: TeamWithDetails[]
  projects: EnrichedProject[]
  tasks: EnrichedTask[]
  ctoPersonalTasks: EnrichedTask[]
  ctoEngineeringTasks: EnrichedTask[]
  repositories: Repository[]
  pullRequests: PullRequest[]
  codeQualityGates: CodeQualityGate[]
  securityAlerts: SecurityAlert[]
  testingSuites: TestingSuite[]
  bugBounties: BugBountyItem[]
  consultancyRequests: ConsultancyRequest[]
  incomingReports: Report[]
  ctoReports: Report[]
  allReports: Report[]
  auditLogs: ActivityLog[]
  ctoWallet: Wallet
  ctoTransactions: Transaction[]
  announcements: Announcement[]
  developers: User[]
  projectManagers: User[]
  pmEligibleUsers: User[]
  companyStats: {
    totalTeams: number
    totalDevelopers: number
    totalPms: number
    totalProjects: number
    totalTasks: number
    activeTasks: number
    inReviewTasks: number
    completedTasks: number
    blockedTasks: number
    openPullRequests: number
    securityAlertsCount: number
    criticalSecurityAlertsCount: number
    pendingConsultancies: number
    averageQualityScore: number | null
    averageTestCoverage: number | null
    totalVelocity: number | null
  }
}

export function useCtoData(): CtoData {
  const { data, resolvers, currentUser } = useApp()

  // 1. CTO User (no synthetic fallback user — surfaces explicit missing-account state)
  const cto = useMemo<User | null>(
    () => resolveCtoAccount(data.users, currentUser),
    [data.users, currentUser],
  )
  const isCtoAccountMissing = cto === null
  const actorId = currentUser?.id || cto?.id || ''

  const cLevelUserIds = useMemo(
    () => new Set(data.users.filter((u) => isCLevelUser(u)).map((u) => u.id)),
    [data.users],
  )

  // 2. Active Developers and Project Managers
  const developers = useMemo(() => {
    return data.users.filter((u) => u.role === 'developer' && !u.isSuspended)
  }, [data.users])

  const projectManagers = useMemo(() => {
    return data.users.filter(
      (u) => (u.role === 'pm' || u.activeRoleSlugs?.includes('pm')) && !u.isSuspended,
    )
  }, [data.users])

  const pmEligibleUsers = useMemo(() => {
    return data.users.filter((u) => {
      if (u.isSuspended) return false
      const role = (u.role || '').toLowerCase()
      const title = (u.title || '').toLowerCase()
      const isPm =
        role === 'pm' ||
        Boolean(u.activeRoleSlugs?.includes('pm')) ||
        title.includes('project manager')
      const isExecutive =
        ['ceo', 'cto', 'cfo', 'chro', 'cpo', 'coo', 'cmo', 'cro'].includes(role) ||
        Boolean(u.activeRoleSlugs?.some((r) =>
          ['ceo', 'cto', 'cfo', 'chro', 'cpo', 'coo', 'cmo', 'cro'].includes(r.toLowerCase()),
        )) ||
        title.includes('chief')
      return isPm || isExecutive
    })
  }, [data.users])

  // 3. Enriched Projects (all 12 company projects)
  const projects = useMemo<EnrichedProject[]>(() => {
    return data.projects.map((proj) => {
      const repo = data.repositories.find((r) => r.projectId === proj.id) || null
      const pm = data.users.find((u) => u.id === proj.pmId) || null
      const projTasks = data.tasks.filter((t) => t.projectId === proj.id)
      const assignedDevs = (proj.assignedDevIds || [])
        .map((id) => resolvers.getUser(id))
        .filter((u): u is User => Boolean(u))

      return {
        ...proj,
        repo,
        pm,
        totalTasksCount: projTasks.length,
        tasksCount: projTasks.length,
        completedTasksCount: projTasks.filter((t) => t.status === 'completed').length,
        inReviewTasksCount: projTasks.filter((t) => t.status === 'in_review').length,
        assignedDevs,
      }
    })
  }, [data.projects, data.repositories, data.tasks, data.users, resolvers])

  // 4. Enriched Tasks across entire company
  const tasks = useMemo<EnrichedTask[]>(() => {
    return data.tasks.map((task) => {
      const project = data.projects.find((p) => p.id === task.projectId) || null
      const assignee = data.users.find((u) => u.id === task.assigneeId) || null
      const creator = data.users.find((u) => u.id === task.creatorId) || null
      const deadlineInfo = getRelativeDeadline(task.dueDate)

      return {
        ...task,
        projectName: project?.name,
        projectCode: project?.code,
        project,
        assignee,
        creator,
        deadlineInfo,
      }
    })
  }, [data.tasks, data.projects, data.users])

  // 5. Executive / CTO Personal Tasks (assigned to current authenticated executive / CTO)
  const ctoPersonalTasks = useMemo(() => {
    return deriveCtoPersonalTasks(tasks, actorId)
  }, [tasks, actorId])

  // 6. CTO / C-Level Directives & Tasks (created by C-level executives or tagged as non-squad directives)
  const ctoEngineeringTasks = useMemo(() => {
    return deriveCtoEngineeringTasks(tasks, actorId, cLevelUserIds)
  }, [tasks, actorId, cLevelUserIds])

  // 7. Enriched Teams (all 6 squads)
  const teams = useMemo<TeamWithDetails[]>(() => {
    return data.teams.map((t) => {
      const pm = data.users.find((u) => u.id === t.pmId) || null
      const leadDev = t.leadDevId ? data.users.find((u) => u.id === t.leadDevId) || null : null
      const membersFromIds = (t.memberIds || [])
        .map((id) => data.users.find((u) => u.id === id))
        .filter((u): u is User => Boolean(u))
      const membersFromTeamId = data.users.filter(
        (u) =>
          u.teamId === t.id &&
          !membersFromIds.some((m) => m.id === u.id) &&
          u.id !== pm?.id &&
          u.role !== 'pm',
      )
      const members = [...membersFromIds, ...membersFromTeamId]
      const teamProjects = projects.filter(
        (p) => p.teamId === t.id || (t.projectIds && t.projectIds.includes(p.id)),
      )
      const teamTasks = tasks.filter((task) => members.some((m) => m.id === task.assigneeId))

      return {
        ...t,
        pm,
        leadDev,
        members,
        projects: teamProjects,
        tasksCount: teamTasks.length,
        completedTasksCount: teamTasks.filter((tk) => tk.status === 'completed').length,
        inProgressTasksCount: teamTasks.filter((tk) => tk.status === 'in_progress').length,
      }
    })
  }, [data.teams, data.users, projects, tasks])

  // 8. CTO Wallet & Financials
  const ctoWallet = useMemo<Wallet>(() => {
    return (
      data.wallets.find((w) => actorId && w.userId === actorId) || {
        userId: actorId,
        balance: 0,
        currency: 'BDT',
        pendingEscrow: 0,
        totalEarnedToDate: 0,
        totalPenalties: 0,
        totalSpendings: 0,
      }
    )
  }, [data.wallets, actorId])

  const ctoTransactions = useMemo<Transaction[]>(() => {
    return actorId ? data.transactions.filter((tx) => tx.userId === actorId) : []
  }, [data.transactions, actorId])

  // 9. Reports: Incoming (sent to CTO or category engineering) and Outgoing (sent by CTO)
  const incomingReports = useMemo<Report[]>(() => {
    return data.reports.filter(
      (r) =>
        r.recipient?.toLowerCase().includes('cto') ||
        r.recipient?.toLowerCase().includes('technology') ||
        r.forwardedTo?.toLowerCase().includes('cto') ||
        r.type === 'project_submission',
    )
  }, [data.reports])

  const ctoReports = useMemo<Report[]>(() => {
    return data.reports.filter(
      (r) => (Boolean(actorId) && (r.userId === actorId || r.authorId === actorId)) || r.type === 'cto_report',
    )
  }, [data.reports, actorId])

  // 10. Audit Logs
  const auditLogs = useMemo<ActivityLog[]>(() => {
    return [...data.activityLogs].sort((a, b) => {
      const ta =
        a.timestamp === 'Just now' ? Number.MAX_SAFE_INTEGER : new Date(a.timestamp).getTime()
      const tb =
        b.timestamp === 'Just now' ? Number.MAX_SAFE_INTEGER : new Date(b.timestamp).getTime()
      return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta)
    })
  }, [data.activityLogs])

  // 11. Company-wide Engineering Statistics
  const companyStats = useMemo(() => {
    const totalTasks = tasks.length
    const activeTasks = tasks.filter(
      (t) => t.status === 'in_progress' || t.status === 'todo',
    ).length
    const inReviewTasks = tasks.filter((t) => t.status === 'in_review').length
    const completedTasks = tasks.filter((t) => t.status === 'completed').length
    const blockedTasks = tasks.filter((t) => t.status === 'blocked').length
    const openPRs = data.pullRequests.filter(
      (pr) => pr.status === 'open' || pr.status === 'in_review',
    ).length
    const securityAlerts = data.securityAlerts.filter((s) => s.status !== 'resolved')
    const criticalSecurity = securityAlerts.filter((s) => s.severity === 'critical')
    const pendingConsultancies = data.consultancyRequests.filter(
      (c) => c.status === 'submitted' || c.status === 'under_review' || c.status === 'assigned',
    ).length

    const { averageQualityScore, averageTestCoverage, totalVelocity } = computeCtoQualityStats(
      data.codeQualityGates,
      teams,
    )

    return {
      totalTeams: teams.length,
      totalDevelopers: developers.length,
      totalPms: projectManagers.length,
      totalProjects: projects.length,
      totalTasks,
      activeTasks,
      inReviewTasks,
      completedTasks,
      blockedTasks,
      openPullRequests: openPRs,
      securityAlertsCount: securityAlerts.length,
      criticalSecurityAlertsCount: criticalSecurity.length,
      pendingConsultancies,
      averageQualityScore,
      averageTestCoverage,
      totalVelocity,
    }
  }, [
    tasks,
    data.pullRequests,
    data.securityAlerts,
    data.consultancyRequests,
    data.codeQualityGates,
    teams,
    developers.length,
    projectManagers.length,
    projects.length,
  ])

  return {
    cto,
    isCtoAccountMissing,
    teams,
    projects,
    tasks,
    ctoPersonalTasks,
    ctoEngineeringTasks,
    repositories: data.repositories,
    pullRequests: data.pullRequests,
    codeQualityGates: data.codeQualityGates,
    securityAlerts: data.securityAlerts,
    testingSuites: data.testingSuites,
    bugBounties: data.bugBounties,
    consultancyRequests: data.consultancyRequests,
    incomingReports,
    ctoReports,
    allReports: data.reports,
    auditLogs,
    ctoWallet,
    ctoTransactions,
    announcements: data.announcements,
    developers,
    projectManagers,
    pmEligibleUsers,
    companyStats,
  }
}
