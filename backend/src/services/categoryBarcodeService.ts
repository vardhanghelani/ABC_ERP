import mongoose from 'mongoose';
import { Category } from '../models';

const PREFIX_PATTERN = /^[A-Z]{3}$/;

export function deriveBarcodePrefixFromCode(code: string): string {
  const cleaned = code.toUpperCase().replace(/[^A-Z]/g, '');
  if (cleaned.length >= 3) return cleaned.slice(0, 3);
  return cleaned.padEnd(3, 'X').slice(0, 3);
}

export async function ensureUniqueBarcodePrefix(
  desired: string,
  excludeCategoryId?: mongoose.Types.ObjectId
): Promise<string> {
  let candidate = desired.toUpperCase().slice(0, 3);
  if (!PREFIX_PATTERN.test(candidate)) {
    candidate = 'GEN';
  }

  for (let attempt = 0; attempt < 100; attempt++) {
    const suffix = attempt === 0 ? '' : String(attempt);
    const prefix = `${candidate.slice(0, 3 - suffix.length)}${suffix}`.slice(0, 3);
    const filter: Record<string, unknown> = { barcodePrefix: prefix };
    if (excludeCategoryId) filter._id = { $ne: excludeCategoryId };

    const existing = await Category.findOne(filter).select('_id');
    if (!existing) return prefix;
  }

  throw new Error(`Unable to allocate unique barcode prefix for "${desired}"`);
}

export async function ensureCategoryBarcodePrefixes(): Promise<void> {
  const categories = await Category.find({
    $or: [{ barcodePrefix: { $exists: false } }, { barcodePrefix: null }, { barcodePrefix: '' }],
  });

  if (categories.length === 0) return;

  for (const category of categories) {
    const derived = deriveBarcodePrefixFromCode(category.code);
    category.barcodePrefix = await ensureUniqueBarcodePrefix(derived, category._id);
    await category.save();
  }

  console.log(`[barcode] Assigned barcodePrefix to ${categories.length} categor(ies)`);
}
