import React, { useState, useMemo, useEffect } from 'react'
import {
  FileText,
  Calendar,
  Send,
  CheckCircle2,
  Plus,
  Lightbulb,
  MessageSquarePlus,
  ThumbsUp,
  XCircle,
  Lock,
  Pencil,
} from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { Card } from '../../components/common/Card'
import { Badge } from '../../components/common/Badge'
import { Button } from '../../components/common/Button'
import { Modal } from '../../components/common/Modal'
import { formatDate } from '../../utils/formatters'

export interface LeaveRequestItem {
  id: string
  employeeId: string
  employeeName: string
  employeeRole: string
  employeeAvatar?: string
  leaveType: 'annual' | 'sick' | 'personal' | 'bereavement' | 'unpaid' | 'custom'
  startDate: string
  endDate: string
  daysCount: number
  reason: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  submittedAt: string
  approvedBy?: string
}

export interface IdeaSubmissionItem {
  id: string
  title: string
  category: 'Architecture' | 'Internal Tooling' | 'Security' | 'AI / Automation' | 'Product Feature' | 'R&D'
  description: string
  impact: string
  submitterId: string
  submitterName: string
  submitterRole: string
  submitterAvatar?: string
  submittedAt: string
  status: 'PROPOSED' | 'UNDER_REVIEW' | 'ACCEPTED' | 'REJECTED' | 'SCHEDULED'
  upvotes: number
  hasUpvoted?: boolean
}

export interface CompanySuggestionItem {
  id: string
  title: string
  topic: 'Engineering Process' | 'Workplace & Culture' | 'Hardware & Equipment' | 'Company Policy'
  details: string
  proposedSolution: string
  submitterName: string
  isAnonymous: boolean
  submittedAt: string
  status: 'NEW' | 'IN_REVIEW' | 'IMPLEMENTED'
  upvotes: number
  hasUpvoted?: boolean
}

interface SubmissionsLeavePageProps {
  initialTab?: 'submissions' | 'leave' | 'ideas' | 'suggestions'
}

