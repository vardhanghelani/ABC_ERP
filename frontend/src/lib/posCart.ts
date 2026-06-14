import type { Product } from '@/types'
import { getMinimumBunch, getSellingPrice, snapToBunch } from '@/lib/productSales'
import { roundMoney } from '@/lib/posTotals'

export interface PosCartLine {
  lineId: string
  product: Product
  quantity: number
  unitPrice: number
  discount: number
}

export function getProductId(product: Pick<Product, '_id'> & { id?: string }): string {
  const id = product._id ?? product.id
  return id != null ? String(id) : ''
}

export function createCartLine(product: Product, quantity?: number): PosCartLine {
  const step = getMinimumBunch(product)
  return {
    lineId: crypto.randomUUID(),
    product,
    quantity: quantity ?? step,
    unitPrice: getSellingPrice(product),
    discount: 0,
  }
}

export function calcLineTotal(quantity: number, unitPrice: number): number {
  return roundMoney(quantity * unitPrice)
}

/** Parse typed qty; returns null if field is empty or invalid while typing. */
export function parseQuantityInput(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

export function normalizeCartQuantity(
  raw: string | number,
  product: Product
): { quantity: number; adjusted: boolean; message?: string } {
  const step = getMinimumBunch(product)
  const maxStock = product.currentStock

  let parsed: number
  if (typeof raw === 'number') {
    parsed = raw
  } else {
    const fromInput = parseQuantityInput(raw)
    if (fromInput == null) {
      return { quantity: step, adjusted: true, message: `Minimum quantity is ${step.toLocaleString('en-IN')} pcs` }
    }
    parsed = fromInput
  }

  let qty = snapToBunch(parsed, step)
  let adjusted = qty !== parsed

  if (qty > maxStock) {
    qty = snapToBunch(maxStock, step)
    adjusted = true
    return {
      quantity: qty,
      adjusted,
      message: `Adjusted to available stock (${qty.toLocaleString('en-IN')} pcs)`,
    }
  }

  if (qty < step) {
    qty = step
    adjusted = true
  }

  return { quantity: qty, adjusted, message: adjusted ? `Quantity must be in multiples of ${step.toLocaleString('en-IN')}` : undefined }
}

export function stepCartQuantity(current: number, product: Product, direction: 1 | -1): number | null {
  const step = getMinimumBunch(product)
  const next = current + direction * step
  if (next < step) return null
  if (next > product.currentStock) return null
  return next
}

export function formatQuantityDisplay(quantity: number): string {
  return quantity > 0 ? String(quantity) : ''
}
