import { Button } from './button'
import { PackageOpen } from 'lucide-react'

export function EmptyState({
  icon: Icon = PackageOpen,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon?: React.ElementType
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-[var(--radius-xl)] bg-[var(--color-bg-elevated)]">
        <Icon className="h-8 w-8 text-[var(--color-text-muted)]" strokeWidth={1.5} />
      </div>
      <h3 className="text-[var(--text-md)] font-semibold text-[var(--color-text-primary)]">{title}</h3>
      <p className="mt-2 max-w-xs text-[var(--text-sm)] text-[var(--color-text-muted)]">{description}</p>
      {actionLabel && onAction && (
        <Button className="mt-6" onClick={onAction}>{actionLabel}</Button>
      )}
    </div>
  )
}
