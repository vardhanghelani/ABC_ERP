import crypto from 'crypto';
import mongoose from 'mongoose';
import { Sale, SaleStatus, ISale } from '../models/Sale';

const POS_DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

export interface PosFingerprintInput {
  customer?: string;
  items: { product: string; quantity: number; unitPrice: number; discount?: number }[];
  total: number;
  paidAmount: number;
}

export function buildPosSaleFingerprint(userId: string, input: PosFingerprintInput): string {
  const items = [...input.items]
    .map((i) => `${i.product}:${i.quantity}:${i.unitPrice}:${i.discount ?? 0}`)
    .sort()
    .join('|');
  const raw = `${userId}|${input.customer ?? ''}|${items}|${input.total}|${input.paidAmount}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/** Block identical POS submits within a short window (double-click / retry storms). */
export async function findRecentDuplicatePosSale(
  userId: string,
  fingerprint: string,
  session?: mongoose.ClientSession
): Promise<ISale | null> {
  return Sale.findOne({
    createdBy: userId,
    isPos: true,
    status: SaleStatus.COMPLETED,
    posFingerprint: fingerprint,
    createdAt: { $gte: new Date(Date.now() - POS_DUPLICATE_WINDOW_MS) },
  })
    .sort({ createdAt: -1 })
    .session(session || null);
}

export async function findSaleByIdempotencyKey(
  userId: string,
  key: string,
  session?: mongoose.ClientSession
) {
  return Sale.findOne({
    idempotencyKey: key,
    createdBy: userId,
    status: SaleStatus.COMPLETED,
  }).session(session || null);
}
