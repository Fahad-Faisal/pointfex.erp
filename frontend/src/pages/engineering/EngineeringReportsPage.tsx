import React, { useState, useMemo } from 'react'
import { Card } from '../../components/common/Card'
import { Badge } from '../../components/common/Badge'
import { Button } from '../../components/common/Button'
import { Modal } from '../../components/common/Modal'
import { EmptyState } from '../../components/common/EmptyState'
import { useApp } from '../../context/AppContext'
import { formatDate } from '../../utils/formatters'
import type { Report } from '../../types'
import {
  FileText,
  Send,
  CheckCircle2,
  Clock,
  UserCheck,
  ShieldAlert,
  MessageSquare,
} from 'lucide-react'

export function EngineeringReportsPage() {
  const { data, currentUser, currentDevId, addComplaint, updateComplaintStatusGeneral, showToast } =
    useApp()
  const activeUserId = currentUser?.id || currentDevId || 'emp_01'

  const isExecutive = useMemo(() => {
    const role = (currentUser?.role || '').toLowerCase()
    return ['ceo', 'chro', 'cto', 'cfo', 'cpo'].includes(role) || role === 'ceo'
  }, [currentUser])

  const userRole = (currentUser?.role || '').toLowerCase()

  // Tab State
  const [activeTab, setActiveTab] = useState<'submit' | 'my_reports' | 'authority_triage'>(
    'submit',
  )

  // Report Submission Form State
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('Technical Impediment')
  const [targetUserId, setTargetUserId] = useState('')
  const [routedAuthority, setRoutedAuthority] = useState('CHRO & CEO')
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium')
  const [description, setDescription] = useState('')

  // Authority Status Update Modal State
  const [selectedReport, setSelectedReport] = useState<Report | null>(null)
  const [newStatus, setNewStatus] = useState<string>('in_review')
  const [authorityNote, setAuthorityNote] = useState<string>('')
  const [isUpdating, setIsUpdating] = useState(false)

  // Filter Reports
  const myReports = useMemo(() => {
    return data.reports.filter((r) => r.authorId === activeUserId || r.userId === activeUserId)
  }, [data.reports, activeUserId])

  const incomingAuthorityReports = useMemo(() => {
    if (!isExecutive && userRole !== 'pm') return []
    return data.reports.filter((r) => {
      if (userRole === 'ceo') return true
      if (userRole === 'chro') {
        return (
          r.complainTo?.includes('CHRO') ||
          r.confidentialTo === 'chro' ||
          !r.complainTo ||
          r.complainTo === 'CHRO & CEO'
        )
      }
      if (userRole === 'cto') {
        return (
          r.complainTo?.includes('CTO') ||
          r.category?.includes('Technical') ||
          r.category?.includes('Code')
        )
      }
      if (userRole === 'cfo') {
        return r.complainTo?.includes('CFO') || r.category?.includes('Budget')
      }
      if (userRole === 'pm') {
        return r.complainTo?.includes('PM') || r.teamId === currentUser?.teamId
      }
      return false
    })
  }, [data.reports, isExecutive, userRole, currentUser?.teamId])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !description.trim()) {
      showToast('Title and detailed description are required', 'error')
      return
    }

    const targetUser = data.users.find((u) => u.id === targetUserId)
    const reportItem: Report = {
      id: `rep_${Date.now()}`,
      userId: activeUserId,
      authorId: activeUserId,
      authorName: currentUser?.name || 'Engineer',
      authorRole: currentUser?.role || 'developer',
      targetUserId: targetUserId || undefined,
      type: 'complaint',
      category,
      title: title.trim(),
      description: description.trim(),
      complainTo: routedAuthority,
      date: new Date().toISOString().split('T')[0],
      submittedAt: new Date().toISOString(),
      status: 'pending',
      feedback: `Report routed to ${routedAuthority}. Awaiting initial review.`,
    }

    addComplaint(reportItem)
    showToast(
      `Report successfully submitted and routed to ${routedAuthority}${targetUser ? ` regarding ${targetUser.name}` : ''}`,
      'success',
    )

    setTitle('')
    setDescription('')
    setTargetUserId('')
    setCategory('Technical Impediment')
    setRoutedAuthority('CHRO & CEO')
    setActiveTab('my_reports')
  }

  const handleUpdateStatus = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedReport) return

    setIsUpdating(true)
    const formattedNote = authorityNote.trim()
      ? `[${(currentUser?.role || 'Authority').toUpperCase()} Note · ${formatDate(new Date().toISOString(), 'short')}]: ${authorityNote.trim()}`
      : undefined

    updateComplaintStatusGeneral(selectedReport.id, newStatus, formattedNote)
    setIsUpdating(false)
    setSelectedReport(null)
    setAuthorityNote('')
    showToast(`Report status updated to ${newStatus.toUpperCase()}`, 'success')
  }

  const getStatusBadge = (status: string) => {
    const s = status.toLowerCase()
    if (s === 'resolved' || s === 'approved') {
      return (
        <Badge variant="emerald" size="xs">
          <CheckCircle2 className="w-2.5 h-2.5 mr-1 inline" />
          Resolved
        </Badge>
      )
    }
    if (s === 'in_review' || s === 'under_investigation' || s === 'under_review') {
      return (
        <Badge variant="amber" size="xs">
          <Clock className="w-2.5 h-2.5 mr-1 inline" />
          In Review
        </Badge>
      )
    }
    if (s === 'closed' || s === 'dismissed' || s === 'rejected') {
      return (
        <Badge variant="slate" size="xs">
          Closed
        </Badge>
      )
    }
    return (
      <Badge variant="indigo" size="xs">
        <Clock className="w-2.5 h-2.5 mr-1 inline" />
        Open / Pending
      </Badge>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white font-display flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-500" />
            Engineering Reports & Governance Intake
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Universal report submission, peer/lead evaluation, and authority-routed resolution tracking
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/60 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('submit')}
            className={`px-3 py-1.5 rounded-xl font-medium transition-all cursor-pointer ${
              activeTab === 'submit'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-200 dark:border-slate-700'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            File New Report
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('my_reports')}
            className={`px-3 py-1.5 rounded-xl font-medium transition-all cursor-pointer ${
              activeTab === 'my_reports'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-200 dark:border-slate-700'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            My Submitted ({myReports.length})
          </button>
          {(isExecutive || userRole === 'pm') && (
            <button
              type="button"
              onClick={() => setActiveTab('authority_triage')}
              className={`px-3 py-1.5 rounded-xl font-medium transition-all cursor-pointer ${
                activeTab === 'authority_triage'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-200 dark:border-slate-700'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Authority Triage ({incomingAuthorityReports.length})
            </button>
          )}
        </div>
      </div>

      {/* TAB 1: File New Report */}
      {activeTab === 'submit' && (
        <Card title="File a Report / Incident" icon={Send}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                  Report Subject / Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Blocked on code review / Conduct impediment / Spec drift"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                  Report Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="Technical Impediment">Technical Impediment / Architecture Block</option>
                  <option value="Code Quality & Review Delay">Code Quality & Review Delay</option>
                  <option value="PM & Sprint Management Block">PM & Sprint Management Block</option>
                  <option value="Conduct & Workplace Ethics">Conduct & Workplace Ethics</option>
                  <option value="Resource & Tooling Constraint">Resource & Tooling Constraint</option>
                  <option value="General Grievance">General Grievance / Other</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                  Target Individual (Optional)
                </label>
                <select
                  value={targetUserId}
                  onChange={(e) => setTargetUserId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">None / General Organization</option>
                  {data.users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.title || u.role})
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  Anyone can report on anyone (Dev about PM, PM about Dev or C-Level).
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                  Routed Authority *
                </label>
                <select
                  value={routedAuthority}
                  onChange={(e) => setRoutedAuthority(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                >
                  <option value="CHRO & CEO">CHRO & CEO (Default Direct Escalation)</option>
                  <option value="Chief Technology Officer (CTO)">Chief Technology Officer (CTO)</option>
                  <option value="Chief Human Resources Officer (CHRO)">Chief Human Resources Officer (CHRO)</option>
                  <option value="Chief Executive Officer (CEO)">Chief Executive Officer (CEO)</option>
                  <option value="Chief Financial Officer (CFO)">Chief Financial Officer (CFO)</option>
                  <option value="Project Manager (PM)">Squad Project Manager (PM)</option>
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  Default sends directly to CHRO & CEO or your selected authority.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                  Severity / Urgency
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="low">Low — Routine Feedback</option>
                  <option value="medium">Medium — Operational Delay</option>
                  <option value="high">High — Sprint / Team Impediment</option>
                  <option value="critical">Critical — Immediate Intervention Needed</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                Detailed Report Description *
              </label>
              <textarea
                required
                rows={4}
                placeholder="Provide complete facts, affected tasks/squads, timeline, and requested resolution..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button type="submit" variant="primary" size="sm" icon={Send}>
                Submit & Route Report
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* TAB 2: My Submitted Reports */}
      {activeTab === 'my_reports' && (
        <Card title="My Submitted Reports (Live Tracking)" icon={Clock}>
          {myReports.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No reports filed yet"
              description="You have not submitted any reports or incidents. Click 'File New Report' to file one."
            />
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {myReports.map((report) => {
                const targetUser = data.users.find((u) => u.id === report.targetUserId)
                return (
                  <div key={report.id} className="py-4 space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-xs text-slate-900 dark:text-white">
                          {report.title}
                        </span>
                        <Badge variant="slate" size="xs">
                          {report.category || 'General'}
                        </Badge>
                        {targetUser && (
                          <Badge variant="indigo" size="xs">
                            <UserCheck className="w-2.5 h-2.5 mr-0.5 inline" />
                            Target: {targetUser.name}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(report.status)}
                        <span className="text-[11px] text-slate-400">
                          {formatDate(report.submittedAt || report.date || new Date().toISOString(), 'short')}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                      {report.description}
                    </p>

                    <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-slate-400">
                      <span>Routed to: <strong className="text-slate-700 dark:text-slate-300">{report.complainTo || 'CHRO & CEO'}</strong></span>
                      {report.feedback && (
                        <div className="w-full mt-1.5 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-indigo-700 dark:text-indigo-300 font-medium">
                          <MessageSquare className="w-3 h-3 inline mr-1" />
                          Authority Resolution: {report.feedback}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      )}

      {/* TAB 3: Authority Triage & Resolution */}
      {activeTab === 'authority_triage' && (isExecutive || userRole === 'pm') && (
        <Card title="Authority Intake & Status Updates" icon={ShieldAlert}>
          {incomingAuthorityReports.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="No reports awaiting triage"
              description="There are currently no open reports routed to your authority queue."
            />
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {incomingAuthorityReports.map((report) => {
                const author = data.users.find((u) => u.id === report.authorId || u.id === report.userId)
                const targetUser = data.users.find((u) => u.id === report.targetUserId)

                return (
                  <div key={report.id} className="py-4 space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-xs text-slate-900 dark:text-white">
                          {report.title}
                        </span>
                        <Badge variant="purple" size="xs">
                          Reporter: {author?.name || 'Engineer'}
                        </Badge>
                        {targetUser && (
                          <Badge variant="rose" size="xs">
                            Target: {targetUser.name}
                          </Badge>
                        )}
                        <Badge variant="slate" size="xs">
                          {report.category}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-2">
                        {getStatusBadge(report.status)}
                        <Button
                          variant="secondary"
                          size="xs"
                          onClick={() => {
                            setSelectedReport(report)
                            setNewStatus(report.status || 'in_review')
                            setAuthorityNote('')
                          }}
                        >
                          Update Status
                        </Button>
                      </div>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                      {report.description}
                    </p>

                    {report.feedback && (
                      <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-[11px] text-slate-600 dark:text-slate-300">
                        {report.feedback}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      )}

      {/* Modal: Update Report Status */}
      {selectedReport && (
        <Modal
          isOpen={Boolean(selectedReport)}
          onClose={() => setSelectedReport(null)}
          title={`Update Report Status: ${selectedReport.title}`}
        >
          <form onSubmit={handleUpdateStatus} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                New Resolution Status *
              </label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
              >
                <option value="open">Open / Under Intake</option>
                <option value="in_review">In Review / Investigation</option>
                <option value="resolved">Resolved / Action Completed</option>
                <option value="closed">Closed / Dismissed</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                Authority Resolution Note & Feedback
              </label>
              <textarea
                rows={3}
                placeholder="Enter actions taken, resolution details, or rationale for the reporter..."
                value={authorityNote}
                onChange={(e) => setAuthorityNote(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelectedReport(null)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" disabled={isUpdating}>
                {isUpdating ? 'Saving...' : 'Commit Status Update'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

