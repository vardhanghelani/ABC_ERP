import { cn } from '@/lib/utils'

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'muted'

const styles: Record<BadgeVariant, string> = {
  default: 'bg-[var(--color-accent-light)] text-[var(--color-accent)]',
  success: 'bg-[var(--color-success-light)] text-[var(--color-success)]',
  warning: 'bg-[var(--color-warning-light)] text-[var(--color-warning)]',
  danger: 'bg-[var(--color-danger-light)] text-[var(--color-danger)]',
  info: 'bg-[var(--color-info-light)] text-[var(--color-info)]',
  muted: 'bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)]',
}

export function Badge({
  children,
  variant = 'default',
  className,
}: {
  children: React.ReactNode
  variant?: BadgeVariant
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-[var(--radius-full)] px-2 py-0.5',
        'text-[var(--text-xs)] font-semibold uppercase tracking-wide',
        styles[variant],
        className
      )}
    >
      {children}
    </span>
  )
}

export function stockStatusVariant(stock: number, reorderLevel: number): BadgeVariant {
  if (stock === 0) return 'danger'
  if (stock <= reorderLevel) return 'warning'
  return 'success'
}

export function stockStatusLabel(stock: number, reorderLevel: number): string {
  if (stock === 0) return 'Out of Stock'
  if (stock <= reorderLevel) return 'Low Stock'
  return 'In Stock'
}

export function poStatusVariant(status: string): BadgeVariant {
  const map: Record<string, BadgeVariant> = {
    pending: 'info',
    partial: 'warning',
    received: 'success',
    cancelled: 'muted',
    draft: 'muted',
    completed: 'success',
  }
  return map[status] || 'default'
}
