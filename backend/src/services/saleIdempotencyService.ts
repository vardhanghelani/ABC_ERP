import mongoose from 'mongoose';
import { IdempotencyRecord, IdempotencyStatus } from '../models/IdempotencyRecord';
import { Sale } from '../models/Sale';
import { ApiError } from '../utils/ApiError';

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export async function beginSaleIdempotency(
  userId: string,
  key: string | undefined
): Promise<{ resumeSaleId?: string }> {
  if (!key || key.length < 8) return {};

  const expiresAt = new Date(Date.now() + IDEMPOTENCY_TTL_MS);

  try {
    await IdempotencyRecord.create([{
      key,
      userId,
      scope: 'sale',
      status: IdempotencyStatus.PROCESSING,
      expiresAt,
    }]);
    return {};
  } catch (error) {
    if (!(error instanceof mongoose.mongo.MongoServerError) || error.code !== 11000) {
      throw error;
    }
  }

  const existing = await IdempotencyRecord.findOne({ key, userId, scope: 'sale' });
  if (!existing) return {};

  if (existing.status === IdempotencyStatus.COMPLETED && existing.saleId) {
    return { resumeSaleId: existing.saleId.toString() };
  }

  throw new ApiError(409, 'This sale is already being processed. Please wait a moment.');
}

export async function completeSaleIdempotency(
  userId: string,
  key: string | undefined,
  saleId: string
): Promise<void> {
  if (!key) return;
  await IdempotencyRecord.findOneAndUpdate(
    { key, userId, scope: 'sale' },
    { status: IdempotencyStatus.COMPLETED, saleId },
    { upsert: false }
  );
}

export async function failSaleIdempotency(userId: string, key: string | undefined): Promise<void> {
  if (!key) return;
  await IdempotencyRecord.deleteOne({ key, userId, scope: 'sale', status: IdempotencyStatus.PROCESSING });
}

export async function loadIdempotentSale(saleId: string) {
  const sale = await Sale.findById(saleId);
  if (!sale) throw new ApiError(409, 'Previous sale request completed but invoice was not found');
  return sale;
}
