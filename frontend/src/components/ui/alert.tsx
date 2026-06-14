import { cn } from '@/lib/utils'
import { AlertCircle, CheckCircle2, Info, X, XCircle } from 'lucide-react'

type AlertVariant = 'info' | 'success' | 'warning' | 'error'

const config: Record<AlertVariant, { icon: React.ElementType; border: string; bg: string }> = {
  info: { icon: Info, border: 'var(--color-info)', bg: 'var(--color-info-light)' },
  success: { icon: CheckCircle2, border: 'var(--color-success)', bg: 'var(--color-success-light)' },
  warning: { icon: AlertCircle, border: 'var(--color-warning)', bg: 'var(--color-warning-light)' },
  error: { icon: XCircle, border: 'var(--color-danger)', bg: 'var(--color-danger-light)' },
}

export function Alert({
  variant = 'info',
  title,
  description,
  onDismiss,
  className,
}: {
  variant?: AlertVariant
  title: string
  description?: string
  onDismiss?: () => void
  className?: string
}) {
  const { icon: Icon, border, bg } = config[variant]
  return (
    <div
      className={cn('flex gap-3 rounded-[var(--radius-md)] border-l-4 p-4', className)}
      style={{ borderLeftColor: border, backgroundColor: bg }}
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0" style={{ color: border }} />
      <div className="flex-1">
        <p className="text-[var(--text-sm)] font-semibold text-[var(--color-text-primary)]">{title}</p>
        {description && <p className="mt-1 text-[var(--text-sm)] text-[var(--color-text-secondary)]">{description}</p>}
      </div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
