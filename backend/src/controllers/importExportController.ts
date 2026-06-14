import { Response } from 'express';
import ExcelJS from 'exceljs';
import { Product, Category, Customer } from '../models';
import { AuthRequest } from '../middleware/auth';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { generateUniqueBarcode, generateSKU } from '../services/barcodeService';
import { updateStock } from '../services/stockService';
import { InventoryTransactionType } from '../models/InventoryTransaction';

export const exportProducts = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const products = await Product.find().populate('category', 'name code');

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Products');

  sheet.columns = [
    { header: 'SKU', key: 'sku', width: 15 },
    { header: 'Name', key: 'name', width: 30 },
    { header: 'Category', key: 'category', width: 15 },
    { header: 'Barcode', key: 'barcode', width: 20 },
    { header: 'Stock', key: 'stock', width: 10 },
    { header: 'Purchase Price', key: 'purchasePrice', width: 15 },
    { header: 'Wholesale Price', key: 'wholesalePrice', width: 15 },
    { header: 'Retail Price', key: 'retailPrice', width: 15 },
    { header: 'Status', key: 'status', width: 10 },
  ];

  products.forEach((p) => {
    sheet.addRow({
      sku: p.sku,
      name: p.name,
      category: (p.category as unknown as { name: string })?.name || '',
      barcode: p.barcode,
      stock: p.currentStock,
      purchasePrice: p.purchasePrice,
      wholesalePrice: p.wholesalePrice,
      retailPrice: p.retailPrice,
      status: p.status,
    });
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=products.xlsx');
  await workbook.xlsx.write(res);
});

export const exportCustomers = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const customers = await Customer.find({ isActive: true });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Customers');

  sheet.columns = [
    { header: 'Name', key: 'name', width: 25 },
    { header: 'Phone', key: 'phone', width: 15 },
    { header: 'Email', key: 'email', width: 25 },
    { header: 'GST', key: 'gstNumber', width: 20 },
    { header: 'Credit Limit', key: 'creditLimit', width: 15 },
    { header: 'Outstanding', key: 'outstandingAmount', width: 15 },
  ];

  customers.forEach((c) => sheet.addRow(c.toObject()));

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=customers.xlsx');
  await workbook.xlsx.write(res);
});

export const bulkImportProducts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { products: productData } = req.body as {
    products: {
      name: string;
      categoryCode: string;
      purchasePrice?: number;
      wholesalePrice?: number;
      retailPrice?: number;
      stock?: number;
      attributes?: Record<string, unknown>;
    }[];
  };

  const results = { created: 0, failed: 0, errors: [] as string[] };

  for (const item of productData) {
    try {
      const category = await Category.findOne({ code: item.categoryCode.toUpperCase() });
      if (!category) {
        results.failed++;
        results.errors.push(`Category ${item.categoryCode} not found for ${item.name}`);
        continue;
      }

      const product = await Product.create({
        name: item.name,
        sku: generateSKU(category.code),
        category: category._id,
        barcode: generateUniqueBarcode(),
        attributes: item.attributes || {},
        currentStock: 0,
        purchasePrice: item.purchasePrice || 0,
        wholesalePrice: item.wholesalePrice || 0,
        retailPrice: item.retailPrice || 0,
        createdBy: req.user!._id,
      });

      if ((item.stock || 0) > 0) {
        await updateStock({
          productId: product._id.toString(),
          type: InventoryTransactionType.STOCK_IN,
          quantity: item.stock!,
          userId: req.user!._id.toString(),
          reference: product.sku,
          referenceId: product._id.toString(),
          referenceModel: 'Product',
          notes: 'Bulk import opening stock',
        });
      }

      results.created++;
    } catch (err) {
      results.failed++;
      results.errors.push(`${item.name}: ${(err as Error).message}`);
    }
  }

  ApiResponse.success(res, results, 'Bulk import completed');
});

export const bulkStockUpdate = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { updates } = req.body as { updates: { sku: string; stock: number }[] };
  const results = { updated: 0, failed: 0, errors: [] as string[] };

  for (const update of updates) {
    try {
      const product = await Product.findOne({ sku: update.sku.toUpperCase() });
      if (!product) {
        results.failed++;
        results.errors.push(`SKU ${update.sku} not found`);
        continue;
      }

      await updateStock({
        productId: product._id.toString(),
        type: InventoryTransactionType.ADJUSTMENT,
        quantity: update.stock,
        userId: req.user!._id.toString(),
        reference: product.sku,
        referenceId: product._id.toString(),
        referenceModel: 'Product',
        notes: 'Bulk stock adjustment via import',
      });
      results.updated++;
    } catch (err) {
      results.failed++;
      results.errors.push(`${update.sku}: ${(err as Error).message}`);
    }
  }

  ApiResponse.success(res, results, 'Bulk stock update completed');
});
