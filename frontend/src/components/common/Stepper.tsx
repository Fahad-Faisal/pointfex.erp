import { Check } from 'lucide-react'

export interface StepItem {
  id: string
  label: string
  description?: string
}

export interface StepperProps {
  steps: StepItem[]
  currentStep: number // 0-indexed
  onStepClick?: (stepIndex: number) => void
  variant?: 'horizontal' | 'vertical'
  className?: string
}

export function Stepper({
  steps,
  currentStep,
  onStepClick,
  variant = 'horizontal',
  className = '',
}: StepperProps) {
  if (variant === 'vertical') {
    return (
      <div className={`space-y-4 ${className}`}>
        {steps.map((step, idx) => {
          const isDone = idx < currentStep
          const isActive = idx === currentStep
          const canClick = onStepClick && isDone

          return (
            <div
              key={step.id}
              onClick={canClick ? () => onStepClick(idx) : undefined}
              className={`flex items-start gap-3 group ${canClick ? 'cursor-pointer' : ''}`}
            >
              <div className="flex flex-col items-center">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-semibold transition-colors ${
                    isDone
                      ? 'bg-[var(--success)] text-white'
                      : isActive
                        ? 'bg-[var(--primary)] text-white ring-4 ring-[var(--primary-soft)]'
                        : 'bg-[var(--surface-muted)] text-[var(--muted)] border border-[var(--border)]'
                  }`}
                >
                  {isDone ? <Check className="w-4 h-4 stroke-[2.5]" /> : idx + 1}
                </div>
                {idx < steps.length - 1 && (
                  <div
                    className={`w-0.5 h-8 my-1 transition-colors ${
                      isDone ? 'bg-[var(--success)]' : 'bg-[var(--border)]'
                    }`}
                  />
                )}
              </div>
              <div className="pt-0.5">
                <div
                  className={`text-[13px] font-medium transition-colors ${
                    isActive
                      ? 'text-[var(--text)] font-semibold'
                      : isDone
                        ? 'text-[var(--text)]'
                        : 'text-[var(--muted)]'
                  }`}
                >
                  {step.label}
                </div>
                {step.description && (
                  <div className="text-[11px] text-[var(--muted)] mt-0.5">{step.description}</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className={`w-full ${className}`}>
      <div className="flex items-center justify-between">
        {steps.map((step, idx) => {
          const isDone = idx < currentStep
          const isActive = idx === currentStep
          const canClick = onStepClick && isDone

          return (
            <div key={step.id} className="flex-1 flex items-center first:flex-initial last:flex-initial">
              <div
                onClick={canClick ? () => onStepClick(idx) : undefined}
                className={`flex flex-col items-center text-center gap-1.5 ${
                  canClick ? 'cursor-pointer' : ''
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-semibold transition-colors ${
                    isDone
                      ? 'bg-[var(--success)] text-white'
                      : isActive
                        ? 'bg-[var(--primary)] text-white ring-4 ring-[var(--primary-soft)]'
                        : 'bg-[var(--surface-muted)] text-[var(--muted)] border border-[var(--border)]'
                  }`}
                >
                  {isDone ? <Check className="w-4 h-4 stroke-[2.5]" /> : idx + 1}
                </div>
                <span
                  className={`text-[12px] whitespace-nowrap max-w-[90px] sm:max-w-none truncate ${
                    isActive
                      ? 'font-semibold text-[var(--text)]'
                      : isDone
                        ? 'font-medium text-[var(--text)]'
                        : 'text-[var(--muted)]'
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {idx < steps.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-2 transition-colors ${
                    isDone ? 'bg-[var(--success)]' : 'bg-[var(--border)]'
                  }`}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
