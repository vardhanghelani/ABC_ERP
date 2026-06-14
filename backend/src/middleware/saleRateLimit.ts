import rateLimit from 'express-rate-limit';
import { AuthRequest } from './auth';

/** Hard cap: max POS sale POST attempts per user per minute. */
export const saleCreateRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = (req as AuthRequest).user?._id?.toString();
    return userId ? `sale:${userId}` : req.ip || 'unknown';
  },
  message: {
    success: false,
    message: 'Too many sale attempts. Please wait a moment before trying again.',
  },
});
