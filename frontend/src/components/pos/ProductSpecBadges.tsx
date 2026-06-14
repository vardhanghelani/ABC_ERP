import { cn } from '@/lib/utils'
import {
  getProductSpecs,
  guessColorSwatch,
  type ProductSpecEntry,
} from '@/lib/productAttributes'
import type { Product } from '@/types'

interface ProductSpecBadgesProps {
  product: Pick<Product, 'attributes'>
  entries?: ProductSpecEntry[]
  className?: string
  size?: 'sm' | 'md' | 'lg' | 'hero'
  showLabels?: boolean
}

const kindStyles: Record<ProductSpecEntry['kind'], string> = {
  color:
    'border-[3px] border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)] shadow-[0_0_0_1px_rgba(37,99,235,0.15)]',
  size:
    'border-[3px] border-[var(--color-warning)] bg-[var(--color-warning-light)] text-[#92400e] shadow-[0_0_0_1px_rgba(217,119,6,0.15)]',
  other:
    'border-2 border-[var(--color-info)]/50 bg-[var(--color-info-light)] text-[var(--color-info)]',
}

const sizeStyles: Record<NonNullable<ProductSpecBadgesProps['size']>, {
  text: string
  padding: string
  swatch: string
  gap: string
  label: string
}> = {
  sm: {
    text: 'text-[11px]',
    padding: 'px-2.5 py-1',
    swatch: 'h-3.5 w-3.5',
    gap: 'gap-1.5',
    label: 'text-[9px]',
  },
  md: {
    text: 'text-[13px]',
    padding: 'px-3 py-1.5',
    swatch: 'h-4 w-4',
    gap: 'gap-2',
    label: 'text-[10px]',
  },
  lg: {
    text: 'text-[15px]',
    padding: 'px-3.5 py-2',
    swatch: 'h-5 w-5',
    gap: 'gap-2',
    label: 'text-[11px]',
  },
  hero: {
    text: 'text-[17px] sm:text-[18px]',
    padding: 'px-4 py-2.5',
    swatch: 'h-6 w-6',
    gap: 'gap-2.5',
    label: 'text-[11px]',
  },
}

function specDisplayText(spec: ProductSpecEntry, showLabels: boolean): string {
  if (spec.kind === 'color') return spec.value
  if (spec.kind === 'size') return showLabels ? `Size: ${spec.value}` : `Size ${spec.value}`
  return showLabels ? `${spec.label}: ${spec.value}` : spec.value
}

function specKindLabel(kind: ProductSpecEntry['kind']): string {
  if (kind === 'color') return 'Colour'
  if (kind === 'size') return 'Size'
  return 'Spec'
}

export function ProductSpecBadges({
  product,
  entries,
  className,
  size = 'md',
  showLabels = true,
}: ProductSpecBadgesProps) {
  const specs = entries ?? getProductSpecs(product)
  if (specs.length === 0) return null

  const styles = sizeStyles[size]

  return (
    <div className={cn('flex flex-wrap', styles.gap, className)}>
      {specs.map((spec) => {
        const swatch = spec.kind === 'color' ? guessColorSwatch(spec.value) : null
        return (
          <span
            key={`${spec.key}-${spec.value}`}
            className={cn(
              'inline-flex flex-col rounded-[var(--radius-lg)] font-bold leading-tight',
              styles.padding,
              kindStyles[spec.kind],
              size === 'hero' && 'min-w-[88px] shadow-[var(--shadow-sm)]'
            )}
          >
            {showLabels && (
              <span
                className={cn(
                  'mb-0.5 font-semibold uppercase tracking-[0.12em] opacity-80',
                  styles.label
                )}
              >
                {specKindLabel(spec.kind)}
              </span>
            )}
            <span className={cn('inline-flex items-center normal-case', styles.gap, styles.text)}>
              {swatch && (
                <span
                  className={cn('shrink-0 rounded-full border-2 border-black/15 shadow-sm', styles.swatch)}
                  style={{ backgroundColor: swatch }}
                  aria-hidden
                />
              )}
              {specDisplayText(spec, showLabels)}
            </span>
          </span>
        )
      })}
    </div>
  )
}

/** Highlighted wrapper for POS — specs are the primary focus */
export function ProductSpecHighlight({
  product,
  className,
  size = 'hero',
}: {
  product: Pick<Product, 'attributes'>
  className?: string
  size?: 'lg' | 'hero'
}) {
  const specs = getProductSpecs(product)
  if (specs.length === 0) {
    return (
      <div
        className={cn(
          'rounded-[var(--radius-lg)] border-2 border-dashed border-[var(--color-border-medium)] bg-[var(--color-bg-sunken)] px-3 py-2',
          className
        )}
      >
        <p className="text-[var(--text-sm)] font-medium text-[var(--color-text-muted)]">
          No colour / size on this product
        </p>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'rounded-[var(--radius-xl)] border-2 border-[var(--color-accent)]/25 bg-[var(--color-accent-light)]/50 p-2.5 ring-1 ring-[var(--color-accent)]/10',
        className
      )}
    >
      <ProductSpecBadges product={product} entries={specs} size={size} showLabels />
    </div>
  )
}
