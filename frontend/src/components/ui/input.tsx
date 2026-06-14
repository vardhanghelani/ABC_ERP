import { cn } from '@/lib/utils'
import { type InputHTMLAttributes, forwardRef } from 'react'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => (
    <div className="w-full">
      <input
        ref={ref}
        className={cn(
          'flex h-9 w-full rounded-[var(--radius-md)] border bg-[var(--color-bg-sunken)] px-3',
          'text-[var(--text-base)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]',
          'border-[var(--color-border-soft)] transition-colors duration-150',
          'focus:outline-none focus:border-[var(--color-accent)] focus:[box-shadow:0_0_0_3px_rgba(37,99,235,0.12)]',
          error && 'border-[var(--color-danger)] focus:border-[var(--color-danger)] focus:[box-shadow:0_0_0_3px_rgba(220,38,38,0.12)]',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          className
        )}
        {...props}
      />
      {error && <p className="mt-1 text-[var(--text-xs)] text-[var(--color-danger)]">{error}</p>}
    </div>
  )
)
Input.displayName = 'Input'

export const Textarea = forwardRef<HTMLTextAreaElement, InputHTMLAttributes<HTMLTextAreaElement> & { error?: string }>(
  ({ className, error, ...props }, ref) => (
    <div className="w-full">
      <textarea
        ref={ref}
        className={cn(
          'flex min-h-[80px] w-full resize-y rounded-[var(--radius-md)] border bg-[var(--color-bg-sunken)] px-3 py-2',
          'text-[var(--text-base)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]',
          'border-[var(--color-border-soft)] transition-colors duration-150',
          'focus:outline-none focus:border-[var(--color-accent)] focus:[box-shadow:0_0_0_3px_rgba(37,99,235,0.12)]',
          error && 'border-[var(--color-danger)]',
          className
        )}
        {...props}
      />
      {error && <p className="mt-1 text-[var(--text-xs)] text-[var(--color-danger)]">{error}</p>}
    </div>
  )
)
Textarea.displayName = 'Textarea'

export const Label = ({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
  <label
    className={cn('mb-1.5 block text-[var(--text-sm)] font-medium text-[var(--color-text-secondary)]', className)}
    {...props}
  />
)
