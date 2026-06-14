import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'
import { type ButtonHTMLAttributes, forwardRef } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  iconOnly?: boolean
}

const variants: Record<Variant, string> = {
  primary:
    'bg-[var(--color-accent)] text-[var(--color-text-inverse)] hover:bg-[var(--color-accent-hover)] shadow-[var(--shadow-xs)] hover:shadow-[var(--shadow-sm)]',
  secondary:
    'bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] border border-[var(--color-border-medium)] hover:bg-[var(--color-bg-elevated)]',
  ghost:
    'bg-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)]',
  danger:
    'bg-[var(--color-danger)] text-[var(--color-text-inverse)] hover:opacity-90',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[var(--text-sm)]',
  md: 'h-9 px-4 text-[var(--text-base)]',
  lg: 'h-10 px-5 text-[var(--text-base)]',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, iconOnly, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] font-medium',
        'transition-all duration-150 ease-out active:scale-[0.98]',
        'focus-visible:outline-none focus-visible:[box-shadow:var(--focus-ring)]',
        'disabled:opacity-45 disabled:pointer-events-none disabled:active:scale-100',
        variants[variant],
        sizes[size],
        iconOnly && 'w-8 px-0',
        className
      )}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
    </button>
  )
)
Button.displayName = 'Button'
