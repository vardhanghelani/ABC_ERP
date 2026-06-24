import mongoose from 'mongoose';
import { Sale, SaleStatus } from '../models/Sale';

const TOP_SELLER_LIMIT = 15;
const LOOKBACK_DAYS = 30;

export async function getTopSellerProductIds(): Promise<string[]> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const rows = await Sale.aggregate<{ _id: mongoose.Types.ObjectId }>([
    { $match: { status: SaleStatus.COMPLETED, createdAt: { $gte: since } } },
    { $unwind: '$items' },
    { $group: { _id: '$items.product', totalQty: { $sum: '$items.quantity' } } },
    { $sort: { totalQty: -1 } },
    { $limit: TOP_SELLER_LIMIT },
  ]);

  return rows.map((row) => String(row._id));
}

/** ETag version for top sellers — changes when latest completed sale timestamp moves. */
export async function computeTopSellersVersion(): Promise<string> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const latest = await Sale.findOne({ status: SaleStatus.COMPLETED, createdAt: { $gte: since } })
    .sort({ createdAt: -1 })
    .select('createdAt')
    .lean<{ createdAt?: Date }>();

  const saleCount = await Sale.countDocuments({ status: SaleStatus.COMPLETED, createdAt: { $gte: since } });
  const latestTs = latest?.createdAt ? new Date(latest.createdAt).getTime() : 0;

  return `top-${saleCount}-${latestTs}`;
}
