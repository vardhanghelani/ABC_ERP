import { performance } from 'node:perf_hooks';

export interface ProductSearchTimings {
  mongoQueryMs: number;
  formattingMs: number;
}

export interface ProductSearchPerformanceLog {
  query: string;
  mongoQueryMs: number;
  formattingMs: number;
  responseSendMs: number;
  totalMs: number;
}

export function createProductSearchTimer() {
  const requestStart = performance.now();
  return {
    requestStart,
    elapsedMs: () => performance.now() - requestStart,
  };
}

export function logProductSearchPerformance(log: ProductSearchPerformanceLog): void {
  const fmt = (ms: number) => `${ms.toFixed(2)}ms`;

  console.log('');
  console.log(`Search: "${log.query}"`);
  console.log('');
  console.log(`Request start: 0ms`);
  console.log(`Mongo query: ${fmt(log.mongoQueryMs)}`);
  console.log(`Formatting: ${fmt(log.formattingMs)}`);
  console.log(`Response send: ${fmt(log.responseSendMs)}`);
  console.log('');
  console.log(`Total: ${fmt(log.totalMs)}`);
  console.log('');
}
