import { Calendar as CalendarIcon, X } from 'lucide-react'
import { Button } from './Button'

export interface DateRange {
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
}

export interface DateRangePickerProps {
  value: DateRange
  onChange: (range: DateRange) => void
  label?: string
  className?: string
  showPresets?: boolean
}

export function DateRangePicker({
  value,
  onChange,
  label,
  className = '',
  showPresets = true,
}: DateRangePickerProps) {
  const handlePreset = (preset: 'thisWeek' | 'lastWeek' | 'last30' | 'all') => {
    const now = new Date()
    const formatDate = (d: Date) => d.toISOString().split('T')[0]

    if (preset === 'thisWeek') {
      const day = now.getDay()
      const diff = now.getDate() - day + (day === 0 ? -6 : 1) // Monday
      const monday = new Date(now.setDate(diff))
      const sunday = new Date(monday)
      sunday.setDate(monday.getDate() + 6)
      onChange({ startDate: formatDate(monday), endDate: formatDate(sunday) })
    } else if (preset === 'lastWeek') {
      const day = now.getDay()
      const diff = now.getDate() - day - 6 // Last Monday
      const lastMonday = new Date(now.setDate(diff))
      const lastSunday = new Date(lastMonday)
      lastSunday.setDate(lastMonday.getDate() + 6)
      onChange({ startDate: formatDate(lastMonday), endDate: formatDate(lastSunday) })
    } else if (preset === 'last30') {
      const past = new Date()
      past.setDate(past.getDate() - 30)
      onChange({ startDate: formatDate(past), endDate: formatDate(new Date()) })
    } else if (preset === 'all') {
      onChange({ startDate: '', endDate: '' })
    }
  }

  const handleClear = () => {
    onChange({ startDate: '', endDate: '' })
  }

  const hasValue = Boolean(value.startDate || value.endDate)

  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && <label className="block text-[12px] font-medium text-[var(--muted)]">{label}</label>}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1.5 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-control)] px-2.5 py-1.5 text-[13px] text-[var(--text)]">
          <CalendarIcon className="w-4 h-4 text-[var(--muted)] shrink-0" />
          <input
            type="date"
            aria-label="Start date"
            value={value.startDate}
            onChange={(e) => onChange({ ...value, startDate: e.target.value })}
            className="bg-transparent border-0 p-0 text-[13px] text-[var(--text)] focus:outline-hidden"
          />
          <span className="text-[var(--muted)]">to</span>
          <input
            type="date"
            aria-label="End date"
            value={value.endDate}
            onChange={(e) => onChange({ ...value, endDate: e.target.value })}
            className="bg-transparent border-0 p-0 text-[13px] text-[var(--text)] focus:outline-hidden"
          />
          {hasValue && (
            <button
              type="button"
              onClick={handleClear}
              className="p-0.5 text-[var(--muted)] hover:text-[var(--text)] rounded cursor-pointer"
              aria-label="Clear date range"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {showPresets && (
          <div className="flex items-center gap-1 text-[11px]">
            <Button variant="ghost" size="xs" onClick={() => handlePreset('thisWeek')}>
              This Week
            </Button>
            <Button variant="ghost" size="xs" onClick={() => handlePreset('lastWeek')}>
              Last Week
            </Button>
            <Button variant="ghost" size="xs" onClick={() => handlePreset('last30')}>
              Last 30d
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

