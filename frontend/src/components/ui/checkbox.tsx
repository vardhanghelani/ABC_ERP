import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'

export function Checkbox({
  checked,
  onChange,
  label,
  id,
  className,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
  id?: string
  className?: string
}) {
  const inputId = id || label?.replace(/\s/g, '-').toLowerCase()
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2', className)} htmlFor={inputId}>
      <button
        type="button"
        id={inputId}
        role="checkbox"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border transition-all duration-150',
          checked
            ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white'
            : 'border-[var(--color-border-medium)] bg-[var(--color-bg-surface)]'
        )}
      >
        {checked && <Check className="h-3 w-3" strokeWidth={3} />}
      </button>
      {label && <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">{label}</span>}
    </label>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
  id?: string
}) {
  const inputId = id || label?.replace(/\s/g, '-').toLowerCase()
  return (
    <label className="inline-flex cursor-pointer items-center gap-3" htmlFor={inputId}>
      <button
        type="button"
        id={inputId}
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-5 w-9 rounded-[var(--radius-full)] transition-colors duration-150',
          checked ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border-medium)]'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-[var(--shadow-xs)] transition-transform duration-150',
            checked ? 'translate-x-[18px]' : 'translate-x-0.5'
          )}
        />
      </button>
      {label && <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">{label}</span>}
    </label>
  )
}
