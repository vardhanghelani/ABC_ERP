import { performance } from 'node:perf_hooks';

export interface ProductSearchTimings {
  mongoQueryMs: number;
  populateMs: number;
  formattingMs: number;
  serializationMs: number;
  responseSendMs: number;
}

export interface ProductSearchPerformanceLog {
  query: string;
  mode: string;
  mongoQueryMs: number;
  populateMs: number;
  formattingMs: number;
  serializationMs: number;
  responseSendMs: number;
  totalMs: number;
  resultCount: number;
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
  console.log(`Search: "${log.query}" [${log.mode}] (${log.resultCount} results)`);
  console.log('');
  console.log(`Request start:     0ms`);
  console.log(`DB query:          ${fmt(log.mongoQueryMs)}`);
  console.log(`Populate:          ${fmt(log.populateMs)}`);
  console.log(`Formatting:        ${fmt(log.formattingMs)}`);
  console.log(`Serialization:     ${fmt(log.serializationMs)}`);
  console.log(`Response send:     ${fmt(log.responseSendMs)}`);
  console.log('');
  console.log(`Total:             ${fmt(log.totalMs)}`);
  console.log('');
}

export function createEmptySearchTimings(): ProductSearchTimings {
  return {
    mongoQueryMs: 0,
    populateMs: 0,
    formattingMs: 0,
    serializationMs: 0,
    responseSendMs: 0,
  };
}
