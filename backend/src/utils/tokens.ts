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

/** Atomic monthly sequence — safe under concurrent requests. */
export const generateDocumentNumber = async (
  prefix: string,
  _model?: mongoose.Model<unknown>,
  _field?: string,
  session?: mongoose.ClientSession
): Promise<string> => {
  const date = new Date();
  const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
  const key = `${prefix}-${dateStr}`;

  const counter = await DocumentCounter.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { returnDocument: 'after', upsert: true, session, setDefaultsOnInsert: true }
  );

  return `${key}-${String(counter!.seq).padStart(5, '0')}`;
};
