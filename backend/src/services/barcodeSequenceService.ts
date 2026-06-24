import mongoose from 'mongoose';
import { BarcodeSequence, Product } from '../models';
import { ApiError } from '../utils/ApiError';

const BARCODE_PATTERN = /^[A-Z]{3}-\d{6}$/;

export function formatBarcode(prefix: string, sequence: number): string {
  const normalizedPrefix = prefix.toUpperCase().trim().slice(0, 3);
  if (!/^[A-Z]{3}$/.test(normalizedPrefix)) {
    throw new ApiError(400, 'Barcode prefix must be exactly 3 uppercase letters');
  }
  if (sequence < 1 || sequence > 999_999) {
    throw new ApiError(400, 'Barcode sequence out of range');
  }
  return `${normalizedPrefix}-${String(sequence).padStart(6, '0')}`;
}

export function normalizeBarcodeValue(value: string): string {
  return value.trim().replace(/^\*|\*$/g, '').toUpperCase();
}

export function isValidBarcodeFormat(value: string): boolean {
  return BARCODE_PATTERN.test(normalizeBarcodeValue(value));
}

/** Atomically allocate the next barcode for a category prefix (transaction-safe). */
export async function allocateNextBarcode(
  prefix: string,
  session?: mongoose.ClientSession
): Promise<string> {
  const normalizedPrefix = prefix.toUpperCase().trim().slice(0, 3);
  if (!/^[A-Z]{3}$/.test(normalizedPrefix)) {
    throw new ApiError(400, `Invalid barcode prefix "${prefix}"`);
  }

  const seq = await BarcodeSequence.findOneAndUpdate(
    { prefix: normalizedPrefix },
    { $inc: { lastValue: 1 } },
    { upsert: true, new: true, session, setDefaultsOnInsert: true }
  );

  if (!seq) throw new ApiError(500, 'Failed to allocate barcode sequence');

  return formatBarcode(normalizedPrefix, seq.lastValue);
}

export async function assertBarcodeAvailable(
  barcode: string,
  session?: mongoose.ClientSession
): Promise<void> {
  const normalized = normalizeBarcodeValue(barcode);
  if (!isValidBarcodeFormat(normalized)) {
    throw new ApiError(400, 'Barcode must match format PREFIX-000001 (3 letters, dash, 6 digits)');
  }

  const existing = await Product.findOne({ barcode: normalized }).session(session ?? null);
  if (existing) throw new ApiError(409, `Barcode "${normalized}" is already assigned`);
}

/** Sync sequence counters from existing product barcodes after migration. */
export async function syncBarcodeSequencesFromProducts(): Promise<void> {
  const products = await Product.find({ barcode: { $regex: /^[A-Z]{3}-\d{6}$/ } }).select('barcode').lean();

  const maxByPrefix = new Map<string, number>();
  for (const product of products) {
    const [prefix, seqPart] = (product.barcode as string).split('-');
    const seq = parseInt(seqPart, 10);
    if (!prefix || Number.isNaN(seq)) continue;
    maxByPrefix.set(prefix, Math.max(maxByPrefix.get(prefix) ?? 0, seq));
  }

  for (const [prefix, maxValue] of maxByPrefix) {
    await BarcodeSequence.findOneAndUpdate(
      { prefix },
      { $max: { lastValue: maxValue } },
      { upsert: true, setDefaultsOnInsert: true }
    );
  }
}
