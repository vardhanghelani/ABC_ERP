/**
 * Barcode Phase 2 benchmark — run: npx ts-node scripts/benchmark-barcode-scan.ts
 */
import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import { performance } from 'node:perf_hooks';
import { Product } from '../src/models';
import { findProductByBarcode, getPosProductCache } from '../src/services/productSearchService';
import { normalizeBarcodeValue } from '../src/services/barcodeSequenceService';

const ITERATIONS = 200;

async function benchmark() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');

  await mongoose.connect(uri);

  const cache = await getPosProductCache();
  const sample = cache.products.find((p) => p.barcode)?.barcode;
  if (!sample) {
    console.error('No products with barcodes found — create products first.');
    process.exit(1);
  }

  const normalized = normalizeBarcodeValue(sample);
  const byBarcode = new Map(cache.products.map((p) => [p.barcode?.toUpperCase(), p]));

  const cacheTimes: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now();
    byBarcode.get(normalized);
    cacheTimes.push(performance.now() - start);
  }

  const apiTimes: number[] = [];
  for (let i = 0; i < 20; i++) {
    const start = performance.now();
    await findProductByBarcode(normalized);
    apiTimes.push(performance.now() - start);
  }

  const avg = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
  const p95 = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  };

  console.log('\n=== Barcode Phase 2 Benchmark ===');
  console.log(`Sample barcode: ${normalized}`);
  console.log(`Cache size: ${cache.products.length} products`);
  console.log(
    `Local cache lookup (${ITERATIONS}x): avg ${avg(cacheTimes).toFixed(3)}ms, p95 ${p95(cacheTimes).toFixed(3)}ms`
  );
  console.log(`Mongo barcode lookup (20x): avg ${avg(apiTimes).toFixed(2)}ms, p95 ${p95(apiTimes).toFixed(2)}ms`);
  console.log('Target total scan flow: <100ms (cache path should be well under)');

  await mongoose.disconnect();
  process.exit(0);
}

benchmark().catch((err) => {
  console.error(err);
  process.exit(1);
});
