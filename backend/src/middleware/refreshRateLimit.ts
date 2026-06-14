import rateLimit from 'express-rate-limit';

export const refreshRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many token refresh attempts. Try again later.' },
});
