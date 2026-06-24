import type { Product } from '@/types'
import { normalizeScannedBarcode } from '@/lib/posBarcode'

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

type SearchableProduct = Pick<
  Product,
  | 'name'
  | 'sku'
  | 'barcode'
  | 'brand'
  | 'description'
  | 'unitType'
  | 'attributes'
  | 'purchasePrice'
  | 'wholesalePrice'
  | 'retailPrice'
  | 'sellingPrice'
  | 'minimumBunch'
  | 'currentStock'
  | 'minStock'
  | 'reorderLevel'
  | 'status'
>

function collectSearchTokens(product: SearchableProduct): string[] {
  const attributeEntries: string[] = []
  const attrs = product.attributes
  if (attrs && typeof attrs === 'object') {
    Object.entries(attrs).forEach(([key, value]) => {
      attributeEntries.push(String(key), String(value ?? ''))
    })
  }

  return [
    product.name,
    product.sku,
    product.barcode,
    product.brand,
    product.description,
    product.unitType,
    product.status,
    String(product.purchasePrice ?? ''),
    String(product.wholesalePrice ?? ''),
    String(product.retailPrice ?? ''),
    String(product.sellingPrice ?? ''),
    String(product.minimumBunch ?? ''),
    String(product.currentStock ?? ''),
    String(product.minStock ?? ''),
    String(product.reorderLevel ?? ''),
    ...attributeEntries,
  ].filter((token): token is string => Boolean(token && String(token).trim().length > 0))
}

/** Mirrors backend productMatchesQuery for identical POS local/server results. */
export function productMatchesQuery(product: SearchableProduct, query: string): boolean {
  const trimmed = query.trim()
  if (!trimmed) return false

  const tokens = collectSearchTokens(product)
  const terms = trimmed.split(/\s+/).filter((t) => t.length > 0)

  return terms.every((term) => {
    const termRegex = new RegExp(escapeRegex(term), 'i')
    const termNum = Number(term.replace(/,/g, ''))

    if (tokens.some((t) => termRegex.test(t))) return true
    if (!Number.isNaN(termNum) && tokens.some((t) => Number(t) === termNum)) return true

    const lowerTerm = term.toLowerCase()
    return tokens.some((t) => t.toLowerCase().includes(lowerTerm))
  })
}

export interface PosProductCachePayload {
  products: Product[]
  version: string
  count: number
}

export interface PosTopSellersPayload {
  productIds: string[]
  version: string
}

export const POS_PRODUCT_CACHE_KEY = '/products/pos-cache'
export const POS_TOP_SELLERS_KEY = '/products/top-sellers'

export function searchPosProductsLocally(
  products: Product[],
  query: string,
  limit = 50
): Product[] {
  const q = query.trim()
  if (q.length < 2) return []
  return products.filter((product) => productMatchesQuery(product, q)).slice(0, limit)
}

export function findProductByBarcodeLocally(
  products: Product[],
  code: string
): Product | undefined {
  const normalized = normalizeScannedBarcode(code)
  if (!normalized) return undefined
  return products.find(
    (p) =>
      normalizeScannedBarcode(p.barcode ?? '') === normalized ||
      p.sku.toUpperCase() === normalized.toUpperCase()
  )
}

const RECENT_KEY = 'pos-recent-product-ids'
const RECENT_LIMIT = 12

export function getRecentProductIds(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

export function rememberRecentProduct(productId: string): void {
  const prev = getRecentProductIds().filter((id) => id !== productId)
  localStorage.setItem(RECENT_KEY, JSON.stringify([productId, ...prev].slice(0, RECENT_LIMIT)))
}

export function buildQuickPickProducts(
  products: Product[],
  topProductIds: string[] = [],
  recentIds: string[] = getRecentProductIds(),
  limit = 12
): Product[] {
  const byId = new Map(products.map((p) => [p._id, p]))
  const orderedIds = [...recentIds, ...topProductIds]
  const seen = new Set<string>()
  const picks: Product[] = []

  for (const id of orderedIds) {
    if (seen.has(id)) continue
    const product = byId.get(id)
    if (!product) continue
    seen.add(id)
    picks.push(product)
    if (picks.length >= limit) break
  }

  return picks
}
