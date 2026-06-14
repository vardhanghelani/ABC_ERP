import type { Product } from '@/types'

/** Minimum sale step in pieces (e.g. 1000 for 1K AD stone packets). */
export function getMinimumBunch(product: Pick<Product, 'minimumBunch'>): number {
  const bunch = product.minimumBunch
  return bunch && bunch > 0 ? bunch : 1
}

/** POS selling price per piece. */
export function getSellingPrice(product: Pick<Product, 'sellingPrice' | 'wholesalePrice'>): number {
  if (product.sellingPrice != null && product.sellingPrice > 0) return product.sellingPrice
  return product.wholesalePrice ?? 0
}

/** Snap typed quantity to a valid multiple of minimum bunch. */
export function snapToBunch(quantity: number, minimumBunch: number): number {
  const step = minimumBunch > 0 ? minimumBunch : 1
  if (!Number.isFinite(quantity) || quantity <= 0) return step
  if (step <= 1) return Math.max(1, Math.round(quantity))
  const multiples = Math.max(1, Math.round(quantity / step))
  return multiples * step
}

export function formatBunchLabel(minimumBunch: number): string {
  if (minimumBunch >= 1000 && minimumBunch % 1000 === 0) {
    return `${minimumBunch / 1000}K (${minimumBunch.toLocaleString('en-IN')} pcs)`
  }
  return `${minimumBunch.toLocaleString('en-IN')} pcs`
}
