import { performance } from 'node:perf_hooks';
import { Response } from 'express';
import { z } from 'zod';
import { Product, Category, CategoryField } from '../models';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { logAudit } from '../middleware/auditLog';
import { AuditAction } from '../models/AuditLog';
import { generateUniqueBarcode, generateSKU } from '../services/barcodeService';
import { paramId } from '../utils/params';
import { cloudinary } from '../config/cloudinary';
import { validateProductAttributes } from '../utils/validateAttributes';
import { updateStock } from '../services/stockService';
import { InventoryTransactionType } from '../models/InventoryTransaction';
import { searchProductsMongo, findProductByBarcode, getPosProductCache as loadPosProductCache } from '../services/productSearchService';
import { refreshProductSearchText, buildProductSearchText } from '../services/productSearchTextService';
import {
  createProductSearchTimer,
  createEmptySearchTimings,
  logProductSearchPerformance,
} from '../utils/productSearchPerformance';
import { sanitizeInteger, sanitizeMoney } from '../utils/numbers';

const moneyField = z.preprocess((v) => sanitizeMoney(v), z.number().min(0));
const intField = (min: number) => z.preprocess((v) => sanitizeInteger(v, min), z.number().min(min));

export const productSchema = z.object({
  name: z.string().min(1),
  category: z.string(),
  brand: z.string().optional(),
  description: z.string().optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  minStock: intField(0).optional(),
  openingStock: intField(0).optional(),
  reorderLevel: intField(0).optional(),
  minimumBunch: intField(1).optional(),
  sellingPrice: moneyField.optional(),
  purchasePrice: moneyField.optional(),
  wholesalePrice: moneyField.optional(),
  retailPrice: moneyField.optional(),
  status: z.enum(['active', 'inactive']).optional(),
  supplier: z.string().optional(),
  warehouse: z.string().optional(),
  unitType: z.string().optional(),
  sku: z.string().optional(),
  barcode: z.string().optional(),
});

export const getProducts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {};
  if (req.query.category) filter.category = req.query.category;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.barcode) filter.barcode = req.query.barcode;
  if (req.query.lowStock === 'true') {
    filter.$expr = { $lte: ['$currentStock', '$reorderLevel'] };
  }

  const searchTerm = (req.query.search as string)?.trim();
  if (searchTerm && searchTerm.length >= 2) {
    const results = await searchProductsMongo(searchTerm, {
      limit: limit + skip,
      category: req.query.category as string | undefined,
      status: req.query.status as string | undefined,
      comprehensive: true,
    });
    const paginated = results.slice(skip, skip + limit);
    return ApiResponse.paginated(res, paginated, { page, limit, total: results.length });
  }

  // Dynamic attribute search
  if (req.query.attributeKey && req.query.attributeValue) {
    filter[`attributes.${req.query.attributeKey}`] = req.query.attributeValue;
  }

  const [products, total] = await Promise.all([
    Product.find(filter)
      .populate('category', 'name code')
      .populate('supplier', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Product.countDocuments(filter),
  ]);

  ApiResponse.paginated(res, products, { page, limit, total });
});

export const getProduct = asyncHandler(async (req: AuthRequest, res: Response) => {
  const product = await Product.findById(req.params.id)
    .populate('category', 'name code')
    .populate('supplier', 'name phone');
  if (!product) throw new ApiError(404, 'Product not found');
  ApiResponse.success(res, product);
});

export const getProductByBarcode = asyncHandler(async (req: AuthRequest, res: Response) => {
  const barcode = paramId(req.params.barcode);
  const timer = createProductSearchTimer();
  const mongoStart = performance.now();
  const product = await findProductByBarcode(barcode);
  const mongoEnd = performance.now();

  if (!product) throw new ApiError(404, 'Product not found');

  const serializeStart = performance.now();
  ApiResponse.success(res, product);
  const serializationMs = performance.now() - serializeStart;
  const responseSendStart = performance.now();

  res.once('finish', () => {
    logProductSearchPerformance({
      query: barcode,
      mode: 'barcode',
      mongoQueryMs: mongoEnd - mongoStart,
      populateMs: 0,
      formattingMs: 0,
      serializationMs,
      responseSendMs: performance.now() - responseSendStart,
      totalMs: timer.elapsedMs(),
      resultCount: 1,
    });
  });
});

