import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api'
import type { Product } from '@/types'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { SearchInput } from '@/components/ui/search-input'
import { Label } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ProductSpecHighlight } from '@/components/pos/ProductSpecBadges'
import { StockBarInline } from '@/components/ui/stock-bar'
import { cn, formatCurrency } from '@/lib/utils'
import { X } from 'lucide-react'

interface ProductPickerProps {
  value: string
  onChange: (productId: string, product: Product | null) => void
  /** Only active products can receive stock movements; inactive list for reference pages. */
  status?: 'active' | 'inactive'
  disabled?: boolean
  className?: string
}

function getCategoryName(product: Product): string {
  if (!product.category) return '—'
  return typeof product.category === 'string' ? product.category : product.category.name
}

export function ProductPicker({
  value,
  onChange,
  status = 'active',
  disabled,
  className,
}: ProductPickerProps) {
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query, 200)
  const [open, setOpen] = useState(false)

  const { data: selectedProduct } = useQuery({
    queryKey: ['product-picker', 'selected', value],
    queryFn: () => fetchApi<Product>(`/products/${value}`),
    enabled: Boolean(value),
    staleTime: 30_000,
  })

  const { data: searchResults = [], isFetching } = useQuery({
    queryKey: ['product-picker', status, debouncedQuery],
    queryFn: () =>
      fetchApi<Product[]>('/products/search', {
        q: debouncedQuery,
        status,
      }),
    enabled: open && debouncedQuery.trim().length >= 2,
    staleTime: 10_000,
  })

  useEffect(() => {
    if (!value) setQuery('')
  }, [value])

  const pickProduct = (product: Product) => {
    onChange(product._id, product)
    setQuery('')
    setOpen(false)
  }

  const clearSelection = () => {
    onChange('', null)
    setQuery('')
  }

  return (
    <div className={cn('space-y-3', className)}>
      {selectedProduct ? (
        <div className="rounded-[var(--radius-lg)] border-2 border-[var(--color-accent)]/25 bg-[var(--color-accent-light)]/40 p-3">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-[var(--color-text-primary)]">{selectedProduct.name}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[var(--text-xs)] text-[var(--color-text-muted)]">
                <Badge variant="muted">{selectedProduct.sku}</Badge>
                <span>{getCategoryName(selectedProduct)}</span>
                <span>·</span>
                <span>{formatCurrency(selectedProduct.sellingPrice || selectedProduct.wholesalePrice)} / pc</span>
              </div>
            </div>
            {!disabled && (
              <button
                type="button"
                className="rounded-[var(--radius-md)] p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-sunken)]"
                onClick={clearSelection}
                aria-label="Clear product selection"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <ProductSpecHighlight product={selectedProduct} size="md" className="mb-2" />
          <StockBarInline current={selectedProduct.currentStock} max={selectedProduct.reorderLevel * 3} />
          <p className="mt-2 text-[var(--text-sm)] font-medium">
            Current stock:{' '}
            <span className="font-data">{selectedProduct.currentStock.toLocaleString('en-IN')}</span> pcs
          </p>
        </div>
      ) : (
        <div>
          <Label>Search product (name, SKU, colour, size…)</Label>
          <SearchInput
            placeholder="Type at least 2 characters…"
            value={query}
            onChange={(v) => {
              setQuery(v)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            disabled={disabled}
            className="h-11"
          />
          {open && query.trim().length >= 2 && (
            <div className="mt-2 max-h-72 overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--color-border-soft)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-sm)]">
              {isFetching && (
                <p className="px-3 py-4 text-center text-[var(--text-sm)] text-[var(--color-text-muted)]">
                  Searching…
                </p>
              )}
              {!isFetching && searchResults.length === 0 && (
                <p className="px-3 py-4 text-center text-[var(--text-sm)] text-[var(--color-text-muted)]">
                  No {status} products match &quot;{query.trim()}&quot;
                </p>
              )}
              {searchResults.map((product) => (
                <button
                  key={product._id}
                  type="button"
                  className="flex w-full flex-col gap-2 border-b border-[var(--color-border-soft)] px-3 py-3 text-left last:border-0 hover:bg-[var(--color-accent-light)]/50"
                  onClick={() => pickProduct(product)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-[var(--color-text-primary)]">{product.name}</p>
                      <p className="text-[var(--text-xs)] text-[var(--color-text-muted)]">
                        {product.sku} · {getCategoryName(product)} · {product.currentStock} in stock
                      </p>
                    </div>
                    <span className="shrink-0 font-data text-[var(--text-sm)] font-semibold text-[var(--color-accent)]">
                      {formatCurrency(product.sellingPrice || product.wholesalePrice)}
                    </span>
                  </div>
                  <ProductSpecHighlight product={product} size="md" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