export function SubmissionsLeavePage({ initialTab = 'leave' }: SubmissionsLeavePageProps) {
  const { data, currentUser, currentRole, showToast, can } = useApp()
  const [activeTab, setActiveTab] = useState<'submissions' | 'leave' | 'ideas' | 'suggestions'>(initialTab)

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab)
    }
  }, [initialTab])

  // Strict Authority: Only CEO and CHRO can approve or reject leave requests
  const isCeoOrChro = useMemo(() => {
    const role = (currentUser?.role || currentRole || '').toLowerCase()
    return role === 'ceo' || role === 'chro'
  }, [currentUser?.role, currentRole])

  // Review Authority for Project & Idea Submissions: PM and Executives
  const isReviewerOrPm = useMemo(() => {
    const role = (currentUser?.role || currentRole || '').toLowerCase()
    return ['pm', 'cto', 'ceo', 'chro', 'cfo', 'cpo'].includes(role) || can('reports:triage') || can('projects:update')
  }, [currentUser?.role, currentRole, can])

  // ==========================================
  // 1. LEAVE REQUESTS STATE
  // ==========================================
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequestItem[]>([
    {
      id: 'leave_1',
      employeeId: 'emp_developer_01',
      employeeName: 'Pramit Datta',
      employeeRole: 'Software Developer',
      leaveType: 'annual',
      startDate: '2026-11-26',
      endDate: '2026-11-29',
      daysCount: 3,
      reason: 'Scheduled rest & recuperation after sprint launch',
      status: 'APPROVED',
      submittedAt: '2026-11-17T09:00:00.000Z',
      approvedBy: 'Soyebuzaman Naim (CHRO)',
    },
    {
      id: 'leave_2',
      employeeId: 'emp_pm_01',
      employeeName: 'Fahim Uddin',
      employeeRole: 'Software Developer & PM',
      leaveType: 'personal',
      startDate: '2026-11-28',
      endDate: '2026-11-29',
      daysCount: 2,
      reason: 'Urgent family ceremony in Chattogram',
      status: 'PENDING',
      submittedAt: '2026-11-20T10:15:00.000Z',
    },
    {
      id: 'leave_3',
      employeeId: 'emp_developer_02',
      employeeName: 'Jihad Mia',
      employeeRole: 'Software Developer',
      leaveType: 'sick',
      startDate: '2026-11-07',
      endDate: '2026-11-08',
      daysCount: 1,
      reason: 'Severe seasonal fever & doctor appointment',
      status: 'APPROVED',
      submittedAt: '2026-11-06T08:30:00.000Z',
      approvedBy: 'Chief Executive Officer (CEO)',
    },
  ])

  // Leave Request Modal State
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false)
  const [leaveType, setLeaveType] = useState<LeaveRequestItem['leaveType']>('annual')
  const [startDate, setStartDate] = useState('2026-11-25')
  const [endDate, setEndDate] = useState('2026-11-27')
  const [leaveReason, setLeaveReason] = useState('')

  const handleCreateLeave = (e: React.FormEvent) => {
    e.preventDefault()
    if (!leaveReason.trim()) {
      showToast('Please provide a reason for the leave request', 'warning')
      return
    }

    const start = new Date(startDate)
    const end = new Date(endDate)
    const diffTime = Math.abs(end.getTime() - start.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1

    const newRequest: LeaveRequestItem = {
      id: `leave_${Date.now()}`,
      employeeId: currentUser?.id || 'emp_guest',
      employeeName: currentUser?.name || 'Staff Member',
      employeeRole: currentUser?.role?.toUpperCase() || 'DEVELOPER',
      employeeAvatar: currentUser?.avatarUrl || (currentUser as any)?.avatar,
      leaveType,
      startDate,
      endDate,
      daysCount: diffDays,
      reason: leaveReason.trim(),
      status: 'PENDING',
      submittedAt: new Date().toISOString(),
    }

    setLeaveRequests((prev) => [newRequest, ...prev])
    setIsLeaveModalOpen(false)
    setLeaveReason('')
    showToast('Leave request submitted. Awaiting approval from CEO / CHRO.', 'success')
  }

  const handleApproveLeave = (id: string) => {
    if (!isCeoOrChro) {
      showToast('Permission denied: Only CEO and CHRO can approve leave requests.', 'error')
      return
    }
    const isCeoActor =
      (currentUser?.role || currentRole || '').toLowerCase() === 'ceo' ||
      currentUser?.role === 'system:root'
    const approverTitle = isCeoActor ? 'CEO (Finalized — CHRO Waived)' : 'CHRO'
    const approverName = currentUser?.name ? `${currentUser.name} (${approverTitle})` : approverTitle
    setLeaveRequests((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, status: 'APPROVED', approvedBy: approverName } : r,
      ),
    )
    showToast(
      isCeoActor
        ? 'Leave request approved and finalized by CEO (No CHRO approval needed).'
        : 'Leave request approved by CHRO.',
      'success',
    )
  }

  const handleRejectLeave = (id: string) => {
    if (!isCeoOrChro) {
      showToast('Permission denied: Only CEO and CHRO can reject leave requests.', 'error')
      return
    }
    const approverName = currentUser?.name || (currentRole === 'ceo' ? 'CEO' : 'CHRO')
    setLeaveRequests((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, status: 'REJECTED', approvedBy: `${approverName} (${currentRole.toUpperCase()})` } : r,
      ),
    )
    showToast('Leave request rejected.', 'info')
  }

  // ==========================================
  // 2. PROJECT & IDEA SUBMISSIONS STATE
  // ==========================================
  const [ideaSubmissions, setIdeaSubmissions] = useState<IdeaSubmissionItem[]>([
    {
      id: 'idea_1',
      title: 'Prisma Read-Replica Multi-Region Cluster for Sub-10ms Queries',
      category: 'Architecture',
      description:
        'Deploy Postgres read replicas on Neon across APAC & EU regions with automated query routing to offload primary database traffic during peak hours.',
      impact: 'Reduces p99 database response latency by 65% and guarantees zero read contention on high-volume reporting dashboards.',
      submitterId: 'emp_cto_01',
      submitterName: 'A.R.M Abir Hasan',
      submitterRole: 'Chief Technology Officer',
      submittedAt: '2026-11-18T14:20:00.000Z',
      status: 'ACCEPTED',
      upvotes: 14,
      hasUpvoted: true,
    },
    {
      id: 'idea_2',
      title: 'Automated AI Pull Request Security & Quality Review Bot',
      category: 'Internal Tooling',
      description:
        'Integrate a lightweight Gemini 2.5 Flash agent hook into our CI/CD pipeline to evaluate PRs against our security rules and lint benchmarks before merge.',
      impact: 'Eliminates 80% of human review boilerplate and detects OWASP vulnerabilities directly in GitHub PR comments.',
      submitterId: 'emp_pm_01',
      submitterName: 'Fahim Uddin',
      submitterRole: 'Project Manager',
      submittedAt: '2026-11-19T11:45:00.000Z',
      status: 'UNDER_REVIEW',
      upvotes: 19,
      hasUpvoted: false,
    },
    {
      id: 'idea_3',
      title: 'Client Self-Service SRS & Milestone Sign-Off Portal',
      category: 'Product Feature',
      description:
        'Create a dedicated client portal allowing external stakeholders to review sprint progress, approve milestone deliverables, and inspect SRS specifications.',
      impact: 'Enhances transparency for enterprise advisory clients and streamlines CFO invoice dispatch upon milestone completion.',
      submitterId: 'emp_developer_01',
      submitterName: 'Pramit Datta',
      submitterRole: 'Software Developer',
      submittedAt: '2026-11-20T08:10:00.000Z',
      status: 'PROPOSED',
      upvotes: 8,
      hasUpvoted: false,
    },
  ])

  // Idea Modal State
  const [isIdeaModalOpen, setIsIdeaModalOpen] = useState(false)
  const [ideaTitle, setIdeaTitle] = useState('')
  const [ideaCategory, setIdeaCategory] = useState<IdeaSubmissionItem['category']>('Architecture')
  const [ideaDesc, setIdeaDesc] = useState('')
  const [ideaImpact, setIdeaImpact] = useState('')

  const handleCreateIdea = (e: React.FormEvent) => {
    e.preventDefault()
    if (!ideaTitle.trim() || !ideaDesc.trim()) {
      showToast('Please enter an idea title and description.', 'warning')
      return
    }

    const newIdea: IdeaSubmissionItem = {
      id: `idea_${Date.now()}`,
      title: ideaTitle.trim(),
      category: ideaCategory,
      description: ideaDesc.trim(),
      impact: ideaImpact.trim() || 'Accelerates engineering delivery and system resilience.',
      submitterId: currentUser?.id || 'emp_guest',
      submitterName: currentUser?.name || 'Engineer',
      submitterRole: currentUser?.role?.toUpperCase() || 'DEVELOPER',
      submitterAvatar: currentUser?.avatarUrl || (currentUser as any)?.avatar,
      submittedAt: new Date().toISOString(),
      status: 'PROPOSED',
      upvotes: 1,
      hasUpvoted: true,
    }

    setIdeaSubmissions((prev) => [newIdea, ...prev])
    setIsIdeaModalOpen(false)
    setIdeaTitle('')
    setIdeaDesc('')
    setIdeaImpact('')
    showToast('Project idea submitted to Engineering for evaluation!', 'success')
  }

  const handleToggleIdeaUpvote = (id: string) => {
    setIdeaSubmissions((prev) =>
      prev.map((idea) => {
        if (idea.id === id) {
          const nextVoted = !idea.hasUpvoted
          return {
            ...idea,
            hasUpvoted: nextVoted,
            upvotes: nextVoted ? idea.upvotes + 1 : Math.max(0, idea.upvotes - 1),
          }
        }
        return idea
      }),
    )
  }

  const handleAcceptIdea = (id: string) => {
    if (!isReviewerOrPm) {
      showToast('Permission denied: Only Project Managers and Executives can review ideas.', 'error')
      return
    }
    setIdeaSubmissions((prev) =>
      prev.map((idea) => (idea.id === id ? { ...idea, status: 'ACCEPTED' } : idea)),
    )
    showToast('Idea accepted and approved for roadmap consideration!', 'success')
  }

  const handleRejectIdea = (id: string) => {
    if (!isReviewerOrPm) {
      showToast('Permission denied: Only Project Managers and Executives can review ideas.', 'error')
      return
    }
    setIdeaSubmissions((prev) =>
      prev.map((idea) => (idea.id === id ? { ...idea, status: 'REJECTED' } : idea)),
    )
    showToast('Idea rejected.', 'info')
  }

  // Edit Idea State
  const [editingIdea, setEditingIdea] = useState<IdeaSubmissionItem | null>(null)
  const [isEditIdeaModalOpen, setIsEditIdeaModalOpen] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editCategory, setEditCategory] = useState<IdeaSubmissionItem['category']>('Architecture')
  const [editDesc, setEditDesc] = useState('')
  const [editImpact, setEditImpact] = useState('')

  const handleOpenEditIdea = (idea: IdeaSubmissionItem) => {
    setEditingIdea(idea)
    setEditTitle(idea.title)
    setEditCategory(idea.category)
    setEditDesc(idea.description)
    setEditImpact(idea.impact)
    setIsEditIdeaModalOpen(true)
  }

  const handleSaveEditIdea = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingIdea) return
    if (!editTitle.trim() || !editDesc.trim()) {
      showToast('Please provide an idea title and description.', 'warning')
      return
    }
    setIdeaSubmissions((prev) =>
      prev.map((item) =>
        item.id === editingIdea.id
          ? {
              ...item,
              title: editTitle.trim(),
              category: editCategory,
              description: editDesc.trim(),
              impact: editImpact.trim(),
            }
          : item,
      ),
    )
    setIsEditIdeaModalOpen(false)
    setEditingIdea(null)
    showToast('Idea updated successfully.', 'success')
  }

  // ==========================================
  // 3. COMPANY SUGGESTIONS STATE
  // ==========================================
  const [suggestions, setSuggestions] = useState<CompanySuggestionItem[]>([
    {
      id: 'sug_1',
      title: 'Flexible Async Daily Standups for Autonomous Squad Execution',
      topic: 'Engineering Process',
      details:
        'Replace long morning Zoom standups with structured 3-line Slack/ERP status updates so engineers have uninterrupted 4-hour deep work focus blocks.',
      proposedSolution: 'Automate daily check-ins via Pointfex "My Day" dashboard with automated squad roll-up.',
      submitterName: 'Soyebuzaman Naim (CHRO)',
      isAnonymous: false,
      submittedAt: '2026-11-16T10:00:00.000Z',
      status: 'IMPLEMENTED',
      upvotes: 26,
      hasUpvoted: true,
    },
    {
      id: 'sug_2',
      title: 'High-Refresh Ergonomic Monitors & Cloud Workstation Credits',
      topic: 'Hardware & Equipment',
      details:
        'Provide all core developers with 27" 4K external monitors and dedicated cloud devboxes for heavy Docker build runs.',
      proposedSolution: 'Allocate hardware stipend from CFO annual technical infrastructure budget.',
      submitterName: 'Jihad Mia',
      isAnonymous: false,
      submittedAt: '2026-11-18T16:30:00.000Z',
      status: 'IN_REVIEW',
      upvotes: 18,
      hasUpvoted: false,
    },
    {
      id: 'sug_3',
      title: 'Bi-Weekly Cross-Squad Tech Talks & Brown-Bag Sessions',
      topic: 'Workplace & Culture',
      details:
        'Host 45-minute knowledge sharing on Friday afternoons covering Kafka, Kubernetes, Micro-frontends, and Security best practices.',
      proposedSolution: 'Rotate presenting engineers with 20 XP bonus per presentation approved by CTO.',
      submitterName: 'Anonymous Colleague',
      isAnonymous: true,
      submittedAt: '2026-11-19T13:00:00.000Z',
      status: 'NEW',
      upvotes: 12,
      hasUpvoted: false,
    },
  ])

  // Suggestion Modal State
  const [isSuggestionModalOpen, setIsSuggestionModalOpen] = useState(false)
  const [sugTitle, setSugTitle] = useState('')
  const [sugTopic, setSugTopic] = useState<CompanySuggestionItem['topic']>('Engineering Process')
  const [sugDetails, setSugDetails] = useState('')
  const [sugSolution, setSugSolution] = useState('')
  const [sugAnonymous, setSugAnonymous] = useState(false)

  const handleCreateSuggestion = (e: React.FormEvent) => {
    e.preventDefault()
    if (!sugTitle.trim() || !sugDetails.trim()) {
      showToast('Please provide a suggestion title and details.', 'warning')
      return
    }

    const newSug: CompanySuggestionItem = {
      id: `sug_${Date.now()}`,
      title: sugTitle.trim(),
      topic: sugTopic,
      details: sugDetails.trim(),
      proposedSolution: sugSolution.trim() || 'Reviewed during monthly engineering and executive town hall.',
      submitterName: sugAnonymous ? 'Anonymous Colleague' : (currentUser?.name || 'Staff Member'),
      isAnonymous: sugAnonymous,
      submittedAt: new Date().toISOString(),
      status: 'NEW',
      upvotes: 1,
      hasUpvoted: true,
    }

    setSuggestions((prev) => [newSug, ...prev])
    setIsSuggestionModalOpen(false)
    setSugTitle('')
    setSugDetails('')
    setSugSolution('')
    setSugAnonymous(false)
    showToast('Suggestion submitted! Thank you for contributing to company improvements.', 'success')
  }

  const handleToggleSugUpvote = (id: string) => {
    setSuggestions((prev) =>
      prev.map((sug) => {
        if (sug.id === id) {
          const nextVoted = !sug.hasUpvoted
          return {
            ...sug,
            hasUpvoted: nextVoted,
            upvotes: nextVoted ? sug.upvotes + 1 : Math.max(0, sug.upvotes - 1),
          }
        }
        return sug
      }),
    )
  }

  // ==========================================
  // 4. USER DELIVERABLES SUBMISSIONS
  // ==========================================
  const mySubmissions = useMemo(() => {
    if (!currentUser) return []
    const myTasks = data.tasks.filter((t) => t.assigneeId === currentUser.id || t.assignedTo === currentUser.id)
    return myTasks.filter((t) => t.status === 'in_review' || t.status === 'completed' || (t.checklist && t.checklist.length > 0))
  }, [data.tasks, currentUser])

  const pendingLeavesCount = leaveRequests.filter((r) => r.status === 'PENDING').length

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-display">
            Engineering Submissions, Ideas & Leave
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Universal time-off requests, architecture proposals, company suggestions, and deliverable submissions
          </p>
        </div>

        {/* Action Button Matching Active Tab */}
        <div className="flex items-center gap-2">
          {activeTab === 'leave' && (
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={() => setIsLeaveModalOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
            >
              Request Leave
            </Button>
          )}

          {activeTab === 'ideas' && (
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={() => setIsIdeaModalOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
            >
              Submit Idea / Project
            </Button>
          )}

          {activeTab === 'suggestions' && (
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={() => setIsSuggestionModalOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
            >
              Share Suggestion
            </Button>
          )}
        </div>
      </div>

      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span>Pending Leave Requests</span>
            <Calendar className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">
            {pendingLeavesCount}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {isCeoOrChro ? 'Awaiting your executive decision' : 'Requires CEO / CHRO approval'}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span>Idea Submissions</span>
            <Lightbulb className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
            {ideaSubmissions.length}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Active project & architecture proposals</div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span>Company Suggestions</span>
            <MessageSquarePlus className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
            {suggestions.length}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Workplace & engineering feedback</div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span>Tasks Submitted</span>
            <FileText className="w-4 h-4 text-sky-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-sky-600 dark:text-sky-400">
            {mySubmissions.length}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Personal sprint submissions</div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 text-xs flex-wrap">
        <button
          type="button"
          onClick={() => setActiveTab('leave')}
          className={`px-3.5 py-1.5 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'leave'
              ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-semibold shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          Leave Requests ({leaveRequests.length})
          {pendingLeavesCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-white">
              {pendingLeavesCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('ideas')}
          className={`px-3.5 py-1.5 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'ideas'
              ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-semibold shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Lightbulb className="w-3.5 h-3.5" />
          Project & Idea Submissions ({ideaSubmissions.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('suggestions')}
          className={`px-3.5 py-1.5 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'suggestions'
              ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-semibold shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <MessageSquarePlus className="w-3.5 h-3.5" />
          Company Suggestions ({suggestions.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('submissions')}
          className={`px-3.5 py-1.5 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'submissions'
              ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-semibold shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          Deliverable Submissions ({mySubmissions.length})
        </button>
      </div>

      {/* ========================================================= */}
      {/* TAB 1: LEAVE REQUESTS (Anyone requests, CEO/CHRO approves) */}
      {/* ========================================================= */}
      {activeTab === 'leave' && (
        <Card
          title="Leave & Absence Requests"
          icon={Calendar}
          action={
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                <Lock className="w-3 h-3 text-amber-500" />
                Authority: <strong>CEO & CHRO Only</strong>
              </span>
            </div>
          }
        >
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {leaveRequests.map((req) => {
              const isPending = req.status === 'PENDING'
              return (
                <div
                  key={req.id}
                  className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs"
                >
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 dark:text-white text-sm">
                        {req.employeeName}
                      </span>
                      <span className="text-[11px] text-slate-400">({req.employeeRole})</span>
                      <Badge
                        variant={
                          req.status === 'APPROVED'
                            ? 'emerald'
                            : req.status === 'PENDING'
                              ? 'amber'
                              : 'rose'
                        }
                        size="xs"
                      >
                        {req.status}
                      </Badge>
                      <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 capitalize">
                        {req.leaveType} Leave · {req.daysCount} {req.daysCount === 1 ? 'day' : 'days'}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {req.startDate} to {req.endDate}
                      </span>
                      <span>•</span>
                      <span>Requested on {formatDate(req.submittedAt, 'short')}</span>
                      {req.approvedBy && (
                        <>
                          <span>•</span>
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                            Decision by: {req.approvedBy}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Custom Reason Box */}
                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 text-[11px] text-slate-700 dark:text-slate-300">
                      <span className="font-semibold text-slate-500 dark:text-slate-400 block mb-0.5">
                        Custom Reason &amp; Details:
                      </span>
                      {req.reason}
                    </div>
                  </div>

                  {/* Actions: Strictly CEO and CHRO only */}
                  <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                    {isPending && isCeoOrChro ? (
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="primary"
                          size="xs"
                          icon={CheckCircle2}
                          onClick={() => handleApproveLeave(req.id)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                          Approve
                        </Button>
                        <Button
                          variant="danger"
                          size="xs"
                          icon={XCircle}
                          onClick={() => handleRejectLeave(req.id)}
                        >
                          Reject
                        </Button>
                      </div>
                    ) : isPending ? (
                      <span className="text-[11px] text-amber-600 dark:text-amber-400 italic bg-amber-50 dark:bg-amber-950/30 px-2 py-1 rounded-lg border border-amber-200/60 dark:border-amber-800/40">
                        Awaiting CEO / CHRO Decision
                      </span>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* ========================================================= */}
      {/* TAB 2: PROJECT & IDEA SUBMISSIONS */}
      {/* ========================================================= */}
      {activeTab === 'ideas' && (
        <Card
          title="Project & Architecture Proposals"
          icon={Lightbulb}
          action={
            <Button
              variant="secondary"
              size="xs"
              icon={Plus}
              onClick={() => setIsIdeaModalOpen(true)}
            >
              Propose Idea
            </Button>
          }
        >
          <div className="space-y-4">
            {ideaSubmissions.map((idea) => (
              <div
                key={idea.id}
                className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-all space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-slate-900 dark:text-white">
                        {idea.title}
                      </span>
                      <Badge variant="indigo" size="xs">
                        {idea.category}
                      </Badge>
                      <Badge
                        variant={
                          idea.status === 'ACCEPTED'
                            ? 'emerald'
                            : idea.status === 'UNDER_REVIEW'
                              ? 'amber'
                              : 'slate'
                        }
                        size="xs"
                      >
                        {idea.status}
                      </Badge>
                    </div>

                    <div className="text-[11px] text-slate-400 flex items-center gap-2">
                      <span>Proposed by: {idea.submitterName} ({idea.submitterRole})</span>
                      <span>•</span>
                      <span>{formatDate(idea.submittedAt, 'short')}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleToggleIdeaUpvote(idea.id)}
                      className={`px-2.5 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                        idea.hasUpvoted
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <ThumbsUp className="w-3.5 h-3.5" />
                      <span>{idea.upvotes}</span>
                    </button>

                    {(idea.submitterId === currentUser?.id || isReviewerOrPm) && (
                      <Button
                        variant="secondary"
                        size="xs"
                        icon={Pencil}
                        onClick={() => handleOpenEditIdea(idea)}
                      >
                        Edit
                      </Button>
                    )}

                    {isReviewerOrPm && idea.status !== 'ACCEPTED' && (
                      <Button
                        variant="primary"
                        size="xs"
                        icon={CheckCircle2}
                        onClick={() => handleAcceptIdea(idea.id)}
                      >
                        Accept
                      </Button>
                    )}

                    {isReviewerOrPm && idea.status !== 'REJECTED' && (
                      <Button
                        variant="danger"
                        size="xs"
                        icon={XCircle}
                        onClick={() => handleRejectIdea(idea.id)}
                      >
                        Reject
                      </Button>
                    )}
                  </div>
                </div>

                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                  {idea.description}
                </p>

                <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800/60 text-[11px] text-slate-600 dark:text-slate-400">
                  <span className="font-semibold text-indigo-600 dark:text-indigo-400 block mb-0.5">
                    Expected Technical &amp; Business Impact:
                  </span>
                  {idea.impact}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ========================================================= */}
      {/* TAB 3: COMPANY SUGGESTIONS */}
      {/* ========================================================= */}
      {activeTab === 'suggestions' && (
        <Card
          title="Company & Workplace Suggestions"
          icon={MessageSquarePlus}
          action={
            <Button
              variant="secondary"
              size="xs"
              icon={Plus}
              onClick={() => setIsSuggestionModalOpen(true)}
            >
              Add Suggestion
            </Button>
          }
        >
          <div className="space-y-4">
            {suggestions.map((sug) => (
              <div
                key={sug.id}
                className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-all space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-slate-900 dark:text-white">
                        {sug.title}
                      </span>
                      <Badge variant="purple" size="xs">
                        {sug.topic}
                      </Badge>
                      <Badge
                        variant={
                          sug.status === 'IMPLEMENTED'
                            ? 'emerald'
                            : sug.status === 'IN_REVIEW'
                              ? 'amber'
                              : 'slate'
                        }
                        size="xs"
                      >
                        {sug.status}
                      </Badge>
                    </div>

                    <div className="text-[11px] text-slate-400 flex items-center gap-2">
                      <span>Shared by: {sug.submitterName}</span>
                      <span>•</span>
                      <span>{formatDate(sug.submittedAt, 'short')}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleToggleSugUpvote(sug.id)}
                    className={`px-2.5 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                      sug.hasUpvoted
                        ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <Lightbulb className="w-3.5 h-3.5" />
                    <span>{sug.upvotes} Helpful</span>
                  </button>
                </div>

                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                  {sug.details}
                </p>

                <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800/60 text-[11px] text-slate-600 dark:text-slate-400">
                  <span className="font-semibold text-purple-600 dark:text-purple-400 block mb-0.5">
                    Proposed Solution:
                  </span>
                  {sug.proposedSolution}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ========================================================= */}
      {/* TAB 4: DELIVERABLE SUBMISSIONS */}
      {/* ========================================================= */}
      {activeTab === 'submissions' && (
        <Card title="Personal Deliverable Submissions" icon={FileText}>
          {mySubmissions.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              No deliverable submissions found for your account.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {mySubmissions.map((task) => {
                const project = data.projects.find((p) => p.id === task.projectId)
                return (
                  <div key={task.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {task.title}
                        </span>
                        <Badge
                          variant={task.status === 'completed' ? 'emerald' : 'amber'}
                          size="xs"
                        >
                          {task.status.replace('_', ' ').toUpperCase()}
                        </Badge>
                        {task.isMainProjectTask && (
                          <Badge variant="indigo" size="xs">
                            {task.projectPercentage}% Project Share
                          </Badge>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-2">
                        <span>Project: {project?.name || 'General'}</span>
                        <span>•</span>
                        <span>Weight: {task.weightPoints || 2} pts ({Math.round(Number(task.weightPoints || 2) * 10)} XP)</span>
                        {task.dueDate && (
                          <>
                            <span>•</span>
                            <span>Due: {formatDate(task.dueDate, 'short')}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {task.status === 'completed' && task.pmScore !== undefined && (
                        <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                          Score: {task.pmScore}/100
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      )}

      {/* ========================================================= */}
      {/* MODAL 1: REQUEST LEAVE (Open to all employees) */}
      {/* ========================================================= */}
      {isLeaveModalOpen && (
        <Modal
          isOpen={isLeaveModalOpen}
          onClose={() => setIsLeaveModalOpen(false)}
          title="Submit Leave / Time-Off Request"
        >
          <form onSubmit={handleCreateLeave} className="space-y-4 text-xs">
            <p className="text-slate-500 dark:text-slate-400 text-[11px]">
              Any employee can submit a time-off request with a custom reason. In accordance with organizational policy, all leave requests are routed to the <strong>CEO</strong> and <strong>CHRO</strong> for formal approval.
            </p>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Leave Category *
              </label>
              <select
                value={leaveType}
                onChange={(e) => setLeaveType(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              >
                <option value="annual">Annual / Vacation Leave</option>
                <option value="sick">Sick / Medical Leave</option>
                <option value="personal">Personal Leave</option>
                <option value="bereavement">Bereavement Leave</option>
                <option value="unpaid">Unpaid Leave</option>
                <option value="custom">Custom Time-Off</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Start Date *
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  required
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  End Date *
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Custom Reason &amp; Explanation *
              </label>
              <textarea
                value={leaveReason}
                onChange={(e) => setLeaveReason(e.target.value)}
                placeholder="Explain the specific personal, medical, or situational reason for your time-off request..."
                rows={3}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <Button
                variant="secondary"
                size="sm"
                type="button"
                onClick={() => setIsLeaveModalOpen(false)}
              >
                Cancel
              </Button>
              <Button variant="primary" size="sm" type="submit" icon={Send}>
                Submit to CEO &amp; CHRO
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ========================================================= */}
      {/* MODAL 2: SUBMIT IDEA / PROJECT */}
      {/* ========================================================= */}
      {isIdeaModalOpen && (
        <Modal
          isOpen={isIdeaModalOpen}
          onClose={() => setIsIdeaModalOpen(false)}
          title="Submit Project or Architecture Idea"
        >
          <form onSubmit={handleCreateIdea} className="space-y-4 text-xs">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Idea / Project Title *
              </label>
              <input
                type="text"
                required
                value={ideaTitle}
                onChange={(e) => setIdeaTitle(e.target.value)}
                placeholder="e.g. Distributed Redis Cache for Session Invalidation"
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Engineering Category *
              </label>
              <select
                value={ideaCategory}
                onChange={(e) => setIdeaCategory(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              >
                <option value="Architecture">Architecture &amp; Core Infrastructure</option>
                <option value="Internal Tooling">Internal Tooling &amp; Developer Experience</option>
                <option value="Security">Security &amp; Compliance</option>
                <option value="AI / Automation">AI &amp; Workflow Automation</option>
                <option value="Product Feature">Product &amp; Client Feature</option>
                <option value="R&D">Research &amp; Exploration (R&amp;D)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Technical Scope &amp; Details *
              </label>
              <textarea
                required
                rows={3}
                value={ideaDesc}
                onChange={(e) => setIdeaDesc(e.target.value)}
                placeholder="Provide technical architecture details, requirements, and execution plan..."
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Expected Impact &amp; Key Outcomes
              </label>
              <textarea
                rows={2}
                value={ideaImpact}
                onChange={(e) => setIdeaImpact(e.target.value)}
                placeholder="Quantify performance improvements, developer velocity, or cost savings..."
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <Button
                variant="secondary"
                size="sm"
                type="button"
                onClick={() => setIsIdeaModalOpen(false)}
              >
                Cancel
              </Button>
              <Button variant="primary" size="sm" type="submit" icon={Send}>
                Submit Proposal
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ========================================================= */}
      {/* MODAL 2.5: EDIT PROJECT OR ARCHITECTURE IDEA */}
      {/* ========================================================= */}
      {isEditIdeaModalOpen && (
        <Modal
          isOpen={isEditIdeaModalOpen}
          onClose={() => {
            setIsEditIdeaModalOpen(false)
            setEditingIdea(null)
          }}
          title="Edit Project or Architecture Idea"
        >
          <form onSubmit={handleSaveEditIdea} className="space-y-4 text-xs">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Idea / Project Title *
              </label>
              <input
                type="text"
                required
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="e.g. Distributed Caching Engine for Multi-Squad Workflows"
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Category
              </label>
              <select
                value={editCategory}
                onChange={(e) =>
                  setEditCategory(e.target.value as IdeaSubmissionItem['category'])
                }
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white cursor-pointer"
              >
                <option value="Architecture">Architecture &amp; Core Infrastructure</option>
                <option value="Internal Tooling">Internal Tooling &amp; Developer Velocity</option>
                <option value="Product Feature">Product &amp; Client Feature</option>
                <option value="Security">Security &amp; Hardening</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Detailed Scope &amp; Architecture Description *
              </label>
              <textarea
                required
                rows={3}
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                placeholder="Provide technical architecture details, requirements, and execution plan..."
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Expected Impact &amp; Key Outcomes
              </label>
              <textarea
                rows={2}
                value={editImpact}
                onChange={(e) => setEditImpact(e.target.value)}
                placeholder="Quantify performance improvements, developer velocity, or cost savings..."
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <Button
                variant="secondary"
                size="sm"
                type="button"
                onClick={() => {
                  setIsEditIdeaModalOpen(false)
                  setEditingIdea(null)
                }}
              >
                Cancel
              </Button>
              <Button variant="primary" size="sm" type="submit" icon={CheckCircle2}>
                Save Changes
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ========================================================= */}
      {/* MODAL 3: SHARE COMPANY SUGGESTION */}
      {/* ========================================================= */}
      {isSuggestionModalOpen && (
        <Modal
          isOpen={isSuggestionModalOpen}
          onClose={() => setIsSuggestionModalOpen(false)}
          title="Share Suggestion for Pointfex"
        >
          <form onSubmit={handleCreateSuggestion} className="space-y-4 text-xs">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Suggestion Title *
              </label>
              <input
                type="text"
                required
                value={sugTitle}
                onChange={(e) => setSugTitle(e.target.value)}
                placeholder="e.g. Standardize Sprint Retrospective Template"
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Topic Area *
              </label>
              <select
                value={sugTopic}
                onChange={(e) => setSugTopic(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              >
                <option value="Engineering Process">Engineering Process &amp; Workflows</option>
                <option value="Workplace & Culture">Workplace, Health &amp; Culture</option>
                <option value="Hardware & Equipment">Hardware, Equipment &amp; Tooling</option>
                <option value="Company Policy">Company Policy &amp; Benefits</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Observation &amp; Current Challenge *
              </label>
              <textarea
                required
                rows={3}
                value={sugDetails}
                onChange={(e) => setSugDetails(e.target.value)}
                placeholder="What challenge or friction did you notice in day-to-day operations?"
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Proposed Solution &amp; Recommendations
              </label>
              <textarea
                rows={2}
                value={sugSolution}
                onChange={(e) => setSugSolution(e.target.value)}
                placeholder="How would you recommend solving this for the team?"
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="anonymous-check"
                checked={sugAnonymous}
                onChange={(e) => setSugAnonymous(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <label htmlFor="anonymous-check" className="text-slate-700 dark:text-slate-300 text-xs cursor-pointer">
                Submit this suggestion anonymously
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <Button
                variant="secondary"
                size="sm"
                type="button"
                onClick={() => setIsSuggestionModalOpen(false)}
              >
                Cancel
              </Button>
              <Button variant="primary" size="sm" type="submit" icon={Send}>
                Submit Suggestion
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

export default SubmissionsLeavePage
