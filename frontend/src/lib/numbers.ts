/** Single source of truth for ERP numeric input + display (no float drift). */

export function roundMoney(amount: number): number {
  if (!Number.isFinite(amount)) return 0
  return Math.round((amount + Number.EPSILON) * 100) / 100
}

export function roundToRupee(amount: number): number {
  if (!Number.isFinite(amount)) return 0
  return Math.round(amount)
}

export function roundInteger(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round(n)
}

/** Parse money from text field — max 2 decimal places. */
export function parseMoneyInput(raw: string): number {
  const trimmed = raw.trim().replace(/,/g, '')
  if (trimmed === '' || trimmed === '.') return 0
  const normalized = trimmed.replace(/[^\d.]/g, '')
  const parts = normalized.split('.')
  const whole = parts[0] || '0'
  const frac = (parts[1] || '').slice(0, 2)
  const n = parseFloat(frac ? `${whole}.${frac}` : whole)
  return Number.isFinite(n) ? roundMoney(Math.max(0, n)) : 0
}

/** Parse whole numbers only (qty, minimum bunch, credit days). */
export function parseIntegerInput(raw: string): number {
  const digits = raw.trim().replace(/,/g, '').replace(/[^\d]/g, '')
  if (digits === '') return 0
  const n = parseInt(digits, 10)
  return Number.isFinite(n) ? n : 0
}

/** Allow typing decimals in money fields without jumping. */
export function sanitizeMoneyDraft(raw: string): string {
  let v = raw.replace(/,/g, '').replace(/[^\d.]/g, '')
  const dot = v.indexOf('.')
  if (dot >= 0) {
    v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '').slice(0, 2)
  }
  return v
}

export function sanitizeIntegerDraft(raw: string): string {
  return raw.replace(/,/g, '').replace(/[^\d]/g, '')
}

export function formatMoneyDraft(value: number): string {
  if (!value) return ''
  return String(roundMoney(value))
}

export function formatIntegerDraft(value: number): string {
  if (!value) return ''
  return String(roundInteger(value))
}