export const getPosProductCache = asyncHandler(async (req: AuthRequest, res: Response) => {
  const timer = createProductSearchTimer();
  const mongoStart = performance.now();
  const cache = await loadPosProductCache();
  const mongoEnd = performance.now();

  const etag = `"${cache.version}"`;
  res.set('Cache-Control', 'private, max-age=60');
  res.set('ETag', etag);

  if (req.headers['if-none-match'] === etag) {
    res.status(304).end();
    return;
  }

  const serializeStart = performance.now();
  ApiResponse.success(res, cache);
  const serializationMs = performance.now() - serializeStart;
  const responseSendStart = performance.now();

  res.once('finish', () => {
    logProductSearchPerformance({
      query: 'pos-cache',
      mode: 'cache',
      mongoQueryMs: mongoEnd - mongoStart,
      populateMs: 0,
      formattingMs: 0,
      serializationMs,
      responseSendMs: performance.now() - responseSendStart,
      totalMs: timer.elapsedMs(),
      resultCount: cache.count,
    });
  });
});

export const advancedSearch = asyncHandler(async (req: AuthRequest, res: Response) => {
  const timer = createProductSearchTimer();
  const q = (req.query.q as string)?.trim() || '';
  const category = req.query.category as string | undefined;
  const supplier = req.query.supplier as string | undefined;
  const status = (req.query.status as string | undefined) || 'active';
  const comprehensive = req.query.comprehensive !== 'false';

  if (q.length < 2) {
    ApiResponse.success(res, []);
    return;
  }

  const timings = createEmptySearchTimings();
  const products = await searchProductsMongo(q, {
    limit: 50,
    category,
    supplier,
    status,
    timings,
    comprehensive,
  });

  res.set('Cache-Control', 'private, no-cache');

  const serializeStart = performance.now();
  ApiResponse.success(res, products);
  timings.serializationMs = performance.now() - serializeStart;
  const responseSendStart = performance.now();

  res.once('finish', () => {
    logProductSearchPerformance({
      query: q,
      mode: comprehensive ? 'server-comprehensive' : 'server',
      mongoQueryMs: timings.mongoQueryMs,
      populateMs: timings.populateMs,
      formattingMs: timings.formattingMs,
      serializationMs: timings.serializationMs,
      responseSendMs: performance.now() - responseSendStart,
      totalMs: timer.elapsedMs(),
      resultCount: products.length,
    });
  });
});

export const createProduct = asyncHandler(async (req: AuthRequest, res: Response) => {
  const category = await Category.findById(req.body.category);
  if (!category) throw new ApiError(404, 'Category not found');

  // Validate dynamic attributes against category fields
  const fields = await CategoryField.find({ category: category._id, isActive: true });
  const normalizedAttributes = validateProductAttributes(
    fields,
    req.body.attributes || {}
  );

  const sku = req.body.sku || generateSKU(category.code);
  const barcode = req.body.barcode || generateUniqueBarcode();
  const openingStock = sanitizeInteger(req.body.openingStock, 0);
  const { openingStock: _omit, ...productData } = req.body;

  const product = await Product.create({
    ...productData,
    sku: sku.toUpperCase(),
    barcode,
    attributes: normalizedAttributes,
    searchText: buildProductSearchText({
      ...productData,
      sku: sku.toUpperCase(),
      barcode,
      attributes: normalizedAttributes,
      category: { name: category.name, code: category.code },
    }),
    createdBy: req.user!._id,
  });

  if (openingStock > 0) {
    await updateStock({
      productId: product._id.toString(),
      type: InventoryTransactionType.STOCK_IN,
      quantity: openingStock,
      userId: req.user!._id.toString(),
      reference: product.sku,
      referenceId: product._id.toString(),
      referenceModel: 'Product',
      notes: 'Opening stock on product creation',
    });
  }

  const created = openingStock > 0 ? await Product.findById(product._id) : product;

  await logAudit(req, AuditAction.CREATE, 'Product', product._id.toString(), openingStock > 0 ? { openingStock } : undefined);
  ApiResponse.success(res, created, 'Product created', 201);
});

