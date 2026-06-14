import mongoose from 'mongoose';
import { PosUserSaleLock } from '../models/PosUserSaleLock';
import { PosSaleFingerprintRegistry } from '../models/PosSaleFingerprintRegistry';
import { ApiError } from '../utils/ApiError';
import { findRecentDuplicatePosSale } from './saleDuplicateGuard';

const USER_LOCK_TTL_MS = 5 * 60 * 1000;
const STALE_USER_LOCK_MS = 90 * 1000;
const FINGERPRINT_TTL_MS = 10 * 60 * 1000;

/** Only one in-flight POS sale per user (blocks parallel duplicate requests). */
export async function acquireUserSaleLock(userId: string, idempotencyKey: string): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + USER_LOCK_TTL_MS);

  const existing = await PosUserSaleLock.findOne({ userId });
  if (existing) {
    const age = now.getTime() - existing.lockedAt.getTime();
    if (age < STALE_USER_LOCK_MS && existing.idempotencyKey !== idempotencyKey) {
      throw new ApiError(409, 'A sale is already in progress. Please wait for it to finish.');
    }
    if (age >= STALE_USER_LOCK_MS) {
      await PosUserSaleLock.deleteOne({ _id: existing._id });
    }
  }

  try {
    await PosUserSaleLock.create([{ userId, idempotencyKey, lockedAt: now, expiresAt }]);
  } catch (error) {
    if (error instanceof mongoose.mongo.MongoServerError && error.code === 11000) {
      const lock = await PosUserSaleLock.findOne({ userId });
      if (lock?.idempotencyKey === idempotencyKey) return;
      throw new ApiError(409, 'A sale is already in progress. Please wait for it to finish.');
    }
    throw error;
  }
}

export async function releaseUserSaleLock(userId: string, idempotencyKey?: string): Promise<void> {
  if (idempotencyKey) {
    await PosUserSaleLock.deleteOne({ userId, idempotencyKey });
    return;
  }
  await PosUserSaleLock.deleteOne({ userId });
}

/** Fast path: return an existing sale for identical cart within the duplicate window. */
export async function findExistingPosSale(
  userId: string,
  fingerprint: string,
  session?: mongoose.ClientSession
) {
  const fromRegistry = await PosSaleFingerprintRegistry.findOne({ userId, fingerprint })
    .session(session || null);
  if (fromRegistry?.saleId) {
    const { Sale } = await import('../models/Sale');
    const sale = await Sale.findById(fromRegistry.saleId).session(session || null);
    if (sale) return sale;
  }
  return findRecentDuplicatePosSale(userId, fingerprint, session);
}

/**
 * Atomically claim this cart fingerprint. On race, returns the sale that won.
 * Call inside the sale transaction after Sale document is created.
 */
export async function claimPosSaleFingerprint(
  userId: string,
  fingerprint: string,
  saleId: string,
  session: mongoose.ClientSession
): Promise<{ claimed: true } | { claimed: false; existingSaleId: string }> {
  try {
    await PosSaleFingerprintRegistry.create(
      [{
        userId,
        fingerprint,
        saleId,
        expiresAt: new Date(Date.now() + FINGERPRINT_TTL_MS),
      }],
      { session }
    );
    return { claimed: true };
  } catch (error) {
    if (!(error instanceof mongoose.mongo.MongoServerError) || error.code !== 11000) {
      throw error;
    }
    const reg = await PosSaleFingerprintRegistry.findOne({ userId, fingerprint }).session(session);
    if (reg?.saleId) {
      return { claimed: false, existingSaleId: reg.saleId.toString() };
    }
    throw error;
  }
}
