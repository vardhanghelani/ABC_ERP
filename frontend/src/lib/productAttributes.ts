import type { Product } from '@/types'

export interface ProductSpecEntry {
  key: string
  label: string
  value: string
  kind: 'color' | 'size' | 'other'
}

const SPEC_PRIORITY: Record<string, number> = {
  color: 0,
  colour: 0,
  size: 1,
  carat: 2,
  weight: 3,
  shape: 4,
  material: 5,
}

function normalizeKey(key: string): string {
  return key.trim().toLowerCase().replace(/\s+/g, '_')
}

function specKind(key: string): ProductSpecEntry['kind'] {
  const k = normalizeKey(key)
  if (k === 'color' || k === 'colour') return 'color'
  if (k === 'size') return 'size'
  return 'other'
}

function specLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatValue(value: unknown): string {
  if (value == null || value === '') return ''
  if (Array.isArray(value)) return value.map(String).join(', ')
  return String(value).trim()
}

export function getProductSpecEntries(
  attributes?: Record<string, unknown> | null
): ProductSpecEntry[] {
  if (!attributes) return []

  return Object.entries(attributes)
    .map(([key, raw]) => {
      const value = formatValue(raw)
      if (!value) return null
      const normalized = normalizeKey(key)
      return {
        key: normalized,
        label: specLabel(key),
        value,
        kind: specKind(key),
      }
    })
    .filter((entry): entry is ProductSpecEntry => entry !== null)
    .sort((a, b) => {
      const pa = SPEC_PRIORITY[a.key] ?? 99
      const pb = SPEC_PRIORITY[b.key] ?? 99
      if (pa !== pb) return pa - pb
      return a.label.localeCompare(b.label)
    })
}

export function getProductSpecs(product: Pick<Product, 'attributes'>): ProductSpecEntry[] {
  return getProductSpecEntries(product.attributes)
}

/** Map common colour names to CSS colours for a small swatch dot */
export function guessColorSwatch(value: string): string | null {
  const v = value.toLowerCase().trim()
  const map: Record<string, string> = {
    red: '#dc2626',
    maroon: '#991b1b',
    blue: '#2563eb',
    navy: '#1e3a8a',
    green: '#16a34a',
    yellow: '#ca8a04',
    gold: '#d97706',
    golden: '#d97706',
    silver: '#94a3b8',
    white: '#e5e7eb',
    black: '#111827',
    pink: '#db2777',
    purple: '#7c3aed',
    orange: '#ea580c',
    brown: '#92400e',
    grey: '#6b7280',
    gray: '#6b7280',
    rose: '#f43f5e',
    aqua: '#0891b2',
    cyan: '#0891b2',
  }
  if (map[v]) return map[v]
  if (/^#[0-9a-f]{3,8}$/i.test(v)) return v
  return null
}
