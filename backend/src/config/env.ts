import dotenv from 'dotenv';
dotenv.config();

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

const INSECURE_DEFAULTS = new Set(['access-secret', 'refresh-secret']);

function resolveSecret(name: string, value: string | undefined, devFallback: string): string {
  if (isProduction) {
    if (!value || value.length < 32) {
      throw new Error(`FATAL: ${name} must be set (minimum 32 characters) in production`);
    }
    if (INSECURE_DEFAULTS.has(value)) {
      throw new Error(`FATAL: ${name} must not use the default development value in production`);
    }
    return value;
  }

  if (!value) {
    console.warn(`[env] ${name} not set — using development fallback`);
    return devFallback;
  }
  return value;
}

function resolveMongoUri(value: string | undefined): string {
  const uri = value || 'mongodb://localhost:27017/jewellery_erp';
  if (isProduction && uri.includes('localhost')) {
    throw new Error('FATAL: MONGODB_URI must not point to localhost in production');
  }
  return uri;
}

export const env = {
  nodeEnv,
  isProduction,
  port: parseInt(process.env.PORT || '5000', 10),
  mongoUri: resolveMongoUri(process.env.MONGODB_URI),
  jwtAccessSecret: resolveSecret('JWT_ACCESS_SECRET', process.env.JWT_ACCESS_SECRET, 'access-secret'),
  jwtRefreshSecret: resolveSecret('JWT_REFRESH_SECRET', process.env.JWT_REFRESH_SECRET, 'refresh-secret'),
  jwtAccessExpires: process.env.JWT_ACCESS_EXPIRES || '15m',
  jwtRefreshExpires: process.env.JWT_REFRESH_EXPIRES || '7d',
  /** Comma-separated allowed browser origins for CORS (e.g. http://localhost:5173,https://app.example.com) */
  clientUrls: (process.env.CLIENT_URL || 'http://localhost:5173')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean),
  /** Primary origin — used for redirects/links when a single URL is needed */
  clientUrl: (process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0].trim(),
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
  },
};
