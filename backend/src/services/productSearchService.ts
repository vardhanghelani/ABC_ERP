import { performance } from 'node:perf_hooks';
import mongoose from 'mongoose';
import { Product } from '../models';
import { escapeRegex, productMatchesQuery, type SearchableProduct } from './productSearchTokens';
import type { ProductSearchTimings } from '../utils/productSearchPerformance';
import { computePosCacheVersion } from './posCacheVersionService';
import { normalizeBarcodeValue } from './barcodeSequenceService';

export { escapeRegex, productMatchesQuery, collectSearchTokens, type SearchableProduct } from './productSearchTokens';

/** Fields required for POS cart, search dropdown, and barcode scan. */
export const POS_PRODUCT_SELECT =
  '_id name sku barcode sellingPrice wholesalePrice retailPrice currentStock minimumBunch reorderLevel attributes status updatedAt';

export type PosCacheProduct = Pick<
  SearchableProduct,
  | 'name'
  | 'sku'
  | 'barcode'
  | 'sellingPrice'
  | 'wholesalePrice'
  | 'retailPrice'
  | 'currentStock'
  | 'minimumBunch'
  | 'reorderLevel'
  | 'attributes'
  | 'status'
> & { _id: string; updatedAt?: string };

export interface SearchOptions {
  limit?: number;
  category?: string;
  supplier?: string;
  status?: string;
  timings?: ProductSearchTimings;
  /** When true, apply in-memory attribute/spec matching after Mongo pre-filter. */
  comprehensive?: boolean;
}

function buildBaseFilter(options: SearchOptions): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  filter.status = options.status ?? 'active';
  if (options.category) filter.category = new mongoose.Types.ObjectId(options.category);
  if (options.supplier) filter.supplier = new mongoose.Types.ObjectId(options.supplier);
  return filter;
}

/** Mongo-side search using indexed searchText field (includes name, sku, barcode, specs). */
function buildMongoSearchFilter(query: string, baseFilter: Record<string, unknown>): Record<string, unknown> {
  const terms = query.trim().split(/\s+/).filter((t) => t.length > 0);
  if (terms.length === 0) return baseFilter;

  const termClauses = terms.map((term) => ({
    searchText: { $regex: escapeRegex(term), $options: 'i' },
  }));

  return {
    ...baseFilter,
    $and: termClauses,
  };
}

export async function searchProductsMongo(
  query: string,
  options: SearchOptions = {}
): Promise<SearchableProduct[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const limit = options.limit ?? 50;
  const baseFilter = buildBaseFilter(options);
  const filter = buildMongoSearchFilter(q, baseFilter);

  const mongoStart = performance.now();
  let products = await Product.find(filter)
    .select(POS_PRODUCT_SELECT)
    .sort({ name: 1 })
    .limit(options.comprehensive ? limit * 2 : limit)
    .lean();
  const mongoEnd = performance.now();

  const formatStart = performance.now();
  if (options.comprehensive) {
    products = products.filter((product) => productMatchesQuery(product as SearchableProduct, q));
  }
  const results = products.slice(0, limit) as SearchableProduct[];
  const formatEnd = performance.now();

  if (options.timings) {
    options.timings.mongoQueryMs = mongoEnd - mongoStart;
    options.timings.populateMs = 0;
    options.timings.formattingMs = formatEnd - formatStart;
  }

  return results;
}

/** Backward-compatible alias used by product list search and advanced search. */
export async function searchProductsComprehensive(
  query: string,
  options: SearchOptions = {}
): Promise<SearchableProduct[]> {
  return searchProductsMongo(query, { ...options, comprehensive: true });
}

export async function getPosProductCache(precomputedVersion?: string): Promise<{
  products: PosCacheProduct[];
  version: string;
  count: number;
}> {
  const productsPromise = Product.find({ status: 'active' })
    .select(POS_PRODUCT_SELECT)
    .sort({ name: 1 })
    .lean();

  if (precomputedVersion) {
    const products = await productsPromise;
    const typed = products as unknown as PosCacheProduct[];
    return {
      products: typed,
      count: typed.length,
      version: precomputedVersion,
    };
  }

  const [products, version] = await Promise.all([productsPromise, computePosCacheVersion()]);
  const typed = products as unknown as PosCacheProduct[];

  return {
    products: typed,
    count: typed.length,
    version,
  };
}

export async function findProductByBarcode(barcode: string): Promise<SearchableProduct | null> {
  const normalized = normalizeBarcodeValue(barcode);
  const product = await Product.findOne({ barcode: normalized, status: 'active' })
    .select(POS_PRODUCT_SELECT)
    .lean();
  return product as SearchableProduct | null;
}
