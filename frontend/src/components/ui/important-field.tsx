import { cn } from '@/lib/utils'
import { Label } from './input'
import type { ReactNode } from 'react'

type Variant = 'primary' | 'success' | 'warning' | 'info'

const boxVariants: Record<Variant, string> = {
  primary:
    'border-l-[var(--color-accent)] bg-[var(--color-accent-light)]/75 ring-1 ring-[var(--color-accent)]/20',
  success:
    'border-l-[var(--color-success)] bg-[var(--color-success-light)]/85 ring-1 ring-[var(--color-success)]/20',
  warning:
    'border-l-[var(--color-warning)] bg-[var(--color-warning-light)]/85 ring-1 ring-[var(--color-warning)]/20',
  info:
    'border-l-[var(--color-info)] bg-[var(--color-info-light)]/85 ring-1 ring-[var(--color-info)]/20',
}

const labelVariants: Record<Variant, string> = {
  primary: 'text-[var(--color-accent)]',
  success: 'text-[var(--color-success)]',
  warning: 'text-[var(--color-warning)]',
  info: 'text-[var(--color-info)]',
}

export const importantLabelClass =
  'mb-2 block text-[var(--text-xs)] font-bold uppercase tracking-[0.08em] text-[var(--color-accent)]'

export const importantInputClass =
  'h-11 border-2 border-[var(--color-accent)]/35 bg-white font-semibold text-[var(--color-text-primary)] shadow-[var(--shadow-xs)] focus:border-[var(--color-accent)] focus:[box-shadow:0_0_0_4px_rgba(37,99,235,0.18)]'

export const importantSelectClass =
  'h-11 border-2 border-[var(--color-accent)]/35 bg-white font-semibold shadow-[var(--shadow-xs)]'

export const importantTableHeadClass =
  'bg-[var(--color-accent-light)] !text-[var(--color-accent)] border-b-2 border-[var(--color-accent)]/25'

export const importantTableCellClass =
  'bg-[var(--color-accent-light)]/45 font-semibold text-[var(--color-text-primary)]'

export const importantQtyClass =
  'h-10 w-28 border-2 border-[var(--color-accent)]/40 bg-white text-center font-data text-lg font-bold shadow-[var(--shadow-xs)]'

interface ImportantFieldProps {
  label?: string
  hint?: string
  required?: boolean
  variant?: Variant
  className?: string
  children: ReactNode
  compact?: boolean
}

export function ImportantField({
  label,
  hint,
  required,
  variant = 'primary',
  className,
  children,
  compact,
}: ImportantFieldProps) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-lg)] border border-[var(--color-border-soft)] border-l-[4px] shadow-[var(--shadow-sm)]',
        compact ? 'p-2.5' : 'p-3.5',
        boxVariants[variant],
        className
      )}
    >
      {label && (
        <Label
          className={cn(
            'mb-2 text-[var(--text-xs)] font-bold uppercase tracking-[0.08em]',
            labelVariants[variant]
          )}
        >
          {label}
          {required && <span className="text-[var(--color-danger)]"> *</span>}
        </Label>
      )}
      {children}
      {hint && (
        <p className="mt-2 text-[var(--text-xs)] leading-relaxed text-[var(--color-text-secondary)]">{hint}</p>
      )}
    </div>
  )
}

export function ImportantSection({
  title,
  description,
  className,
  children,
}: {
  title: string
  description?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-xl)] border-2 border-[var(--color-accent)]/25 bg-[var(--color-accent-light)]/40 p-4 shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-accent)]/10',
        className
      )}
    >
      <div className="mb-4 border-b border-[var(--color-accent)]/15 pb-3">
        <h3 className="text-[var(--text-xs)] font-bold uppercase tracking-[0.1em] text-[var(--color-accent)]">
          {title}
        </h3>
        {description && (
          <p className="mt-1 text-[var(--text-sm)] text-[var(--color-text-secondary)]">{description}</p>
        )}
      </div>
      {children}
    </div>
  )
}
