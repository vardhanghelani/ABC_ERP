/** Normalize Mongoose Map or plain object attributes for sale/item snapshots. */
export function toAttributeRecord(attributes: unknown): Record<string, unknown> {
  if (attributes instanceof Map) {
    return Object.fromEntries(attributes);
  }
  if (attributes && typeof attributes === 'object' && !Array.isArray(attributes)) {
    return { ...(attributes as Record<string, unknown>) };
  }
  return {};
}

const SPEC_PRIORITY: Record<string, number> = {
  color: 0,
  colour: 0,
  size: 1,
  carat: 2,
  weight: 3,
  shape: 4,
  material: 5,
  naka: 6,
};

function normalizeSpecKey(key: string): string {
  return key.trim().toLowerCase().replace(/\s+/g, '_');
}

function specLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatAttributeValue(value: unknown): string {
  if (value == null || value === '') return '';
  if (Array.isArray(value)) return value.map(String).join(', ');
  return String(value).trim();
}

/** Human-readable spec string for invoices and labels — e.g. "Colour: White · Size: 8X12". */
export function formatAttributeSummary(attributes: unknown): string {
  const record = toAttributeRecord(attributes);
  const parts = Object.entries(record)
    .map(([key, raw]) => {
      const value = formatAttributeValue(raw);
      if (!value) return null;
      return { key: normalizeSpecKey(key), label: specLabel(key), value };
    })
    .filter((entry): entry is { key: string; label: string; value: string } => entry !== null)
    .sort((a, b) => {
      const pa = SPEC_PRIORITY[a.key] ?? 99;
      const pb = SPEC_PRIORITY[b.key] ?? 99;
      if (pa !== pb) return pa - pb;
      return a.label.localeCompare(b.label);
    })
    .map(({ label, value }) => `${label}: ${value}`);

  return parts.join(' · ');
}

/** Invoice line description: product name plus configuration/specs when present. */
export function formatSaleItemDescription(productName: string, attributes?: unknown): string {
  const specs = formatAttributeSummary(attributes);
  if (!specs) return productName;
  return `${productName}\n${specs}`;
}
