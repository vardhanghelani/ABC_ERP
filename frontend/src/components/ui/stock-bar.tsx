import { cn, getStockLevelPercent, getStockBarColor } from '@/lib/utils'

/** Signature "Living Stock Bars" — visual stock pulse */
export function StockBar({
  current,
  max,
  className,
  showLabel = true,
}: {
  current: number
  max: number
  className?: string
  showLabel?: boolean
}) {
  const percent = getStockLevelPercent(current, max)
  const color = getStockBarColor(percent)

  return (
    <div className={cn('min-w-[80px]', className)}>
      {showLabel && (
        <span className="font-data text-[var(--text-sm)] font-medium text-[var(--color-text-primary)]">
          {current.toLocaleString('en-IN')}
        </span>
      )}
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-[var(--radius-full)] bg-[var(--color-bg-sunken)]">
        <div
          className="h-full rounded-[var(--radius-full)] transition-all duration-300 ease-out"
          style={{ width: `${percent}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

export function StockBarInline({ current, max }: { current: number; max: number }) {
  const percent = getStockLevelPercent(current, max)
  const color = getStockBarColor(percent)
  return (
    <div className="flex items-center gap-2">
      <span className="font-data w-10 text-right text-[var(--text-sm)]">{current}</span>
      <div className="h-1.5 w-16 overflow-hidden rounded-[var(--radius-full)] bg-[var(--color-bg-sunken)]">
        <div className="h-full rounded-[var(--radius-full)] transition-all duration-300" style={{ width: `${percent}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}