const PRODUCT_UPDATE_FIELDS = [
  'name',
  'category',
  'brand',
  'description',
  'attributes',
  'minStock',
  'reorderLevel',
  'minimumBunch',
  'sellingPrice',
  'purchasePrice',
  'wholesalePrice',
  'retailPrice',
  'status',
  'supplier',
  'warehouse',
  'unitType',
] as const;

export const updateProductSchema = productSchema.partial().omit({ openingStock: true, sku: true, barcode: true });

export const updateProduct = asyncHandler(async (req: AuthRequest, res: Response) => {
  const product = await Product.findById(req.params.id);
  if (!product) throw new ApiError(404, 'Product not found');

  if ('currentStock' in req.body || 'openingStock' in req.body) {
    throw new ApiError(400, 'Stock cannot be edited directly. Use inventory stock-in/out or audit.');
  }

  const updateBody: Record<string, unknown> = {};
  for (const field of PRODUCT_UPDATE_FIELDS) {
    if (req.body[field] !== undefined) {
      updateBody[field] = req.body[field];
    }
  }

  if (updateBody.attributes || updateBody.category) {
    const categoryId = (updateBody.category as string) || product.category.toString();
    const fields = await CategoryField.find({ category: categoryId, isActive: true });
    if (updateBody.attributes) {
      updateBody.attributes = validateProductAttributes(fields, req.body.attributes);
    }
    if (updateBody.category) {
      const category = await Category.findById(categoryId);
      if (!category) throw new ApiError(404, 'Category not found');
    }
  }

  const updated = await Product.findByIdAndUpdate(req.params.id, updateBody, { new: true, runValidators: true });
  if (!updated) throw new ApiError(404, 'Product not found');
  await refreshProductSearchText(updated._id.toString());
  await logAudit(req, AuditAction.UPDATE, 'Product', updated._id.toString(), req.body);
  ApiResponse.success(res, updated, 'Product updated');
});

export const deleteProduct = asyncHandler(async (req: AuthRequest, res: Response) => {
  const product = await Product.findByIdAndUpdate(req.params.id, { status: 'inactive' }, { new: true });
  if (!product) throw new ApiError(404, 'Product not found');
  await logAudit(req, AuditAction.DELETE, 'Product', paramId(req.params.id));
  ApiResponse.success(res, null, 'Product deactivated');
});

export const reactivateProduct = asyncHandler(async (req: AuthRequest, res: Response) => {
  const product = await Product.findById(req.params.id);
  if (!product) throw new ApiError(404, 'Product not found');
  if (product.status === 'active') {
    ApiResponse.success(res, product, 'Product is already active');
    return;
  }

  product.status = 'active';
  await product.save();
  await refreshProductSearchText(product._id.toString());
  await logAudit(req, AuditAction.UPDATE, 'Product', product._id.toString(), { status: 'active' });
  ApiResponse.success(res, product, 'Product reactivated');
});

export const uploadProductImage = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.file) throw new ApiError(400, 'No image uploaded');

  const result = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'jewellery-erp/products', transformation: [{ width: 800, crop: 'limit' }] },
      (error: Error | undefined, result: { secure_url: string; public_id: string } | undefined) => {
        if (error) reject(error);
        else resolve(result as { secure_url: string; public_id: string });
      }
    );
    stream.end(req.file!.buffer);
  });

  const product = await Product.findById(req.params.id);
  if (!product) throw new ApiError(404, 'Product not found');

  product.images.push({ url: result.secure_url, publicId: result.public_id, isPrimary: product.images.length === 0 });
  await product.save();

  ApiResponse.success(res, product, 'Image uploaded');
});
