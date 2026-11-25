import type { ReactNode, ComponentType } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from './Button'

export interface ErrorStateProps {
  icon?: ComponentType<{ className?: string }>
  title?: string
  description?: string
  error?: Error | string | null
  action?: ReactNode
  onRetry?: () => void
  className?: string
}

export function ErrorState({
  icon: Icon = AlertTriangle,
  title = 'Something went wrong',
  description = 'An error occurred while loading this data. Please try again.',
  error,
  action,
  onRetry,
  className = '',
}: ErrorStateProps) {
  const errorMessage = error instanceof Error ? error.message : error

  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center p-6 sm:p-8 text-center border border-[var(--danger-soft)] rounded-[var(--radius-card)] bg-[var(--danger-soft)]/20 ${className}`}
    >
      <div className="p-3 rounded-[var(--radius-card)] bg-[var(--surface)] border border-[var(--danger-soft)] text-[var(--danger)] shadow-2xs mb-3">
        <Icon className="w-5 h-5" />
      </div>
      <h4 className="text-[14px] font-semibold text-[var(--text)]">{title}</h4>
      <p className="text-[13px] text-[var(--muted)] max-w-sm mt-1 leading-relaxed">{description}</p>
      {errorMessage && (
        <pre className="mt-3 p-2 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-control)] text-[11px] font-mono text-[var(--danger)] max-w-md overflow-x-auto text-left">
          {errorMessage}
        </pre>
      )}
      <div className="mt-4 flex items-center gap-2">
        {onRetry && (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Try again
          </Button>
        )}
        {action}
      </div>
    </div>
  )
}

