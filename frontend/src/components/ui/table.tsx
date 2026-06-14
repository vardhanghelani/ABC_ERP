import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight, ChevronsUpDown } from 'lucide-react'
import { Checkbox } from './checkbox'
import { EmptyState } from './empty-state'
import { TableSkeleton } from './skeleton'
import { Button } from './button'
import { Select } from './select'

export function Table({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full border-collapse text-left', className)}>{children}</table>
    </div>
  )
}

export function TableHeader({ children }: { children: React.ReactNode }) {
  return (
    <thead className="sticky top-0 z-10 bg-[var(--color-bg-surface)]">
      {children}
    </thead>
  )
}

export function TableBody({ children }: { children: React.ReactNode }) {
  return <tbody>{children}</tbody>
}

export function TableRow({
  children,
  selected,
  onClick,
  className,
}: {
  children: React.ReactNode
  selected?: boolean
  onClick?: () => void
  className?: string
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        'h-12 border-b border-[var(--color-border-soft)] transition-colors duration-100',
        'odd:bg-[var(--color-bg-surface)] even:bg-[var(--color-bg-base)]',
        'hover:bg-[var(--color-bg-elevated)]',
        selected && 'border-l-[3px] border-l-[var(--color-accent)] bg-[var(--color-accent-light)]',
        onClick && 'cursor-pointer',
        className
      )}
    >
      {children}
    </tr>
  )
}

export function TableHead({
  children,
  className,
  sortable,
  sorted,
  onSort,
  align = 'left',
}: {
  children?: React.ReactNode
  className?: string
  sortable?: boolean
  sorted?: 'asc' | 'desc' | null
  onSort?: () => void
  align?: 'left' | 'right' | 'center'
}) {
  const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  return (
    <th
      className={cn(
        'border-b border-[var(--color-border-soft)] px-4 py-3',
        'text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--color-text-muted)]',
        sortable && 'cursor-pointer select-none hover:text-[var(--color-text-secondary)]',
        alignClass,
        className
      )}
      onClick={sortable ? onSort : undefined}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {sortable && <ChevronsUpDown className={cn('h-3.5 w-3.5', sorted && 'text-[var(--color-accent)]')} />}
      </span>
    </th>
  )
}

export function TableCell({
  children,
  className,
  mono,
  align = 'left',
  colSpan,
}: {
  children?: React.ReactNode
  className?: string
  mono?: boolean
  align?: 'left' | 'right' | 'center'
  colSpan?: number
}) {
  const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  return (
    <td
      colSpan={colSpan}
      className={cn('px-4 py-3 text-[var(--text-base)] text-[var(--color-text-primary)]', mono && 'font-data', alignClass, className)}
    >
      {children}
    </td>
  )
}

export function DataTablePagination({
  page,
  limit,
  total,
  onPageChange,
  onLimitChange,
}: {
  page: number
  limit: number
  total: number
  onPageChange: (p: number) => void
  onLimitChange?: (l: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const from = total === 0 ? 0 : (page - 1) * limit + 1
  const to = Math.min(page * limit, total)

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--color-border-soft)] px-4 py-3">
      <p className="text-[var(--text-sm)] text-[var(--color-text-muted)]">
        Showing {from}–{to} of {total.toLocaleString('en-IN')} items
      </p>
      <div className="flex items-center gap-3">
        {onLimitChange && (
          <Select value={String(limit)} onChange={(e) => onLimitChange(Number(e.target.value))} className="w-20">
            <option value="10">10</option>
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </Select>
        )}
        <div className="flex gap-1">
          <Button variant="secondary" size="sm" iconOnly disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="flex items-center px-2 text-[var(--text-sm)] text-[var(--color-text-secondary)]">
            {page} / {totalPages}
          </span>
          <Button variant="secondary" size="sm" iconOnly disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

export function BulkActionBar({
  count,
  onClear,
  children,
}: {
  count: number
  onClear: () => void
  children: React.ReactNode
}) {
  if (count === 0) return null
  return (
    <div className="flex items-center gap-4 rounded-[var(--radius-md)] bg-[var(--color-accent-light)] px-4 py-2">
      <span className="text-[var(--text-sm)] font-medium text-[var(--color-accent)]">{count} selected</span>
      {children}
      <Button variant="ghost" size="sm" onClick={onClear}>Clear</Button>
    </div>
  )
}

export function DataTableWrapper({
  loading,
  empty,
  emptyTitle,
  emptyDescription,
  emptyAction,
  onEmptyAction,
  children,
}: {
  loading?: boolean
  empty?: boolean
  emptyTitle?: string
  emptyDescription?: string
  emptyAction?: string
  onEmptyAction?: () => void
  children: React.ReactNode
}) {
  if (loading) return <TableSkeleton />
  if (empty) {
    return (
      <EmptyState
        title={emptyTitle || 'No data found'}
        description={emptyDescription || 'Try adjusting your filters or add new records.'}
        actionLabel={emptyAction}
        onAction={onEmptyAction}
      />
    )
  }
  return <>{children}</>
}

export { Checkbox as TableCheckbox }
