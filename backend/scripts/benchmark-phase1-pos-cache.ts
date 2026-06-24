/**
 * Phase 1 POS cache benchmark — run: npx ts-node scripts/benchmark-phase1-pos-cache.ts
 */
import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import { performance } from 'node:perf_hooks';
import { gzipSync } from 'node:zlib';
import { Product } from '../src/models';
import { Sale, SaleStatus } from '../src/models/Sale';
import { computePosCacheVersion } from '../src/services/posCacheVersionService';
import { getPosProductCache, POS_PRODUCT_SELECT } from '../src/services/productSearchService';
import { getTopSellerProductIds } from '../src/services/posTopSellersService';

async function timeMs(fn: () => Promise<unknown>): Promise<number> {
  const start = performance.now();
  await fn();
  return performance.now() - start;
}

async function simulateBefore() {
  const [products, topSold] = await Promise.all([
    Product.find({ status: 'active' }).select(POS_PRODUCT_SELECT).sort({ name: 1 }).lean(),
    Sale.aggregate([
      {
        $match: {
          status: SaleStatus.COMPLETED,
          createdAt: { $gte: new Date(Date.now() - 30 * 86400000) },
        },
      },
      { $unwind: '$items' },
      { $group: { _id: '$items.product', totalQty: { $sum: '$items.quantity' } } },
      { $sort: { totalQty: -1 } },
      { $limit: 15 },
    ]),
  ]);
  const maxUpdated = products.reduce((max, p) => {
    const ts = (p as { updatedAt?: Date }).updatedAt ? new Date((p as { updatedAt?: Date }).updatedAt!).getTime() : 0;
    return Math.max(max, ts);
  }, 0);
  return {
    products,
    version: `${products.length}-${maxUpdated}`,
    topProductIds: topSold.map((r: { _id: mongoose.Types.ObjectId }) => String(r._id)),
  };
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  await Product.findOne(); // warm pool

  // BEFORE (legacy shape + parallel agg)
  const beforeRuns: number[] = [];
  let beforePayload = '';
  for (let i = 0; i < 5; i++) {
    beforeRuns.push(await timeMs(async () => simulateBefore()));
  }
  const beforeData = await simulateBefore();
  beforePayload = JSON.stringify({ success: true, message: 'Success', data: beforeData });
  const beforeGzip = gzipSync(Buffer.from(beforePayload));

  // AFTER — full 200 response (parallel version + products, no sales agg)
  const afterFullRuns: number[] = [];
  let afterPayload = '';
  for (let i = 0; i < 5; i++) {
    afterFullRuns.push(await timeMs(async () => getPosProductCache()));
  }
  const afterData = await getPosProductCache();
  afterPayload = JSON.stringify({ success: true, message: 'Success', data: afterData });
  const afterGzip = gzipSync(Buffer.from(afterPayload));

  // AFTER — 304 path (version only)
  const after304Runs: number[] = [];
  for (let i = 0; i < 10; i++) {
    after304Runs.push(await timeMs(async () => computePosCacheVersion()));
  }

  // Top sellers separate
  const topRuns: number[] = [];
  for (let i = 0; i < 5; i++) {
    topRuns.push(await timeMs(async () => getTopSellerProductIds()));
  }

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

  console.log(
    JSON.stringify(
      {
        environment: 'MongoDB Atlas via MONGODB_URI (includes network RTT)',
        activeProducts: afterData.count,
        before: {
          description: 'Product find + sales aggregation in parallel, includes topProductIds in payload',
          avgLoadMs: +avg(beforeRuns).toFixed(2),
          jsonBytes: Buffer.byteLength(beforePayload),
          gzipBytes: beforeGzip.length,
        },
        after: {
          posCacheFull: {
            description: 'Product find only, no sales aggregation',
            avgLoadMs: +avg(afterFullRuns).toFixed(2),
            jsonBytes: Buffer.byteLength(afterPayload),
            gzipBytes: afterGzip.length,
          },
          posCache304Path: {
            description: 'computePosCacheVersion only (server path when If-None-Match matches)',
            avgMs: +avg(after304Runs).toFixed(2),
            responseBytes: 0,
          },
          topSellersEndpoint: {
            avgMs: +avg(topRuns).toFixed(2),
          },
        },
        bandwidthOnUnchangedRefetch: {
          beforeBytes: beforeGzip.length,
          after304Bytes: 0,
          bytesSaved: beforeGzip.length,
          savingsPercent: 100,
        },
        payloadReduction: {
          beforeJsonBytes: Buffer.byteLength(beforePayload),
          afterJsonBytes: Buffer.byteLength(afterPayload),
          jsonBytesSaved: Buffer.byteLength(beforePayload) - Buffer.byteLength(afterPayload),
        },
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
