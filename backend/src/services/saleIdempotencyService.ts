import mongoose from 'mongoose';
import { IdempotencyRecord, IdempotencyStatus } from '../models/IdempotencyRecord';
import { ApiError } from '../utils/ApiError';
import { findSaleByIdempotencyKey } from './saleDuplicateGuard';

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const STALE_PROCESSING_MS = 2 * 60 * 1000;

export async function beginSaleIdempotency(
  userId: string,
  key: string | undefined
): Promise<{ resumeSaleId?: string }> {
  if (!key || key.length < 8) return {};

  const existingSale = await findSaleByIdempotencyKey(userId, key);
  if (existingSale) {
    await IdempotencyRecord.findOneAndUpdate(
      { key, userId, scope: 'sale' },
      { status: IdempotencyStatus.COMPLETED, saleId: existingSale._id },
      { upsert: false }
    );
    return { resumeSaleId: existingSale._id.toString() };
  }

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

  const processingAge = Date.now() - existing.createdAt.getTime();
  if (processingAge > STALE_PROCESSING_MS) {
    await IdempotencyRecord.deleteOne({ _id: existing._id });
    try {
      await IdempotencyRecord.create([{
        key,
        userId,
        scope: 'sale',
        status: IdempotencyStatus.PROCESSING,
        expiresAt,
      }]);
      return {};
    } catch (retryError) {
      if (retryError instanceof mongoose.mongo.MongoServerError && retryError.code === 11000) {
        const retryExisting = await IdempotencyRecord.findOne({ key, userId, scope: 'sale' });
        if (retryExisting?.status === IdempotencyStatus.COMPLETED && retryExisting.saleId) {
          return { resumeSaleId: retryExisting.saleId.toString() };
        }
      }
      throw retryError;
    }
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

  const saleWithKey = await findSaleByIdempotencyKey(userId, key);
  if (saleWithKey) {
    await IdempotencyRecord.findOneAndUpdate(
      { key, userId, scope: 'sale' },
      { status: IdempotencyStatus.COMPLETED, saleId: saleWithKey._id },
      { upsert: false }
    );
    return;
  }

  await IdempotencyRecord.deleteOne({ key, userId, scope: 'sale', status: IdempotencyStatus.PROCESSING });
}

export async function loadIdempotentSale(saleId: string) {
  const { Sale } = await import('../models/Sale');
  const sale = await Sale.findById(saleId);
  if (!sale) throw new ApiError(409, 'Previous sale request completed but invoice was not found');
  return sale;
}
