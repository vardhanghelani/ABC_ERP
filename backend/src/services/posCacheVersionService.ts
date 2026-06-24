import { Product } from '../models';

/**
 * Version token for POS catalog ETag.
 * Changes when active count, total stock, product edits, or catalog membership change.
 * stockSum catches bulkWrite $inc stock moves that skip updatedAt.
 */
export async function computePosCacheVersion(): Promise<string> {
  const [activeStats, catalogStats] = await Promise.all([
    Product.aggregate<{ count: number; stockSum: number; maxUpdated: Date | null }>([
      { $match: { status: 'active' } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          stockSum: { $sum: '$currentStock' },
          maxUpdated: { $max: '$updatedAt' },
        },
      },
    ]),
    Product.aggregate<{ totalCount: number; inactiveCount: number }>([
      {
        $group: {
          _id: null,
          totalCount: { $sum: 1 },
          inactiveCount: { $sum: { $cond: [{ $eq: ['$status', 'inactive'] }, 1, 0] } },
        },
      },
    ]),
  ]);

  const active = activeStats[0] ?? { count: 0, stockSum: 0, maxUpdated: null };
  const catalog = catalogStats[0] ?? { totalCount: 0, inactiveCount: 0 };
  const maxUpdatedTs = active.maxUpdated ? new Date(active.maxUpdated).getTime() : 0;

  return `${active.count}-${active.stockSum}-${maxUpdatedTs}-${catalog.totalCount}-${catalog.inactiveCount}`;
}
