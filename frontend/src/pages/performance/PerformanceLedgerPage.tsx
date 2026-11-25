import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  ShieldCheck,
  Download,
  Lock,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { erpApi } from '../../api/client'
import {
  PageHeader,
  Card,
  Button,
  Select,
  Input,
  DataTable,
  type DataTableColumn,
  DateRangePicker,
  ErrorState,
} from '../../components/common'

export function PerformanceLedgerPage() {
  const { currentUser, data, showToast } = useApp()
  const userRole = (currentUser?.role || '').toLowerCase()
  const isExecutive = ['ceo', 'chro', 'cto', 'cpo', 'cfo'].includes(userRole)
  const isPm = userRole === 'pm'

  // Selected Target User (defaults to current user)
  const [selectedUserId, setSelectedUserId] = useState<string>(currentUser?.id || '')
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('')
  const [taskIdFilter, setTaskIdFilter] = useState<string>('')
  const [dateRange, setDateRange] = useState<{ startDate: string; endDate: string }>({
    startDate: '',
    endDate: '',
  })
  const pageSize = 25

  // Ledger state & cursor pagination
  const [loading, setLoading] = useState<boolean>(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [ledgerItems, setLedgerItems] = useState<any[]>([])
  const [cursorHistory, setCursorHistory] = useState<string[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState<number>(1)

  // Eligible users selector (execs see all, PM sees squad, devs see only self)
  const selectableUsers = useMemo(() => {
    if (isExecutive) {
      return data.users.map((u) => ({ value: u.id, label: `${u.name} (${u.title})` }))
    }
    if (isPm) {
      // Return PM + members of team
      return data.users
        .filter((u) => u.id === currentUser?.id || u.role === 'developer')
        .map((u) => ({ value: u.id, label: `${u.name} (${u.title})` }))
    }
    return [{ value: currentUser?.id || '', label: `${currentUser?.name} (Self)` }]
  }, [isExecutive, isPm, data.users, currentUser])

  const fetchLedger = useCallback(
    async (cursor?: string) => {
      if (!selectedUserId) return
      setLoading(true)
      setLoadError(null)
      try {
        const query: any = {
          limit: pageSize,
          cursor: cursor || undefined,
          eventType: eventTypeFilter || undefined,
          taskId: taskIdFilter || undefined,
          startDate: dateRange.startDate || undefined,
          endDate: dateRange.endDate || undefined,
        }

        const res =
          selectedUserId === currentUser?.id
            ? await erpApi.getMyLedger(query)
            : await erpApi.getUserLedger(selectedUserId, query)

        setLedgerItems(res?.items || [])
        setNextCursor(res?.nextCursor || null)
      } catch (err: any) {
        setLoadError(err.message || 'Failed to load ledger records.')
        showToast(err.message || 'Failed to load ledger', 'error')
        setLedgerItems([])
      } finally {
        setLoading(false)
      }
    },
    [selectedUserId, currentUser?.id, pageSize, eventTypeFilter, taskIdFilter, dateRange, showToast],
  )

  useEffect(() => {
    setCursorHistory([])
    setCurrentPage(1)
    void fetchLedger()
  }, [selectedUserId, eventTypeFilter, taskIdFilter, dateRange, pageSize, fetchLedger])

  const handleNextPage = () => {
    if (!nextCursor) return
    setCursorHistory((prev) => [...prev, nextCursor])
    setCurrentPage((p) => p + 1)
    void fetchLedger(nextCursor)
  }

  const handlePrevPage = () => {
    if (cursorHistory.length <= 1) {
      setCursorHistory([])
      setCurrentPage(1)
      void fetchLedger()
      return
    }
    const newHistory = cursorHistory.slice(0, -1)
    const prevCursor = newHistory[newHistory.length - 1]
    setCursorHistory(newHistory)
    setCurrentPage((p) => Math.max(1, p - 1))
    void fetchLedger(prevCursor)
  }

  const handleExport = async (format: 'json' | 'csv') => {
    try {
      const res = await erpApi.exportLedger(selectedUserId, { format })
      const blob =
        format === 'csv'
          ? new Blob([res.data], { type: 'text/csv;charset=utf-8;' })
          : new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' })

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute(
        'download',
        `pointfex-ledger-${selectedUserId}-${Date.now()}.${format}`,
      )
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      showToast(`Exported ledger as ${format.toUpperCase()}`, 'success')
    } catch (err: any) {
      showToast(err.message || 'Export failed', 'error')
    }
  }

  const columns: DataTableColumn<any>[] = [
    {
      key: 'sequence',
      header: 'Seq #',
      render: (r) => <span className="font-mono text-xs font-semibold text-[var(--muted)]">#{r.sequence}</span>,
    },
    {
      key: 'delta',
      header: 'Delta',
      render: (r) => {
        const delta = Number(r.deltaValue)
        const isPositive = delta > 0
        const isFrozen = r.actionType?.includes('FREEZE')

        return (
          <div className="flex items-center gap-1 font-mono font-bold text-xs">
            {isFrozen ? (
              <span className="inline-flex items-center gap-0.5 text-amber-500">
                <Lock className="w-3 h-3" />
                {delta} XP (Frozen)
              </span>
            ) : isPositive ? (
              <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                <ArrowUpRight className="w-3.5 h-3.5" />
                +{delta} {r.metricType}
              </span>
            ) : (
              <span className="inline-flex items-center gap-0.5 text-rose-600 dark:text-rose-400">
                <ArrowDownRight className="w-3.5 h-3.5" />
                {delta} {r.metricType}
              </span>
            )}
          </div>
        )
      },
    },
    {
      key: 'balance',
      header: 'Balance (Before → After)',
      render: (r) => (
        <span className="font-mono text-[11px] text-[var(--muted)]">
          {r.valueBefore !== null && r.valueBefore !== undefined ? r.valueBefore : '—'} →{' '}
          <strong className="text-[var(--text)]">{r.valueAfter ?? '—'}</strong>
        </span>
      ),
    },
    {
      key: 'action',
      header: 'Action / Event Type',
      render: (r) => (
        <div>
          <div className="font-semibold text-xs text-[var(--text)]">{r.actionType}</div>
          <div className="text-[11px] text-[var(--muted)]">{r.triggerEvent}</div>
        </div>
      ),
    },
    {
      key: 'authority',
      header: 'Authorized By',
      render: (r) => (
        <span className="inline-block px-1.5 py-0.5 rounded bg-[var(--surface-muted)] uppercase text-[10px] font-mono text-[var(--muted)]">
          {r.authorizedRole || 'SYSTEM'}
        </span>
      ),
    },
    {
      key: 'chain',
      header: 'Hash Chain',
      render: () => (
        <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
          <ShieldCheck className="w-3.5 h-3.5" />
          Valid
        </span>
      ),
    },
    {
      key: 'date',
      header: 'Asia/Dhaka Recorded',
      render: (r) => (
        <span className="text-[11px] text-[var(--muted)] whitespace-nowrap">
          {new Date(r.recordedAt || Date.now()).toLocaleString('en-US', {
            timeZone: 'Asia/Dhaka',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <PageHeader
          title="Cryptographic Performance Ledger"
          subtitle="Authoritative SHA-256 hash-chained ledger. Immutable audit record of every KPI & XP delta."
        />

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => handleExport('csv')}>
            <Download className="w-3.5 h-3.5 mr-1" />
            Export CSV
          </Button>
          <Button variant="secondary" size="sm" onClick={() => handleExport('json')}>
            <Download className="w-3.5 h-3.5 mr-1" />
            Export JSON
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {(isExecutive || isPm) && (
            <div>
              <Select
                label="Target Employee"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                options={selectableUsers}
              />
            </div>
          )}

          <div>
            <Select
              label="Event Type"
              value={eventTypeFilter}
              onChange={(e) => setEventTypeFilter(e.target.value)}
              options={[
                { value: '', label: 'All Event Types' },
                { value: 'AWARD_PENDING', label: 'AWARD_PENDING' },
                { value: 'VERIFY_RELEASE', label: 'VERIFY_RELEASE (Sweep)' },
                { value: 'FREEZE', label: 'FREEZE (Threshold)' },
                { value: 'RELEASE_FROZEN', label: 'RELEASE_FROZEN (Consensus)' },
                { value: 'REVERSAL', label: 'REVERSAL' },
                { value: 'ADJUSTMENT', label: 'ADJUSTMENT' },
              ]}
            />
          </div>

          <div>
            <Input
              label="Task ID"
              placeholder="Filter by Task ID"
              value={taskIdFilter}
              onChange={(e) => setTaskIdFilter(e.target.value)}
            />
          </div>

          <div className="lg:col-span-2">
            <DateRangePicker
              label="Date Range (Asia/Dhaka)"
              value={dateRange}
              onChange={setDateRange}
            />
          </div>
        </div>
      </Card>

      {/* Ledger Table */}
      <div className="space-y-3">
        {loadError ? (
          <ErrorState
            title="Unable to load ledger entries"
            error={loadError}
            onRetry={() => void fetchLedger()}
          />
        ) : (
          <DataTable
            data={ledgerItems}
            columns={columns}
            rowKey={(r) => r.id}
            loading={loading}
            emptyTitle="No Ledger Entries Found"
            emptyDescription="No immutable audit entries match the selected filters."
          />
        )}

        {/* Cursor Pagination Bar */}
        <div className="flex items-center justify-between px-2 text-xs text-[var(--muted)]">
          <div>
            Page <span className="font-bold text-[var(--text)]">{currentPage}</span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="xs"
              disabled={currentPage <= 1 || loading}
              onClick={handlePrevPage}
            >
              Previous Page
            </Button>
            <Button
              variant="secondary"
              size="xs"
              disabled={!nextCursor || loading}
              onClick={handleNextPage}
            >
              Next Page
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
