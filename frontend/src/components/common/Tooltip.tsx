import { useState, useRef, type ReactNode } from 'react'

export interface TooltipProps {
  content: ReactNode
  children: ReactNode
  position?: 'top' | 'bottom' | 'left' | 'right'
  className?: string
  delay?: number
}

export function Tooltip({
  content,
  children,
  position = 'top',
  className = '',
  delay = 200,
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false)
  const timerRef = useRef<number | null>(null)

  const showTooltip = () => {
    timerRef.current = window.setTimeout(() => {
      setIsVisible(true)
    }, delay)
  }

  const hideTooltip = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setIsVisible(false)
  }

  const positionStyles = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  }[position]

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
    >
      {children}
      {isVisible && content && (
        <div
          role="tooltip"
          className={`absolute z-50 px-2.5 py-1 text-[11px] font-medium text-white bg-slate-900 dark:bg-slate-800 rounded-[var(--radius-control)] shadow-lg whitespace-nowrap pointer-events-none animate-in fade-in zoom-in-95 duration-150 ${positionStyles} ${className}`}
        >
          {content}
        </div>
      )}
    </div>
  )
}

