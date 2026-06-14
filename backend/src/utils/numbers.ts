/** Shared numeric sanitization — prevents float drift and bad client values. */

export function sanitizeInteger(value: unknown, min = 0): number {
  if (value === null || value === undefined || value === '') return min;
  const n = typeof value === 'string' ? parseFloat(value.trim()) : Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.round(n));
}

export function sanitizeMoney(value: unknown, min = 0): number {
  if (value === null || value === undefined || value === '') return min;
  const n = typeof value === 'string' ? parseFloat(value.trim()) : Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.round((n + Number.EPSILON) * 100) / 100);
}

export function sanitizeQuantity(value: unknown, min = 1): number {
  return sanitizeInteger(value, min);
}

export function roundMoney(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function roundToRupee(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount);
}
