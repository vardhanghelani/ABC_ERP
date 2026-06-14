import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

export function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-[var(--text-sm)]">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />}
          {item.href ? (
            <Link to={item.href} className="text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors">
              {item.label}
            </Link>
          ) : (
            <span className="font-medium text-[var(--color-text-primary)]">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}

export function PageHeader({
  title,
  description,
  badge,
  breadcrumbs,
  actions,
}: {
  title: string
  description?: string
  badge?: React.ReactNode
  breadcrumbs?: { label: string; href?: string }[]
  actions?: React.ReactNode
}) {
  return (
    <div className="mb-6">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <div className="mb-2"><Breadcrumb items={breadcrumbs} /></div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-[var(--text-xl)] font-semibold text-[var(--color-text-primary)]">{title}</h1>
            {badge}
          </div>
          {description && <p className="mt-1 text-[var(--text-sm)] text-[var(--color-text-muted)]">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}
