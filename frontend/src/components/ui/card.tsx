import { cn } from '@/lib/utils'

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-lg)] border border-[var(--color-border-soft)] bg-[var(--color-bg-surface)] shadow-[var(--shadow-sm)]',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex items-center justify-between border-b border-[var(--color-border-soft)] px-5 py-4', className)} {...props}>
      {children}
    </div>
  )
}

export function CardTitle({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn('text-[var(--text-md)] font-semibold text-[var(--color-text-primary)]', className)} {...props}>
      {children}
    </h3>
  )
}

export function CardContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)} {...props}>{children}</div>
}

export function CardFooter({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex items-center justify-end gap-2 border-t border-[var(--color-border-soft)] px-5 py-4', className)} {...props}>
      {children}
    </div>
  )
}

export function StatCard({
  label,
  value,
  delta,
  deltaLabel,
  accent = 'accent',
  icon: Icon,
  hint,
}: {
  label: string
  value: string
  delta?: number
  deltaLabel?: string
  accent?: 'accent' | 'success' | 'warning' | 'danger' | 'info'
  icon?: React.ElementType
  hint?: string
}) {
  const accentColors = {
    accent: 'var(--color-accent)',
    success: 'var(--color-success)',
    warning: 'var(--color-warning)',
    danger: 'var(--color-danger)',
    info: 'var(--color-info)',
  }

  return (
    <Card className="relative overflow-hidden">
      <div className="absolute left-0 top-0 h-full w-1" style={{ background: accentColors[accent] }} />
      <CardContent className="pl-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[var(--text-xs)] font-medium uppercase tracking-wider text-[var(--color-text-muted)]" title={hint}>{label}</p>
            <p className="mt-1 font-data text-[var(--text-2xl)] font-bold text-[var(--color-text-primary)]">{value}</p>
            {delta !== undefined && (
              <p className={cn('mt-1 text-[var(--text-xs)] font-medium', delta >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]')}>
                {delta >= 0 ? '+' : ''}{delta}% {deltaLabel || 'vs last month'}
              </p>
            )}
          </div>
          {Icon && (
            <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-accent-light)]">
              <Icon className="h-5 w-5 text-[var(--color-accent)]" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
