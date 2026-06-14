import { env } from '../config/env';

const ts = () => new Date().toISOString();

export function saleLog(phase: 'START' | 'SUCCESS' | 'FAILED', detail: Record<string, unknown>) {
  const label = `SALE REQUEST ${phase}`;
  console.log(`[${ts()}] ${label}`, JSON.stringify(detail));
}

export function saleErrorLog(error: unknown, context: Record<string, unknown>) {
  const err = error instanceof Error ? error : new Error(String(error));
  console.error(`[${ts()}] SALE REQUEST FAILED`, {
    ...context,
    errorMessage: err.message,
    errorStack: err.stack,
    errorName: err.name,
    ...(error && typeof error === 'object' ? { errorObject: error } : {}),
  });
}

export function isDevDiagnosticsEnabled(): boolean {
  return !env.isProduction || process.env.SALE_DEBUG === 'true';
}
