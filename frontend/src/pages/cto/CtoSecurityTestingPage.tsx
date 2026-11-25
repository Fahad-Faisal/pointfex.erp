import React, { useState } from 'react'
import { Card } from '../../components/common/Card'
import { Badge } from '../../components/common/Badge'
import { Button } from '../../components/common/Button'
import { Modal } from '../../components/common/Modal'
import { useCtoData } from '../../hooks/useCtoData'
import { useApp } from '../../context/AppContext'
import { formatDate } from '../../utils/formatters'
import {
  ShieldAlert,
  ShieldCheck,
  TestTube2,
  Plus,
  CheckCircle2,
} from 'lucide-react'
import type { SecurityAlert } from '../../types'

export function CtoSecurityTestingPage() {
  const { securityAlerts, testingSuites, projects, projectManagers, companyStats } = useCtoData()
  const { createSecurityIssue, updateSecurityIssueStatus, showToast } = useApp()

  const [severityFilter, setSeverityFilter] = useState<'all' | SecurityAlert['severity']>('all')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [projectId, setProjectId] = useState(projects[0]?.id || '')
  const [severity, setSeverity] = useState<SecurityAlert['severity']>('high')
  const [category, setCategory] = useState<SecurityAlert['category']>('auth')
  const [assignedPmId, setAssignedPmId] = useState('')
  const [cveOrPackage, setCveOrPackage] = useState('')
  const [description, setDescription] = useState('')
  const [recommendation, setRecommendation] = useState('')

  const filteredAlerts = securityAlerts.filter(
    (a) => severityFilter === 'all' || a.severity === severityFilter,
  )

  const handleCreateAlert = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !description.trim() || !recommendation.trim() || !projectId) {
      showToast('Please complete all required security alert fields.', 'error')
      return
    }

    createSecurityIssue({
      title: title.trim(),
      projectId,
      severity,
      category,
      assignedPmId: assignedPmId || undefined,
      cveOrPackage: cveOrPackage.trim() || undefined,
      description: description.trim(),
      recommendation: recommendation.trim(),
    })

    setTitle('')
    setCveOrPackage('')
    setDescription('')
    setRecommendation('')
    setIsCreateOpen(false)
  }

  const getSeverityBadge = (sev: SecurityAlert['severity']) => {
    switch (sev) {
      case 'critical':
        return <Badge variant="danger" size="xs">CRITICAL</Badge>
      case 'high':
        return <Badge variant="warning" size="xs">HIGH</Badge>
      case 'medium':
        return <Badge variant="indigo" size="xs">MEDIUM</Badge>
      default:
        return <Badge variant="neutral" size="xs">LOW</Badge>
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white font-display">
            Security & Compliance Posture
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Live vulnerability triage, remediation tracking, and automated test suite telemetry
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          icon={Plus}
          onClick={() => {
            if (!projectId && projects[0]?.id) setProjectId(projects[0].id)
            setIsCreateOpen(true)
          }}
        >
          Log Security Alert
        </Button>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
          <div className="text-[11px] text-slate-400">Open Security Issues</div>
          <div className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">
            {companyStats.securityAlertsCount}
          </div>
        </div>
        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
          <div className="text-[11px] text-slate-400">Critical Severity</div>
          <div className="text-xl font-bold text-rose-600 dark:text-rose-400 mt-0.5">
            {companyStats.criticalSecurityAlertsCount}
          </div>
        </div>
        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
          <div className="text-[11px] text-slate-400">Test Suites Tracked</div>
          <div className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">
            {testingSuites.length}
          </div>
        </div>
        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
          <div className="text-[11px] text-slate-400">Avg Test Coverage</div>
          <div className="text-xl font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
            {companyStats.averageTestCoverage !== null
              ? `${companyStats.averageTestCoverage}%`
              : 'N/A'}
          </div>
        </div>
      </div>

      {/* Security Alerts */}
      <Card
        title="Security Alerts & Vulnerability Triage"
        icon={ShieldAlert}
        action={
          <div className="flex items-center gap-1.5 text-xs">
            {(['all', 'critical', 'high', 'medium', 'low'] as const).map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setSeverityFilter(level)}
                className={`px-2.5 py-1 rounded-xl font-medium capitalize cursor-pointer ${
                  severityFilter === level
                    ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        }
      >
        {filteredAlerts.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400 space-y-2">
            <ShieldCheck className="w-8 h-8 mx-auto text-emerald-500/70" />
            <p>No security alerts match the current filter.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredAlerts.map((alert) => {
              const proj = projects.find((p) => p.id === alert.projectId)
              return (
                <div
                  key={alert.id}
                  className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {getSeverityBadge(alert.severity)}
                      <Badge variant="neutral" size="xs">
                        {proj?.code || alert.projectId}
                      </Badge>
                      {alert.cveOrPackage && (
                        <span className="font-mono text-[10px] text-slate-500">
                          {alert.cveOrPackage}
                        </span>
                      )}
                    </div>
                    <h4 className="font-bold text-slate-900 dark:text-white">{alert.title}</h4>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300">
                      {alert.description}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Remediation: {alert.recommendation} · Detected{' '}
                      {formatDate(alert.detectedAt, 'short')}
                    </p>
                  </div>

                  <select
                    value={alert.status}
                    onChange={(e) =>
                      updateSecurityIssueStatus(
                        alert.id,
                        e.target.value as SecurityAlert['status'],
                      )
                    }
                    className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 shrink-0"
                  >
                    <option value="open">Open</option>
                    <option value="investigating">Investigating</option>
                    <option value="patch_in_progress">Patch In Progress</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Automated Test Runs */}
      <Card title="Automated Test Suites & CI Telemetry" icon={TestTube2}>
        {testingSuites.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400">
            No automated test suite runs recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-500 uppercase">
                  <th className="py-2.5 px-3">Suite Name</th>
                  <th className="py-2.5 px-3">Passed / Total</th>
                  <th className="py-2.5 px-3">Coverage</th>
                  <th className="py-2.5 px-3">Duration</th>
                  <th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {testingSuites.map((suite) => (
                  <tr key={suite.id}>
                    <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">
                      {suite.name}
                    </td>
                    <td className="py-2.5 px-3 font-mono">
                      {suite.passed}/{suite.totalTests}
                    </td>
                    <td className="py-2.5 px-3 font-mono">{suite.coveragePercent}%</td>
                    <td className="py-2.5 px-3 text-slate-500">{suite.duration}</td>
                    <td className="py-2.5 px-3">
                      <Badge
                        variant={suite.status === 'passed' ? 'success' : 'warning'}
                        size="xs"
                      >
                        {suite.status.toUpperCase()}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {isCreateOpen && (
        <Modal
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          title="Log Security Alert"
        >
          <form onSubmit={handleCreateAlert} className="space-y-3 text-xs">
            <div>
              <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">
                Alert Title *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., JWT token clock-skew tolerance review"
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">
                  Project *
                </label>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                >
                  <option value="">Select project...</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">
                  Severity
                </label>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as SecurityAlert['severity'])}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                >
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as SecurityAlert['category'])}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                >
                  <option value="auth">Auth</option>
                  <option value="dependency">Dependency</option>
                  <option value="injection">Injection</option>
                  <option value="encryption">Encryption</option>
                  <option value="infrastructure">Infrastructure</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">
                  Assign PM (Optional)
                </label>
                <select
                  value={assignedPmId}
                  onChange={(e) => setAssignedPmId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                >
                  <option value="">Unassigned</option>
                  {projectManagers.map((pm) => (
                    <option key={pm.id} value={pm.id}>
                      {pm.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">
                CVE or Package Reference
              </label>
              <input
                type="text"
                value={cveOrPackage}
                onChange={(e) => setCveOrPackage(e.target.value)}
                placeholder="e.g., CVE-2026-XXXX"
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">
                Description *
              </label>
              <textarea
                rows={2}
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">
                Recommendation *
              </label>
              <textarea
                rows={2}
                required
                value={recommendation}
                onChange={(e) => setRecommendation(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" icon={CheckCircle2}>
                Submit Alert
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
