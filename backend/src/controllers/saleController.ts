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
  postLedgerEntry,
} from '../services/ledgerService';
import { resolveSaleCredit } from '../services/creditService';
import { CreditTermType } from '../models';
import { LedgerEntityType, LedgerTransactionType } from '../models/LedgerEntry';
import { logAudit } from '../middleware/auditLog';
import { AuditAction } from '../models/AuditLog';
import { toAttributeRecord } from '../utils/attributes';
import { isDevDiagnosticsEnabled, saleErrorLog, saleLog } from '../utils/saleDiagnostics';
import {
  beginSaleIdempotency,
  completeSaleIdempotency,
  failSaleIdempotency,
  loadIdempotentSale,
} from '../services/saleIdempotencyService';

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
  const startedAt = Date.now();
  const userId = req.user?._id?.toString();
  const idempotencyKey = (req.headers['idempotency-key'] as string | undefined)?.trim()
    || (req.body.idempotencyKey as string | undefined)?.trim();

  const idempotency = await beginSaleIdempotency(userId!, idempotencyKey);
  if (idempotency.resumeSaleId) {
    const existingSale = await loadIdempotentSale(idempotency.resumeSaleId);
    saleLog('SUCCESS', {
      saleId: existingSale._id.toString(),
      invoiceNumber: existingSale.invoiceNumber,
      idempotentReplay: true,
      durationMs: Date.now() - startedAt,
    });
    return ApiResponse.success(res, existingSale, 'Sale completed', 201);
  }

  const debugContext = {
    userId,
    customerId: req.body.customer ?? null,
    itemCount: req.body.items?.length ?? 0,
    items: req.body.items,
    payments: req.body.payments,
    discount: req.body.discount,
    taxRate: req.body.taxRate,
    isPos: req.body.isPos,
  };

  saleLog('START', debugContext);

  const session = await mongoose.startSession();
  let committed = false;
  let phase = 'init';

  try {
    session.startTransaction();
    phase = 'load-products';

    const productIds = req.body.items.map((item: { product: string }) => item.product);
    const products = await Product.find({ _id: { $in: productIds } }).session(session);
    const productMap = new Map(products.map((p) => [p._id.toString(), p]));

    const items = [];
    let subtotal = 0;
    phase = 'build-items';

    for (const item of req.body.items) {
      const product = productMap.get(item.product);
      if (!product) throw new ApiError(404, 'Product not found');
      if (product.currentStock < item.quantity) {
        throw new ApiError(400, `Insufficient stock for ${product.name}`);
      }

      const lineGross = Math.round(item.quantity * item.unitPrice * 100) / 100;
      const itemDiscount = Math.round(Math.max(0, item.discount || 0) * 100) / 100;
      const itemTotal = Math.round((lineGross - itemDiscount) * 100) / 100;
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
        attributes: toAttributeRecord(product.attributes),
      });
    }

    subtotal = Math.round(subtotal * 100) / 100;
    phase = 'calculate-totals';

    const discount = req.body.discount || 0;
    const discountType = req.body.discountType || 'fixed';
    let discountAmount = discountType === 'percentage' ? (subtotal * discount) / 100 : discount;
    discountAmount = Math.round(Math.min(Math.max(0, discountAmount), subtotal) * 100) / 100;

    const taxRate = req.body.taxRate || 0;
    const taxableAmount = Math.round((subtotal - discountAmount) * 100) / 100;
    const tax = Math.round((taxableAmount * taxRate) * 100) / 10000;
    const totalBeforeRound = Math.round((taxableAmount + tax) * 100) / 100;
    const total = Math.round(totalBeforeRound);
    const roundOff = Math.round((total - totalBeforeRound) * 100) / 100;
    phase = 'validate-payment';

    if (!req.body.customer) {
      const paidAmount = req.body.payments.reduce((sum: number, p: { amount: number }) => sum + p.amount, 0);
      if (paidAmount < total) {
        throw new ApiError(400, 'Walk-in customers must pay full amount. Select a customer for credit sales.');
      }
    }

    let customerDoc = null;
    phase = 'load-customer';
    if (req.body.customer) {
      customerDoc = await Customer.findById(req.body.customer).session(session);
      if (!customerDoc) throw new ApiError(404, 'Customer not found');
    }

    const credit = resolveSaleCredit(customerDoc, total, req.body.payments);
    let { paidAmount, balanceDue, payments, dueDate, creditTermType } = credit;
    phase = 'resolve-credit';
    let advanceAppliedOnSale = 0;

    // Auto-apply existing advance to new short-term credit sale
    if (
      customerDoc &&
      balanceDue > 0 &&
      customerDoc.advanceBalance > 0 &&
      customerDoc.creditTermType === CreditTermType.SHORT_TERM
    ) {
      advanceAppliedOnSale = Math.min(customerDoc.advanceBalance, balanceDue);
      if (advanceAppliedOnSale > 0) {
        balanceDue = Math.round((balanceDue - advanceAppliedOnSale) * 100) / 100;
        paidAmount = Math.round((paidAmount + advanceAppliedOnSale) * 100) / 100;
      }
    }

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
        phase = 'credit-check';
        const creditCheck = await checkCreditLimit(req.body.customer, balanceDue);
        if (!creditCheck.allowed) {
          throw new ApiError(400, creditCheck.message || 'Credit limit exceeded');
        }
      }
    }

    phase = 'generate-invoice-number';
    const invoiceNumber = await generateDocumentNumber('INV', Sale, 'invoiceNumber', session);
    const isPos = req.body.isPos ?? true;
    phase = 'create-sale-document';

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
    const saleUserId = req.user!._id.toString();
    const userName = req.user!.name;
    phase = 'deduct-stock';

    await deductStockBatch(
      req.body.items.map((item: { product: string; quantity: number }) => ({
        productId: item.product,
        quantity: item.quantity,
      })),
      {
        userId: saleUserId,
        reference: invoiceNumber,
        referenceId: saleId,
        referenceModel: 'Sale',
        session,
      }
    );

    phase = 'ledger-update';
    if (advanceAppliedOnSale > 0 && req.body.customer) {
      await postLedgerEntry({
        entityType: LedgerEntityType.CUSTOMER,
        entityId: req.body.customer,
        transactionType: LedgerTransactionType.ADVANCE_ADJUSTMENT,
        referenceNumber: `${invoiceNumber}-ADV-USE`,
        credit: advanceAppliedOnSale,
        remarks: `Advance applied to ${invoiceNumber}`,
        referenceId: saleId,
        referenceModel: 'Sale',
        userId: saleUserId,
        userName,
        session,
      });
      await Customer.findByIdAndUpdate(
        req.body.customer,
        { $inc: { advanceBalance: -advanceAppliedOnSale } },
        { session }
      );
    }

    if (req.body.customer && customerDoc?.creditTermType === CreditTermType.LONG_TERM) {
      await postSaleLedger(saleId, saleUserId, userName, session);
    } else if (balanceDue > 0 && req.body.customer) {
      await postSaleLedger(saleId, saleUserId, userName, session);
    } else if (req.body.customer) {
      await Customer.findByIdAndUpdate(
        req.body.customer,
        { $inc: { totalPurchases: total }, lastPurchaseDate: new Date() },
        { session }
      );
    }

    phase = 'commit-transaction';
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

    saleLog('SUCCESS', {
      saleId,
      invoiceNumber,
      total,
      paidAmount,
      balanceDue,
      durationMs: Date.now() - startedAt,
    });

    await completeSaleIdempotency(userId!, idempotencyKey, saleId);

    ApiResponse.success(res, sale[0], 'Sale completed', 201);
  } catch (error) {
    await failSaleIdempotency(userId!, idempotencyKey);
    saleErrorLog(error, { ...debugContext, phase, committed });

    if (!committed) {
      try {
        await session.abortTransaction();
      } catch (abortError) {
        saleErrorLog(abortError, { ...debugContext, phase: 'abort-transaction', committed });
      }
    }

    if (isDevDiagnosticsEnabled() && !(error instanceof ApiError)) {
      const err = error instanceof Error ? error : new Error(String(error));
      throw new ApiError(500, err.message, [{ field: phase, message: err.stack || err.message }]);
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
