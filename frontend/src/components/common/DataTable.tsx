import { useMemo, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { EmptyState } from './EmptyState'
import { Skeleton } from './Skeleton'

export interface DataTableColumn<T> {
  key: string
  header: string
  align?: 'left' | 'right' | 'center'
  sortValue?: (row: T) => string | number
  render: (row: T) => ReactNode
  widthClass?: string
}

export interface DataTablePagination {
  page: number
  pageSize: number
  total?: number
  onPageChange: (newPage: number) => void
}

export interface DataTableProps<T> {
  data: T[]
  columns: DataTableColumn<T>[]
  rowKey: (row: T) => string
  loading?: boolean
  emptyTitle?: string
  emptyDescription?: string
  emptyAction?: ReactNode
  onRowClick?: (row: T) => void
  maxHeightClass?: string
  virtualize?: boolean
  pagination?: DataTablePagination
}

const VIRTUAL_ROW_HEIGHT = 48
const VIRTUAL_OVERSCAN = 8

export function DataTable<T>({
  data,
  columns,
  rowKey,
  loading = false,
  emptyTitle,
  emptyDescription,
  emptyAction,
  onRowClick,
  maxHeightClass = 'max-h-[560px]',
  virtualize = true,
  pagination,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [scrollTop, setScrollTop] = useState(0)

  const sortedRows = useMemo(() => {
    if (!sortKey) return data
    const col = columns.find((c) => c.key === sortKey)
    if (!col?.sortValue) return data
    const getter = col.sortValue
    return [...data].sort((a, b) => {
      const av = getter(a)
      const bv = getter(b)
      const cmp =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv))
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [columns, data, sortDir, sortKey])

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  if (loading) {
    return (
      <div className="border border-[var(--border)] rounded-[var(--radius-card)] bg-[var(--surface)] p-4 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  }

  if (data.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
  }

  // Client-side pagination if total not externally managed
  const isClientPaged = pagination && pagination.total === undefined
  const displayRows = isClientPaged
    ? sortedRows.slice((pagination.page - 1) * pagination.pageSize, pagination.page * pagination.pageSize)
    : sortedRows

  const shouldVirtualize = !pagination && virtualize && sortedRows.length > 60
  const startIdx = shouldVirtualize
    ? Math.max(0, Math.floor(scrollTop / VIRTUAL_ROW_HEIGHT) - VIRTUAL_OVERSCAN)
    : 0
  const visibleCount = shouldVirtualize ? 26 : displayRows.length
  const endIdx = shouldVirtualize
    ? Math.min(displayRows.length, startIdx + visibleCount)
    : displayRows.length
  const renderedRows = shouldVirtualize ? displayRows.slice(startIdx, endIdx) : displayRows
  const topSpacer = shouldVirtualize ? startIdx * VIRTUAL_ROW_HEIGHT : 0
  const bottomSpacer = shouldVirtualize
    ? Math.max(0, (displayRows.length - endIdx) * VIRTUAL_ROW_HEIGHT)
    : 0

  const totalItems = pagination?.total ?? sortedRows.length
  const totalPages = pagination ? Math.max(1, Math.ceil(totalItems / pagination.pageSize)) : 1

  return (
    <div className="border border-[var(--border)] rounded-[var(--radius-card)] bg-[var(--surface)] overflow-hidden">
      <div
        onScroll={shouldVirtualize ? (e) => setScrollTop(e.currentTarget.scrollTop) : undefined}
        className={`overflow-auto ${maxHeightClass}`}
      >
        <table className="w-full border-collapse text-left text-[14px]">
          <thead className="sticky top-0 z-10 bg-[var(--surface-muted)] border-b border-[var(--border)]">
            <tr>
              {columns.map((col) => {
                const sortable = Boolean(col.sortValue)
                const active = sortKey === col.key
                const alignClass =
                  col.align === 'right'
                    ? 'text-right'
                    : col.align === 'center'
                      ? 'text-center'
                      : 'text-left'
                return (
                  <th
                    key={col.key}
                    className={`px-4 py-3 text-[12px] font-semibold text-[var(--muted)] whitespace-nowrap ${alignClass} ${col.widthClass || ''}`}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        className={`inline-flex items-center gap-1 hover:text-[var(--text)] cursor-pointer ${
                          col.align === 'right' ? 'flex-row-reverse' : ''
                        }`}
                      >
                        <span>{col.header}</span>
                        {active ? (
                          sortDir === 'asc' ? (
                            <ArrowUp className="w-3.5 h-3.5 text-[var(--primary)]" />
                          ) : (
                            <ArrowDown className="w-3.5 h-3.5 text-[var(--primary)]" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-60" />
                        )}
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {topSpacer > 0 && (
              <tr aria-hidden="true">
                <td colSpan={columns.length} style={{ height: `${topSpacer}px`, padding: 0 }} />
              </tr>
            )}
            {renderedRows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`transition-colors ${
                  onRowClick ? 'cursor-pointer hover:bg-[var(--surface-muted)]/70' : 'hover:bg-[var(--surface-muted)]/40'
                }`}
              >
                {columns.map((col) => {
                  const alignClass =
                    col.align === 'right'
                      ? 'text-right tabular-nums'
                      : col.align === 'center'
                        ? 'text-center'
                        : 'text-left'
                  return (
                    <td
                      key={col.key}
                      className={`px-4 py-3 text-[var(--text)] align-middle ${alignClass}`}
                    >
                      {col.render(row)}
                    </td>
                  )
                })}
              </tr>
            ))}
            {bottomSpacer > 0 && (
              <tr aria-hidden="true">
                <td colSpan={columns.length} style={{ height: `${bottomSpacer}px`, padding: 0 }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pagination && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-[var(--border)] bg-[var(--surface-muted)]/40 text-[12px] text-[var(--muted)]">
          <div>
            Showing{' '}
            <span className="font-medium text-[var(--text)]">
              {totalItems === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1}
            </span>{' '}
            to{' '}
            <span className="font-medium text-[var(--text)]">
              {Math.min(pagination.page * pagination.pageSize, totalItems)}
            </span>{' '}
            of <span className="font-medium text-[var(--text)]">{totalItems}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              className="p-1 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-muted)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-medium text-[var(--text)]">
              {pagination.page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={pagination.page >= totalPages}
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              className="p-1 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-muted)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              aria-label="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

