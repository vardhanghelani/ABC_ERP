import { cn } from '@/lib/utils'

interface TabsProps {
  tabs: { id: string; label: string }[]
  active: string
  onChange: (id: string) => void
  className?: string
}

export function Tabs({ tabs, active, onChange, className }: TabsProps) {
  return (
    <div className={cn('flex gap-1 rounded-[var(--radius-md)] border border-[var(--color-border-soft)] bg-[var(--color-bg-sunken)] p-1', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cn(
            'flex-1 rounded-[var(--radius-sm)] px-4 py-2 text-[var(--text-sm)] font-medium transition-colors',
            active === tab.id
              ? 'bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] shadow-[var(--shadow-xs)]'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
