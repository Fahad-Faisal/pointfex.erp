import { useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { getRelativeDeadline } from '../utils/formatters'
import type {
  User,
  Team,
  Task,
  Wallet,
  Transaction,
  PerformanceRecord,
  ActivityLog,
  Announcement,
  RelativeDeadline,
  Project,
  Repository,
} from '../types'

export interface DeveloperProject extends Project {
  repo: Repository | null
  pm: User | null
  totalTasksCount: number
  completedTasksCount: number
}

export interface TaskWithDeadline extends Task {
  deadlineInfo: RelativeDeadline
  projectName: string
  projectCode: string
}

export interface UrgentTaskOverview extends Task {
  deadlineInfo: RelativeDeadline
  project: Project | null
}

export interface DeveloperStats {
  totalTasks: number
  pendingTasks: number
  inProgressTasks: number
  inReviewTasks: number
  completedTasks: number
  blockedTasks: number
  assignedProjectsCount: number
  walletBalance: number
  pendingEscrow: number
}

export interface DeveloperData {
  dev: User | null
  team: Team | null
  pm: User | null
  teamMembers: User[]
  allDevTasks: Task[]
  stats: DeveloperStats
  devProjects: DeveloperProject[]
  wallet: Wallet
  transactions: Transaction[]
  performance: PerformanceRecord
  tasksWithDeadlines: TaskWithDeadline[]
  overdueTasks: TaskWithDeadline[]
  upcomingDeadlines: TaskWithDeadline[]
  urgentTasksOverview: UrgentTaskOverview[]
  recentActivities: ActivityLog[]
  announcements: Announcement[]
}

export function useDeveloperData(): DeveloperData {
  const { data, currentDevId, currentUser, resolvers } = useApp()

  return useMemo(() => {
    // Current developer
    const devId = currentUser?.id || currentDevId
    const dev = devId ? resolvers.getUser(devId) : null
    const team = dev?.teamId
      ? resolvers.getTeam(dev.teamId)
      : (devId ? data.teams.find((t) => t.memberIds.includes(devId)) : null) || null
    const pm = team ? resolvers.getUser(team.pmId) : null

    // Developer tasks
    const allDevTasks = devId ? resolvers.getDeveloperTasks(devId) : []

    // Task counts by status
    const pendingTasks = allDevTasks.filter((t) => t.status === 'todo')
    const inProgressTasks = allDevTasks.filter((t) => t.status === 'in_progress')
    const inReviewTasks = allDevTasks.filter((t) => t.status === 'in_review')
    const completedTasks = allDevTasks.filter((t) => t.status === 'completed')
    const blockedTasks = allDevTasks.filter((t) => t.status === 'blocked')

    // Projects assigned to dev/team
    const devProjects: DeveloperProject[] = (devId ? resolvers.getDeveloperProjects(devId) : []).map(
      (proj) => {
        const projRepo = proj.repoId ? resolvers.getRepo(proj.repoId) : null
        const projPM = resolvers.getUser(proj.pmId)
        const projTasks = data.tasks.filter((t) => t.projectId === proj.id)
        const projCompletedTasks = projTasks.filter((t) => t.status === 'completed')
        return {
          ...proj,
          repo: projRepo,
          pm: projPM,
          totalTasksCount: projTasks.length,
          completedTasksCount: projCompletedTasks.length,
        }
      },
    )

    // Virtual wallet & transactions
    const wallet: Wallet = (devId ? resolvers.getDeveloperWallet(devId) : null) || {
      userId: devId,
      balance: 0,
      currency: 'BDT',
      pendingEscrow: 0,
      totalEarnedToDate: 0,
    }
    const transactions = devId ? resolvers.getDeveloperTransactions(devId) : []

    // Performance record
    const performance: PerformanceRecord = (devId ? resolvers.getDeveloperPerformance(devId) : null) || {
      userId: devId,
      overallScore: 0,
      completionRate: 0,
      onTimeDeliveryRate: 0,
      recentRewards: [],
    }

    // Deadlines calculations (enrich with relative deadlines)
    const tasksWithDeadlines: TaskWithDeadline[] = allDevTasks
      .filter((t) => t.status !== 'completed')
      .map((task) => {
        const deadlineInfo = getRelativeDeadline(task.dueDate)
        const project = resolvers.getProject(task.projectId)
        return {
          ...task,
          deadlineInfo,
          projectName: project?.name || 'Project',
          projectCode: project?.code || 'PROJ',
        }
      })
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())

    // Urgent and overdue subsets
    const overdueTasks = tasksWithDeadlines.filter((t) => t.deadlineInfo.isOverdue)
    const upcomingDeadlines = tasksWithDeadlines.slice(0, 5)

    // Recent and urgent tasks for "My Tasks Overview"
    const urgentTasksOverview: UrgentTaskOverview[] = allDevTasks
      .map((t) => ({
        ...t,
        deadlineInfo: getRelativeDeadline(t.dueDate),
        project: resolvers.getProject(t.projectId),
      }))
      .sort((a, b) => {
        // Prioritize in_progress and urgent, then by date
        if (a.status === 'completed' && b.status !== 'completed') return 1
        if (a.status !== 'completed' && b.status === 'completed') return -1
        if (a.priority === 'urgent' && b.priority !== 'urgent') return -1
        if (a.priority !== 'urgent' && b.priority === 'urgent') return 1
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
      })
      .slice(0, 5)

    // Team members
    let teamMembers: User[] = team
      ? (team.memberIds.map((memberId) => resolvers.getUser(memberId)).filter(Boolean) as User[])
      : []

    if (team) {
      const additional = data.users.filter(
        (u) =>
          u.teamId === team.id &&
          !teamMembers.some((m) => m.id === u.id) &&
          u.id !== pm?.id &&
          u.role !== 'pm',
      )
      teamMembers = [...teamMembers, ...additional]
      if (dev && !teamMembers.some((m) => m.id === dev.id)) {
        teamMembers = [dev, ...teamMembers]
      }
    }

    // Recent activities (filtered for relevance to developer & team)
    const recentActivities = data.activityLogs.slice(0, 6)

    // Announcements
    const announcements = data.announcements

    return {
      dev,
      team,
      pm,
      teamMembers,
      allDevTasks,
      stats: {
        totalTasks: allDevTasks.length,
        pendingTasks: pendingTasks.length,
        inProgressTasks: inProgressTasks.length,
        inReviewTasks: inReviewTasks.length,
        completedTasks: completedTasks.length,
        blockedTasks: blockedTasks.length,
        assignedProjectsCount: devProjects.length,
        walletBalance: wallet.balance,
        pendingEscrow: wallet.pendingEscrow,
      },
      devProjects,
      wallet,
      transactions,
      performance,
      tasksWithDeadlines,
      overdueTasks,
      upcomingDeadlines,
      urgentTasksOverview,
      recentActivities,
      announcements,
    }
  }, [data, currentDevId, resolvers])
}
