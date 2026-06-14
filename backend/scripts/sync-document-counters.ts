/**
 * One-time sync: align DocumentCounter with highest existing document numbers.
 * Usage: npx ts-node-dev --transpile-only scripts/sync-document-counters.ts
 */
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { connectDB } from '../src/config/database';
import { DocumentCounter } from '../src/models/DocumentCounter';
import { Sale } from '../src/models/Sale';
import { Purchase } from '../src/models/Purchase';
import { Payment } from '../src/models/Payment';
import { Expense } from '../src/models/Expense';
import { Order } from '../src/models/Order';

const PREFIXES: { prefix: string; model: mongoose.Model<unknown>; field: string }[] = [
  { prefix: 'INV', model: Sale, field: 'invoiceNumber' },
  { prefix: 'PO', model: Purchase, field: 'poNumber' },
  { prefix: 'RCP', model: Payment, field: 'paymentNumber' },
  { prefix: 'PAY', model: Payment, field: 'paymentNumber' },
  { prefix: 'EXP', model: Expense, field: 'entryNumber' },
  { prefix: 'ORD', model: Order, field: 'orderNumber' },
];

function parseSeq(prefix: string, dateStr: string, value: string): number | null {
  const match = value.match(new RegExp(`^${prefix}-${dateStr}-(\\d+)$`, 'i'));
  if (!match) return null;
  const seq = parseInt(match[1], 10);
  return Number.isFinite(seq) ? seq : null;
}

async function syncPrefix(prefix: string, model: mongoose.Model<unknown>, field: string) {
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const key = `${prefix}-${dateStr}`;
  const pattern = new RegExp(`^${prefix}-${dateStr}-`, 'i');

  const latest = await model
    .findOne({ [field]: pattern })
    .sort({ [field]: -1 })
    .select(field)
    .lean<{ [k: string]: string }>();

  const latestValue = latest?.[field];
  if (!latestValue) {
    console.log(`[skip] ${key} — no existing documents`);
    return;
  }

  const maxSeq = parseSeq(prefix, dateStr, latestValue);
  if (!maxSeq) {
    console.log(`[skip] ${key} — could not parse ${latestValue}`);
    return;
  }

  const result = await DocumentCounter.findOneAndUpdate(
    { key },
    { $max: { seq: maxSeq } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );

  console.log(`[sync] ${key} → seq=${result?.seq} (from ${latestValue})`);
}

async function main() {
  await connectDB();
  for (const entry of PREFIXES) {
    await syncPrefix(entry.prefix, entry.model, entry.field);
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
