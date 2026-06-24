/** Normalize barcode values from USB HID scanners (strip wrapper asterisks, trim). */
export function normalizeScannedBarcode(raw: string): string {
  return raw.trim().replace(/^\*|\*$/g, '').toUpperCase()
}

export function looksLikeCategoryBarcode(value: string): boolean {
  return /^[A-Z]{3}-\d{6}$/.test(normalizeScannedBarcode(value))
}
