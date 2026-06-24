import { performance } from 'node:perf_hooks';
import { Product } from '../models';
import type { ProductSearchTimings } from '../utils/productSearchPerformance';

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type PopulatedCategory = { name?: string; code?: string } | null | undefined;
type PopulatedSupplier = { name?: string } | null | undefined;

interface SearchableProduct {
  name?: string;
  sku?: string;
  barcode?: string;
  brand?: string;
  description?: string;
  unitType?: string;
  warehouse?: string;
  status?: string;
  category?: PopulatedCategory | string;
  supplier?: PopulatedSupplier | string;
  purchasePrice?: number;
  wholesalePrice?: number;
  retailPrice?: number;
  sellingPrice?: number;
  minimumBunch?: number;
  currentStock?: number;
  minStock?: number;
  reorderLevel?: number;
  attributes?: Record<string, unknown> | Map<string, unknown>;
}

const collectSearchTokens = (product: SearchableProduct): string[] => {
  const category =
    product.category && typeof product.category === 'object'
      ? (product.category as PopulatedCategory)
      : null;
  const supplier =
    product.supplier && typeof product.supplier === 'object'
      ? (product.supplier as PopulatedSupplier)
      : null;

  const attributeEntries: string[] = [];
  const attrs = product.attributes;
  if (attrs instanceof Map) {
    attrs.forEach((value, key) => {
      attributeEntries.push(String(key), String(value ?? ''));
    });
  } else if (attrs && typeof attrs === 'object') {
    Object.entries(attrs).forEach(([key, value]) => {
      attributeEntries.push(String(key), String(value ?? ''));
    });
  }

  return [
    product.name,
    product.sku,
    product.barcode,
    product.brand,
    product.description,
    product.unitType,
    product.warehouse,
    product.status,
    category?.name,
    category?.code,
    supplier?.name,
    String(product.purchasePrice ?? ''),
    String(product.wholesalePrice ?? ''),
    String(product.retailPrice ?? ''),
    String(product.sellingPrice ?? ''),
    String(product.minimumBunch ?? ''),
    String(product.currentStock ?? ''),
    String(product.minStock ?? ''),
    String(product.reorderLevel ?? ''),
    ...attributeEntries,
  ].filter((token): token is string => Boolean(token && String(token).trim().length > 0));
};

/** True if every search term matches at least one product field (name, specs, prices, stock, etc.). */
export const productMatchesQuery = (product: SearchableProduct, query: string): boolean => {
  const trimmed = query.trim();
  if (!trimmed) return false;

  const tokens = collectSearchTokens(product);
  const terms = trimmed.split(/\s+/).filter((t) => t.length > 0);

  return terms.every((term) => {
    const termRegex = new RegExp(escapeRegex(term), 'i');
    const termNum = Number(term.replace(/,/g, ''));

    if (tokens.some((t) => termRegex.test(t))) return true;
    if (!Number.isNaN(termNum) && tokens.some((t) => Number(t) === termNum)) return true;

    const lowerTerm = term.toLowerCase();
    return tokens.some((t) => t.toLowerCase().includes(lowerTerm));
  });
};

export async function searchProductsComprehensive(
  query: string,
  options: {
    limit?: number;
    category?: string;
    supplier?: string;
    status?: string;
    timings?: ProductSearchTimings;
  } = {}
) {
  const q = query.trim();
  if (q.length < 2) return [];

  const filter: Record<string, unknown> = {};
  if (options.status) filter.status = options.status;
  else filter.status = 'active';
  if (options.category) filter.category = options.category;
  if (options.supplier) filter.supplier = options.supplier;

  const mongoQueryStart = performance.now();
  const products = await Product.find(filter)
    .populate('category', 'name code')
    .populate('supplier', 'name')
    .sort({ name: 1 })
    .lean();
  const mongoQueryEnd = performance.now();

  const limit = options.limit ?? 50;
  const results = products
    .filter((product) => productMatchesQuery(product as SearchableProduct, q))
    .slice(0, limit);
  const formattingEnd = performance.now();

  if (options.timings) {
    options.timings.mongoQueryMs = mongoQueryEnd - mongoQueryStart;
    options.timings.formattingMs = formattingEnd - mongoQueryEnd;
  }

  return results;
}
