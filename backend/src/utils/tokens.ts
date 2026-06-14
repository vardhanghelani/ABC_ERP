import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { env } from '../config/env';
import { UserRole } from '../utils/permissions';
import { DocumentCounter } from '../models/DocumentCounter';

interface TokenPayload {
  id: string;
  role: UserRole;
}

export const generateAccessToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, env.jwtAccessSecret, { expiresIn: env.jwtAccessExpires } as jwt.SignOptions);
};

export const generateRefreshToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, env.jwtRefreshSecret, { expiresIn: env.jwtRefreshExpires } as jwt.SignOptions);
};

export const verifyRefreshToken = (token: string): TokenPayload => {
  return jwt.verify(token, env.jwtRefreshSecret) as TokenPayload;
};

function buildDocumentKey(prefix: string, date = new Date()): { key: string; dateStr: string } {
  const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
  return { key: `${prefix}-${dateStr}`, dateStr };
}

/** Parse trailing sequence from e.g. INV-202606-00042 → 42 */
function parseDocumentSequence(prefix: string, dateStr: string, value: string): number | null {
  const pattern = new RegExp(`^${prefix}-${dateStr}-(\\d+)$`, 'i');
  const match = value.match(pattern);
  if (!match) return null;
  const seq = parseInt(match[1], 10);
  return Number.isFinite(seq) ? seq : null;
}

/**
 * When DocumentCounter was introduced, existing invoices were not migrated.
 * Bootstrap the counter from the highest existing document number for this month
 * so we never reuse INV-YYYYMM-00001 after sales already exist.
 */
async function bootstrapDocumentCounter(
  key: string,
  prefix: string,
  dateStr: string,
  model: mongoose.Model<unknown> | undefined,
  field: string | undefined,
  session?: mongoose.ClientSession
): Promise<void> {
  const existing = await DocumentCounter.findOne({ key }).session(session || null);
  if (existing) return;
  if (!model || !field) return;

  const pattern = new RegExp(`^${prefix}-${dateStr}-`, 'i');
  const latest = await model
    .findOne({ [field]: pattern })
    .sort({ [field]: -1 })
    .select(field)
    .session(session || null)
    .lean<{ [key: string]: string }>();

  const latestValue = latest?.[field];
  if (!latestValue) return;

  const maxSeq = parseDocumentSequence(prefix, dateStr, latestValue);
  if (!maxSeq || maxSeq <= 0) return;

  await DocumentCounter.findOneAndUpdate(
    { key },
    { $max: { seq: maxSeq } },
    { upsert: true, session, setDefaultsOnInsert: true }
  );
}

/** Atomic monthly sequence — safe under concurrent requests. */
export const generateDocumentNumber = async (
  prefix: string,
  model?: mongoose.Model<unknown>,
  field?: string,
  session?: mongoose.ClientSession
): Promise<string> => {
  const { key, dateStr } = buildDocumentKey(prefix);

  await bootstrapDocumentCounter(key, prefix, dateStr, model, field, session);

  const counter = await DocumentCounter.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { returnDocument: 'after', upsert: true, session, setDefaultsOnInsert: true }
  );

  if (!counter) {
    throw new Error(`Failed to allocate document number for ${key}`);
  }

  return `${key}-${String(counter.seq).padStart(5, '0')}`;
};
