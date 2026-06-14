import { Response } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { Sale, SaleStatus, PaymentMethod, Product, Customer, Settings } from '../models';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { generateDocumentNumber } from '../utils/tokens';
import { updateStock, deductStockBatch } from '../services/stockService';
import { InventoryTransactionType } from '../models/InventoryTransaction';
import { generateInvoicePDF } from '../services/pdfService';
import {
  postSaleLedger,
  reverseSaleLedger,
  checkCreditLimit,
  calculateRiskScore,
} from '../services/ledgerService';
import { resolveSaleCredit } from '../services/creditService';
import { CreditTermType } from '../models';
import { logAudit } from '../middleware/auditLog';
import { AuditAction } from '../models/AuditLog';

const saleItemSchema = z.object({
  product: z.string(),
  quantity: z.number().min(1),
  unitPrice: z.number().min(0),
  discount: z.number().optional(),
});

export const saleSchema = z.object({
  customer: z.string().optional(),
  customerName: z.string().optional(),
  items: z.array(saleItemSchema).min(1),
  discount: z.number().optional(),
  discountType: z.enum(['fixed', 'percentage']).optional(),
  taxRate: z.number().optional(),
  roundOff: z.number().optional(),
  payments: z.array(z.object({
    method: z.nativeEnum(PaymentMethod),
    amount: z.number().min(0),
    reference: z.string().optional(),
  })).min(1),
  notes: z.string().optional(),
  isPos: z.boolean().optional(),
});

export const getSales = asyncHandler(async (req: AuthRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const skip = (page - 1) * limit;
  const filter: Record<string, unknown> = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.customer) filter.customer = req.query.customer;
  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) (filter.createdAt as Record<string, Date>).$gte = new Date(req.query.from as string);
    if (req.query.to) (filter.createdAt as Record<string, Date>).$lte = new Date(req.query.to as string);
  }

  const [sales, total] = await Promise.all([
    Sale.find(filter).populate('customer', 'name phone').sort({ createdAt: -1 }).skip(skip).limit(limit),
    Sale.countDocuments(filter),
  ]);

  ApiResponse.paginated(res, sales, { page, limit, total });
});

export const getSale = asyncHandler(async (req: AuthRequest, res: Response) => {
  const sale = await Sale.findById(req.params.id).populate('customer').populate('createdBy', 'name');
  if (!sale) throw new ApiError(404, 'Sale not found');
  ApiResponse.success(res, sale);
});

export const createSale = asyncHandler(async (req: AuthRequest, res: Response) => {
  const session = await mongoose.startSession();
  let committed = false;

  try {
    session.startTransaction();

    const productIds = req.body.items.map((item: { product: string }) => item.product);
    const products = await Product.find({ _id: { $in: productIds } }).session(session);
    const productMap = new Map(products.map((p) => [p._id.toString(), p]));

    const items = [];
    let subtotal = 0;

    for (const item of req.body.items) {
      const product = productMap.get(item.product);
      if (!product) throw new ApiError(404, 'Product not found');
      if (product.currentStock < item.quantity) {
        throw new ApiError(400, `Insufficient stock for ${product.name}`);
      }

      const itemDiscount = item.discount || 0;
      const itemTotal = item.quantity * item.unitPrice - itemDiscount;
      subtotal += itemTotal;

      items.push({
        product: product._id,
        productName: product.name,
        sku: product.sku,
        barcode: product.barcode,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: itemDiscount,
        tax: 0,
        total: itemTotal,
        attributes: Object.fromEntries(product.attributes || new Map()),
      });
    }

    const discount = req.body.discount || 0;
    const discountType = req.body.discountType || 'fixed';
    const discountAmount = discountType === 'percentage' ? (subtotal * discount) / 100 : discount;
    const taxRate = req.body.taxRate || 0;
    const taxableAmount = subtotal - discountAmount;
    const tax = (taxableAmount * taxRate) / 100;
    const roundOff = req.body.roundOff || 0;
    const total = Math.round(taxableAmount + tax + roundOff);

    if (!req.body.customer) {
      const paidAmount = req.body.payments.reduce((sum: number, p: { amount: number }) => sum + p.amount, 0);
      if (paidAmount < total) {
        throw new ApiError(400, 'Walk-in customers must pay full amount. Select a customer for credit sales.');
      }
    }

    let customerDoc = null;
    if (req.body.customer) {
      customerDoc = await Customer.findById(req.body.customer).session(session);
      if (!customerDoc) throw new ApiError(404, 'Customer not found');
    }

    const credit = resolveSaleCredit(customerDoc, total, req.body.payments);
    const { paidAmount, balanceDue, payments, dueDate, creditTermType } = credit;

    if (customerDoc?.creditTermType === CreditTermType.LONG_TERM && !req.body.customer) {
      throw new ApiError(400, 'Long Term (ACC) credit requires a registered customer');
    }

    if (balanceDue > 0 && !req.body.customer) {
      throw new ApiError(400, 'Customer is required for credit sales');
    }

    let customerName = req.body.customerName;
    if (customerDoc) {
      customerName = customerDoc.name;

      if (balanceDue > 0) {
        const creditCheck = await checkCreditLimit(req.body.customer, balanceDue);
        if (!creditCheck.allowed) {
          throw new ApiError(400, creditCheck.message || 'Credit limit exceeded');
        }
      }
    }

    const invoiceNumber = await generateDocumentNumber('INV', Sale, 'invoiceNumber', session);
    const isPos = req.body.isPos ?? true;

    const sale = await Sale.create(
      [{
        invoiceNumber,
        customer: req.body.customer,
        customerName,
        items,
        payments,
        subtotal,
        discount: discountAmount,
        discountType,
        tax,
        taxRate,
        roundOff,
        total,
        paidAmount,
        changeAmount: Math.max(0, paidAmount - total),
        balanceDue,
        dueDate,
        creditTermType,
        status: SaleStatus.COMPLETED,
        notes: req.body.notes,
        isPos,
        createdBy: req.user!._id,
      }],
      { session }
    );

    const saleId = sale[0]._id.toString();
    const userId = req.user!._id.toString();
    const userName = req.user!.name;

    await deductStockBatch(
      req.body.items.map((item: { product: string; quantity: number }) => ({
        productId: item.product,
        quantity: item.quantity,
      })),
      {
        userId,
        reference: invoiceNumber,
        referenceId: saleId,
        referenceModel: 'Sale',
        session,
      }
    );

    if (req.body.customer && customerDoc?.creditTermType === CreditTermType.LONG_TERM) {
      await postSaleLedger(saleId, userId, userName, session);
    } else if (balanceDue > 0 && req.body.customer) {
      await postSaleLedger(saleId, userId, userName, session);
    } else if (req.body.customer) {
      await Customer.findByIdAndUpdate(
        req.body.customer,
        { $inc: { totalPurchases: total }, lastPurchaseDate: new Date() },
        { session }
      );
    }

    await session.commitTransaction();
    committed = true;

    const customerId = req.body.customer as string | undefined;
    if (customerId && balanceDue > 0) {
      calculateRiskScore(customerId).catch((err) => {
        console.warn(`[sale] Risk score update failed for customer ${customerId}:`, err);
      });
    }

    logAudit(req, AuditAction.INVOICE, 'Sale', saleId, { invoiceNumber, total }).catch((err) => {
      console.warn(`[sale] Audit log failed for ${saleId}:`, err);
    });

    ApiResponse.success(res, sale[0], 'Sale completed', 201);
  } catch (error) {
    if (!committed) {
      await session.abortTransaction();
    }
    throw error;
  } finally {
    session.endSession();
  }
});

