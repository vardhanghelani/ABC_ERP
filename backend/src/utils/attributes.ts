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
