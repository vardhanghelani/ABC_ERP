/** Money helpers — avoid floating-point drift in POS totals */

export function roundMoney(amount: number): number {
  if (!Number.isFinite(amount)) return 0
  return Math.round((amount + Number.EPSILON) * 100) / 100
}

export function roundToRupee(amount: number): number {
  if (!Number.isFinite(amount)) return 0
  return Math.round(amount)
}

export interface PosCartLine {
  quantity: number
  unitPrice: number
  discount?: number
}

export interface PosTotalsInput {
  cart: PosCartLine[]
  billDiscount: number
  taxRate: number
}

export interface PosTotals {
  itemsGross: number
  lineDiscountTotal: number
  subtotal: number
  billDiscount: number
  taxableAmount: number
  tax: number
  totalBeforeRound: number
  roundOff: number
  total: number
}

/** Single source of truth for POS bill math (matches backend sale totals). */
export function calculatePosTotals(input: PosTotalsInput): PosTotals {
  let itemsGross = 0
  let lineDiscountTotal = 0

  for (const item of input.cart) {
    const gross = roundMoney(item.quantity * item.unitPrice)
    const lineDisc = roundMoney(Math.max(0, item.discount || 0))
    itemsGross += gross
    lineDiscountTotal += lineDisc
  }

  itemsGross = roundMoney(itemsGross)
  lineDiscountTotal = roundMoney(lineDiscountTotal)
  const subtotal = roundMoney(itemsGross - lineDiscountTotal)

  const billDiscount = roundMoney(Math.min(Math.max(0, input.billDiscount || 0), subtotal))
  const taxableAmount = roundMoney(subtotal - billDiscount)
  const tax = roundMoney((taxableAmount * Math.max(0, input.taxRate || 0)) / 100)
  const totalBeforeRound = roundMoney(taxableAmount + tax)
  const total = roundToRupee(totalBeforeRound)
  const roundOff = roundMoney(total - totalBeforeRound)

  return {
    itemsGross,
    lineDiscountTotal,
    subtotal,
    billDiscount,
    taxableAmount,
    tax,
    totalBeforeRound,
    roundOff,
    total,
  }
}

export function parseMoneyInput(raw: string): number {
  const trimmed = raw.trim()
  if (trimmed === '' || trimmed === '.') return 0
  const n = Number(trimmed)
  return Number.isFinite(n) ? Math.max(0, n) : 0
}