export const cancelSale = asyncHandler(async (req: AuthRequest, res: Response) => {
  const session = await mongoose.startSession();
  let committed = false;

  try {
    session.startTransaction();

    const sale = await Sale.findById(req.params.id).session(session);
    if (!sale) throw new ApiError(404, 'Sale not found');
    if (sale.status === SaleStatus.CANCELLED) throw new ApiError(400, 'Sale already cancelled');

    if (sale.customer) {
      await reverseSaleLedger(
        sale._id.toString(),
        req.user!._id.toString(),
        req.user!.name,
        session
      );
    }

    for (const item of sale.items) {
      await updateStock({
        productId: item.product.toString(),
        type: InventoryTransactionType.RETURN,
        quantity: item.quantity,
        userId: req.user!._id.toString(),
        reference: sale.invoiceNumber,
        referenceId: sale._id.toString(),
        referenceModel: 'Sale',
        notes: 'Sale cancelled - stock returned',
        session,
      });
    }

    sale.status = SaleStatus.CANCELLED;
    sale.balanceDue = 0;
    await sale.save({ session });

    await session.commitTransaction();
    committed = true;

    if (sale.customer) {
      calculateRiskScore(sale.customer.toString()).catch((err) => {
        console.warn(`[sale] Risk score update failed after cancel:`, err);
      });
    }

    ApiResponse.success(res, sale, 'Sale cancelled');
  } catch (error) {
    if (!committed) {
      await session.abortTransaction();
    }
    throw error;
  } finally {
    session.endSession();
  }
});

export const downloadInvoicePDF = asyncHandler(async (req: AuthRequest, res: Response) => {
  const sale = await Sale.findById(req.params.id).populate('customer', 'name phone address gstNumber');
  if (!sale) throw new ApiError(404, 'Sale not found');

  const settings = await Settings.find({ group: 'company' });
  const companyInfo: Record<string, string> = {};
  settings.forEach((s) => { companyInfo[s.key] = String(s.value); });

  const customer = sale.customer as { name?: string; phone?: string; address?: string; gstNumber?: string } | undefined;
  const customerInfo = customer
    ? {
        name: customer.name || sale.customerName,
        phone: customer.phone,
        address: customer.address,
        gstNumber: customer.gstNumber,
      }
    : sale.customerName
      ? { name: sale.customerName }
      : undefined;

  const pdf = await generateInvoicePDF(sale, companyInfo, customerInfo);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=${sale.invoiceNumber}.pdf`);
  res.send(pdf);
});
