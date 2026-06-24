import { Product } from '../models';
import { collectSearchTokens, type SearchableProduct } from './productSearchTokens';

/** Lowercase concatenation of all searchable tokens — indexed for Mongo-side search. */
export function buildProductSearchText(product: SearchableProduct): string {
  return collectSearchTokens(product).join(' ').toLowerCase();
}

/** Backfill searchText for products created before this field existed. */
export async function ensureProductSearchText(): Promise<void> {
  const missing = await Product.find({
    $or: [{ searchText: { $exists: false } }, { searchText: '' }],
  })
    .select('_id name sku barcode brand description unitType warehouse status category supplier attributes purchasePrice wholesalePrice retailPrice sellingPrice minimumBunch currentStock minStock reorderLevel')
    .populate('category', 'name code')
    .populate('supplier', 'name')
    .lean();

  if (missing.length === 0) return;

  const bulk = missing.map((doc) => ({
    updateOne: {
      filter: { _id: doc._id },
      update: { $set: { searchText: buildProductSearchText(doc as SearchableProduct) } },
    },
  }));

  await Product.bulkWrite(bulk);
  console.log(`[search] Backfilled searchText for ${missing.length} product(s)`);
}

export async function refreshProductSearchText(productId: string): Promise<void> {
  const product = await Product.findById(productId)
    .select('name sku barcode brand description unitType warehouse status category supplier attributes purchasePrice wholesalePrice retailPrice sellingPrice minimumBunch currentStock minStock reorderLevel')
    .populate('category', 'name code')
    .populate('supplier', 'name')
    .lean();

  if (!product) return;

  await Product.updateOne(
    { _id: productId },
    { $set: { searchText: buildProductSearchText(product as SearchableProduct) } }
  );
}
