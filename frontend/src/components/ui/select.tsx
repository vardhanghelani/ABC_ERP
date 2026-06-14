import { cn } from '@/lib/utils'
import { ChevronDown } from 'lucide-react'
import { type SelectHTMLAttributes, forwardRef } from 'react'

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { error?: string }>(
  ({ className, error, children, ...props }, ref) => (
    <div className="relative w-full">
      <select
        ref={ref}
        className={cn(
          'flex h-9 w-full appearance-none rounded-[var(--radius-md)] border bg-[var(--color-bg-sunken)] px-3 pr-9',
          'text-[var(--text-base)] text-[var(--color-text-primary)]',
          'border-[var(--color-border-soft)] transition-colors duration-150',
          'focus:outline-none focus:border-[var(--color-accent)] focus:[box-shadow:0_0_0_3px_rgba(37,99,235,0.12)]',
          error && 'border-[var(--color-danger)]',
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
      {error && <p className="mt-1 text-[var(--text-xs)] text-[var(--color-danger)]">{error}</p>}
    </div>
  )
)
Select.displayName = 'Select'
