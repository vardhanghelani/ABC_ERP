/**
 * Benchmark product search strategies against live MongoDB.
 * Run: npx ts-node scripts/benchmark-product-search.ts
 */
import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import { performance } from 'node:perf_hooks';
import { Product } from '../src/models';
import { escapeRegex } from '../src/services/productSearchTokens';

const QUERY = process.argv[2] || 'red';
const RUNS = 5;

async function timeMs(fn: () => Promise<unknown>): Promise<number> {
  const start = performance.now();
  await fn();
  return performance.now() - start;
}

function explainSummary(explain: Record<string, unknown>) {
  const stats = explain.executionStats as Record<string, unknown>;
  const stage = stats.executionStages as Record<string, unknown> | undefined;
  const findScan = (s: Record<string, unknown> | undefined): Record<string, unknown> | null => {
    if (!s) return null;
    if (s.stage === 'COLLSCAN' || s.stage === 'IXSCAN') return s;
    if (s.inputStage) return findScan(s.inputStage as Record<string, unknown>);
    return null;
  };
  const scan = findScan(stage);
  return {
    executionTimeMillis: stats.executionTimeMillis,
    totalDocsExamined: stats.totalDocsExamined,
    totalKeysExamined: stats.totalKeysExamined,
    scanStage: scan?.stage,
    indexName: scan?.indexName ?? null,
  };
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const coll = mongoose.connection.db!.collection('products');
  const count = await coll.countDocuments({ status: 'active' });

  console.log(`\n=== Product Search Benchmark ===`);
  console.log(`Query: "${QUERY}" | Active products: ${count}\n`);

  const strategies = [
    {
      name: 'OLD: fetch all active + sort (no search filter)',
      run: async () =>
        Product.find({ status: 'active' })
          .populate('category', 'name code')
          .populate('supplier', 'name')
          .sort({ name: 1 })
          .lean(),
    },
    {
      name: 'NEW: searchText regex + status (no populate)',
      run: async () =>
        Product.find({
          status: 'active',
          searchText: { $regex: escapeRegex(QUERY), $options: 'i' },
        })
          .select('_id name sku barcode sellingPrice wholesalePrice currentStock minimumBunch reorderLevel attributes')
          .sort({ name: 1 })
          .limit(50)
          .lean(),
    },
    {
      name: 'OPTION A: $text index',
      run: async () =>
        Product.find({
          status: 'active',
          $text: { $search: QUERY },
        })
          .select('_id name sku barcode')
          .limit(50)
          .lean(),
    },
    {
      name: 'OPTION B: prefix regex on name/sku/barcode',
      run: async () =>
        Product.find({
          status: 'active',
          $or: [
            { name: { $regex: `^${escapeRegex(QUERY)}`, $options: 'i' } },
            { sku: { $regex: `^${escapeRegex(QUERY)}`, $options: 'i' } },
            { barcode: { $regex: `^${escapeRegex(QUERY)}`, $options: 'i' } },
          ],
        })
          .select('_id name sku barcode')
          .limit(50)
          .lean(),
    },
  ];

  for (const strategy of strategies) {
    const timings: number[] = [];
    let lastCount = 0;
    for (let i = 0; i < RUNS; i++) {
      const ms = await timeMs(strategy.run);
      timings.push(ms);
      if (i === RUNS - 1) {
        const result = await strategy.run();
        lastCount = Array.isArray(result) ? result.length : 0;
      }
    }
    const avg = timings.reduce((a, b) => a + b, 0) / timings.length;
    console.log(`${strategy.name}`);
    console.log(`  avg: ${avg.toFixed(2)}ms | runs: ${timings.map((t) => t.toFixed(1)).join(', ')}ms | results: ${lastCount}`);
  }

  console.log('\n=== explain("executionStats") — searchText strategy ===');
  const explain = await coll
    .find({
      status: 'active',
      searchText: { $regex: escapeRegex(QUERY), $options: 'i' },
    })
    .sort({ name: 1 })
    .limit(50)
    .explain('executionStats');
  console.log(JSON.stringify(explainSummary(explain as Record<string, unknown>), null, 2));
  console.log('\nwinningPlan:', JSON.stringify((explain as { queryPlanner?: { winningPlan?: unknown } }).queryPlanner?.winningPlan, null, 2));

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
