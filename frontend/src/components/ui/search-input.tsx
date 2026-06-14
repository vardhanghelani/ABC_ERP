import { cn } from '@/lib/utils'
import { Search, X } from 'lucide-react'
import { type InputHTMLAttributes, forwardRef, useEffect, useState } from 'react'

export interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value?: string
  onChange?: (value: string) => void
  debounceMs?: number
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className, value = '', onChange, debounceMs = 200, placeholder = 'Search...', ...props }, ref) => {
    const [local, setLocal] = useState(value)

    useEffect(() => setLocal(value), [value])

    useEffect(() => {
      const t = setTimeout(() => onChange?.(local), debounceMs)
      return () => clearTimeout(t)
    }, [local, debounceMs, onChange])

    return (
      <div className="relative w-full">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
        <input
          ref={ref}
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          placeholder={placeholder}
          className={cn(
            'flex h-9 w-full rounded-[var(--radius-md)] border bg-[var(--color-bg-sunken)] pl-9 pr-9',
            'text-[var(--text-base)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]',
            'border-[var(--color-border-soft)] transition-colors duration-150',
            'focus:outline-none focus:border-[var(--color-accent)] focus:[box-shadow:0_0_0_3px_rgba(37,99,235,0.12)]',
            className
          )}
          {...props}
        />
        {local && (
          <button
            type="button"
            onClick={() => { setLocal(''); onChange?.('') }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)]"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    )
  }
)
SearchInput.displayName = 'SearchInput'
