import { Response } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import {
  Customer,
  Supplier,
  Purchase,
  PurchaseStatus,
  Sale,
  SaleStatus,
  Payment,
  PaymentType,
  PaymentEntity,
  PaymentMethod,
  BadDebtStatus,
  LedgerEntityType,
  LedgerTransactionType,
  CreditTermType,
} from '../models';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { generateDocumentNumber } from '../utils/tokens';
import { paramId } from '../utils/params';
import { Settings } from '../models/Settings';
import {
  getCustomerSummary,
  getSupplierSummary,
  getLedgerView,
  getAgingReport,
  getOutstandingReport,
  getCreditDashboard,
  checkCreditLimit,
  calculateRiskScore,
  postPaymentLedger,
  postLedgerEntry,
  setOpeningBalance,
  markBadDebt,
  validateCustomerLedgerBalance,
  validateSupplierLedgerBalance,
  computeAmountDue,
  computeNetOutstanding,
} from '../services/ledgerService';
import { generateCustomerStatementPDF } from '../services/pdf/customerStatementPdfService';
import { logAudit } from '../middleware/auditLog';
import { AuditAction } from '../models/AuditLog';

const allocationSchema = z.object({
  sale: z.string().optional(),
  purchase: z.string().optional(),
  invoiceNumber: z.string(),
  amount: z.number().min(0.01),
});

export const receivePaymentSchema = z.object({
  amount: z.number().min(0.01),
  method: z.nativeEnum(PaymentMethod),
  reference: z.string().optional(),
  bankName: z.string().optional(),
  chequeNumber: z.string().optional(),
  upiTransactionId: z.string().optional(),
  notes: z.string().optional(),
  date: z.string().optional(),
  allocations: z.array(allocationSchema).optional(),
  isAdvance: z.boolean().optional(),
});

export const makeSupplierPaymentSchema = receivePaymentSchema;

export const getCustomerPaymentContext = asyncHandler(async (req: AuthRequest, res: Response) => {
  const customerId = paramId(req.params.id);
  const now = new Date();

  const [customer, pendingInvoices] = await Promise.all([
    Customer.findById(customerId)
      .select('name phone outstandingAmount creditTermType creditLimit advanceBalance totalPurchases totalPayments')
      .lean(),
    Sale.find({
      customer: customerId,
      balanceDue: { $gt: 0 },
      status: SaleStatus.COMPLETED,
    })
      .select('invoiceNumber balanceDue dueDate total creditTermType createdAt')
      .sort({ dueDate: 1, createdAt: 1 })
      .limit(15)
      .lean(),
  ]);

  if (!customer) throw new ApiError(404, 'Customer not found');

  const netOutstanding = computeNetOutstanding(customer.outstandingAmount, customer.advanceBalance ?? 0);
  const amountDue = computeAmountDue(customer.outstandingAmount, customer.advanceBalance ?? 0);

  ApiResponse.success(res, {
    customer,
    currentOutstanding: customer.outstandingAmount,
    netOutstanding,
    amountDue,
    creditTermType: customer.creditTermType,
    creditTermLabel:
      customer.creditTermType === CreditTermType.LONG_TERM ? 'Long Term (ACC)' : 'Short Term',
    pendingInvoices: pendingInvoices.length,
    pendingInvoiceList: pendingInvoices.map((s) => ({
      _id: s._id,
      invoiceNumber: s.invoiceNumber,
      total: s.total,
      balanceDue: s.balanceDue,
      dueDate: s.dueDate,
      daysOverdue: s.dueDate
        ? Math.max(0, Math.floor((now.getTime() - new Date(s.dueDate).getTime()) / 86400000))
        : 0,
    })),
  });
});

export const getCustomerAccountSummary = asyncHandler(async (req: AuthRequest, res: Response) => {
  const includeLedgerCheck = req.query.validate === 'true';
  const summary = await getCustomerSummary(paramId(req.params.id), { includeLedgerCheck });
  ApiResponse.success(res, summary);
});

export const getCustomerLedgerView = asyncHandler(async (req: AuthRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 100;
  const sortOrder = (req.query.sort as 'asc' | 'desc') || 'asc';
  const result = await getLedgerView(LedgerEntityType.CUSTOMER, paramId(req.params.id), page, limit, sortOrder);
  ApiResponse.paginated(res, result.entries, { page, limit, total: result.total });
});

export const getSupplierLedgerView = asyncHandler(async (req: AuthRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;
  const result = await getLedgerView(LedgerEntityType.SUPPLIER, paramId(req.params.id), page, limit);
  ApiResponse.paginated(res, result.entries, { page, limit, total: result.total });
});

export const getSupplierAccountSummary = asyncHandler(async (req: AuthRequest, res: Response) => {
  const summary = await getSupplierSummary(paramId(req.params.id));
  ApiResponse.success(res, summary);
});

export const validateCustomerLedger = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await validateCustomerLedgerBalance(paramId(req.params.id));
  ApiResponse.success(res, result, result.inSync ? 'Ledger in sync' : 'Ledger out of sync — review required');
});

export const validateSupplierLedger = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await validateSupplierLedgerBalance(paramId(req.params.id));
  ApiResponse.success(res, result, result.inSync ? 'Ledger in sync' : 'Ledger out of sync — review required');
});

export const checkCustomerCredit = asyncHandler(async (req: AuthRequest, res: Response) => {
  const amount = parseFloat(req.query.amount as string) || 0;
  const result = await checkCreditLimit(paramId(req.params.id), amount);
  ApiResponse.success(res, result);
});

export const receiveCustomerPayment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const session = await mongoose.startSession();
  let committed = false;

  try {
    session.startTransaction();

    const customer = paramId(req.params.id);
    const { amount, method, allocations, isAdvance, date, ...rest } = req.body;
    const explicitAdvance = isAdvance === true;
    const customerDoc = await Customer.findById(customer).session(session);
    if (!customerDoc) throw new ApiError(404, 'Customer not found');

    const paymentNumber = await generateDocumentNumber('RCP', Payment, 'paymentNumber', session);
    let remainingAmount = amount;
    const paymentAllocations: { sale?: string; invoiceNumber: string; amount: number }[] = [];
    let advanceAppliedFromBalance = 0;

    const needsUnpaidSales = !explicitAdvance;

    let unpaidSales = [] as Awaited<ReturnType<typeof Sale.find>>;
    if (needsUnpaidSales) {
      unpaidSales = await Sale.find({
        customer,
        balanceDue: { $gt: 0 },
        status: SaleStatus.COMPLETED,
      })
        .sort(
          customerDoc.creditTermType === CreditTermType.LONG_TERM
            ? { createdAt: 1 }
            : { dueDate: 1, createdAt: 1 }
        )
        .session(session);
    }

    const unpaidById = new Map(unpaidSales.map((s) => [s._id.toString(), s]));
    const dirtySaleIds = new Set<string>();

    const markSaleUpdated = (sale: { _id: mongoose.Types.ObjectId }) => {
      dirtySaleIds.add(sale._id.toString());
    };

    const flushSaleUpdates = async () => {
      if (dirtySaleIds.size === 0) return;
      const ops = unpaidSales
        .filter((s) => dirtySaleIds.has(s._id.toString()))
        .map((s) => ({
          updateOne: {
            filter: { _id: s._id },
            update: { $set: { balanceDue: s.balanceDue, paidAmount: s.paidAmount } },
          },
        }));
      await Sale.bulkWrite(ops, { session });
    };

    if (!explicitAdvance && customerDoc.advanceBalance > 0) {
      let advanceLeft = customerDoc.advanceBalance;
      for (const sale of unpaidSales) {
        if (advanceLeft <= 0) break;
        const applied = Math.min(advanceLeft, sale.balanceDue);
        if (applied <= 0) continue;
        sale.balanceDue -= applied;
        sale.paidAmount += applied;
        markSaleUpdated(sale);
        paymentAllocations.push({
          sale: sale._id.toString(),
          invoiceNumber: sale.invoiceNumber,
          amount: applied,
        });
        advanceLeft -= applied;
        advanceAppliedFromBalance += applied;
        customerDoc.outstandingAmount = Math.max(0, customerDoc.outstandingAmount - applied);
      }

      customerDoc.advanceBalance = advanceLeft;

      if (advanceAppliedFromBalance > 0) {
        await postLedgerEntry({
          entityType: LedgerEntityType.CUSTOMER,
          entityId: customer,
          transactionType: LedgerTransactionType.ADVANCE_ADJUSTMENT,
          referenceNumber: `${paymentNumber}-ADV-USE`,
          credit: advanceAppliedFromBalance,
          remarks: 'Advance balance applied to outstanding invoices',
          userId: req.user!._id.toString(),
          userName: req.user!.name,
          session,
        });
      }
    }

    if (allocations?.length) {
      for (const alloc of allocations) {
        if (remainingAmount <= 0) break;
        const allocAmount = Math.min(alloc.amount, remainingAmount);
        if (alloc.sale) {
          const sale = unpaidById.get(alloc.sale) || (await Sale.findById(alloc.sale).session(session));
          if (sale && sale.balanceDue > 0) {
            const applied = Math.min(allocAmount, sale.balanceDue);
            sale.balanceDue -= applied;
            sale.paidAmount += applied;
            markSaleUpdated(sale);
            paymentAllocations.push({ sale: alloc.sale, invoiceNumber: alloc.invoiceNumber, amount: applied });
            remainingAmount -= applied;
          }
        }
      }
    } else if (!explicitAdvance) {
      for (const sale of unpaidSales) {
        if (remainingAmount <= 0) break;
        const applied = Math.min(remainingAmount, sale.balanceDue);
        if (applied <= 0) continue;
        sale.balanceDue -= applied;
        sale.paidAmount += applied;
        markSaleUpdated(sale);
        paymentAllocations.push({
          sale: sale._id.toString(),
          invoiceNumber: sale.invoiceNumber,
          amount: applied,
        });
        remainingAmount -= applied;
      }

      if (remainingAmount > 0 && customerDoc.outstandingAmount > 0) {
        const cashOnInvoices = amount - remainingAmount;
        const outstandingGap = Math.max(0, customerDoc.outstandingAmount - cashOnInvoices);
        const directApply = Math.min(remainingAmount, outstandingGap);
        if (directApply > 0) {
          paymentAllocations.push({
            invoiceNumber: 'ACCOUNT',
            amount: directApply,
          });
          remainingAmount -= directApply;
        }
      }
    }

    await flushSaleUpdates();

    const advanceAmount = explicitAdvance ? amount : remainingAmount;
    const cashAppliedToOutstanding = amount - advanceAmount;

    const payment = await Payment.create(
      [{
        paymentNumber,
        type: PaymentType.RECEIPT,
        entity: PaymentEntity.CUSTOMER,
        customer,
        amount,
        method,
        ...rest,
        allocations: paymentAllocations,
        isAdvance: explicitAdvance || advanceAmount > 0,
        date: date ? new Date(date) : new Date(),
        createdBy: req.user!._id,
      }],
      { session }
    );

    customerDoc.outstandingAmount = Math.max(0, customerDoc.outstandingAmount - cashAppliedToOutstanding);
    if (advanceAmount > 0) {
      customerDoc.advanceBalance += advanceAmount;
    }
    await customerDoc.save({ session });

    await postPaymentLedger(payment[0]._id.toString(), req.user!._id.toString(), req.user!.name, session);

    await session.commitTransaction();
    committed = true;

    calculateRiskScore(customer).catch((err) => {
      console.warn(`[payment] Risk score update failed for customer ${customer}:`, err);
    });

    validateCustomerLedgerBalance(customer).then((ledgerCheck) => {
      if (!ledgerCheck.inSync) {
        console.warn(
          `[ledger] Customer ${customer} out of sync after payment: ledger=${ledgerCheck.ledgerBalance}, outstanding=${ledgerCheck.outstanding}`
        );
      }
    }).catch(() => {});

    logAudit(req, AuditAction.CREATE, 'Payment', payment[0]._id.toString(), { amount, customer }).catch((err) => {
      console.warn(`[payment] Audit log failed:`, err);
    });

    ApiResponse.success(
      res,
      {
        paymentNumber: payment[0].paymentNumber,
        amount: payment[0].amount,
        outstandingAmount: customerDoc.outstandingAmount,
        advanceBalance: customerDoc.advanceBalance,
        netOutstanding: computeNetOutstanding(customerDoc.outstandingAmount, customerDoc.advanceBalance),
        amountDue: computeAmountDue(customerDoc.outstandingAmount, customerDoc.advanceBalance),
      },
      'Payment received',
      201
    );
  } catch (error) {
    if (!committed) {
      await session.abortTransaction();
    }
    throw error;
  } finally {
    session.endSession();
  }
});

export const makeSupplierPayment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const session = await mongoose.startSession();
  let committed = false;
  session.startTransaction();

  try {
    const supplierId = paramId(req.params.id);
    const { amount, method, allocations, isAdvance, date, ...rest } = req.body;
    const explicitAdvance = isAdvance === true;
    const supplierDoc = await Supplier.findById(supplierId).session(session);
    if (!supplierDoc) throw new ApiError(404, 'Supplier not found');

    const paymentNumber = await generateDocumentNumber('PAY', Payment, 'paymentNumber', session);
    let remainingAmount = amount;
    const paymentAllocations: { purchase?: string; invoiceNumber: string; amount: number }[] = [];

    if (allocations?.length) {
      for (const alloc of allocations) {
        if (remainingAmount <= 0) break;
        if (alloc.purchase) {
          const purchase = await Purchase.findById(alloc.purchase).session(session);
          if (purchase && purchase.status !== PurchaseStatus.CANCELLED) {
            const balanceDue = purchase.total - purchase.paidAmount;
            const applied = Math.min(Math.min(alloc.amount, remainingAmount), balanceDue);
            if (applied > 0) {
              purchase.paidAmount += applied;
              await purchase.save({ session });
              paymentAllocations.push({
                purchase: alloc.purchase,
                invoiceNumber: alloc.invoiceNumber || purchase.poNumber,
                amount: applied,
              });
              remainingAmount -= applied;
            }
          }
        }
      }
    } else if (!explicitAdvance) {
      const unpaidPurchases = await Purchase.find({
        supplier: supplierId,
        status: { $nin: [PurchaseStatus.CANCELLED] },
        $expr: { $gt: [{ $subtract: ['$total', '$paidAmount'] }, 0] },
      })
        .sort({ createdAt: 1 })
        .session(session);

      for (const purchase of unpaidPurchases) {
        if (remainingAmount <= 0) break;
        const balanceDue = purchase.total - purchase.paidAmount;
        const applied = Math.min(remainingAmount, balanceDue);
        purchase.paidAmount += applied;
        await purchase.save({ session });
        paymentAllocations.push({
          purchase: purchase._id.toString(),
          invoiceNumber: purchase.poNumber,
          amount: applied,
        });
        remainingAmount -= applied;
      }

      if (remainingAmount > 0 && supplierDoc.outstandingAmount > 0) {
        const cashOnPOs = amount - remainingAmount;
        const outstandingGap = Math.max(0, supplierDoc.outstandingAmount - cashOnPOs);
        const directApply = Math.min(remainingAmount, outstandingGap);
        if (directApply > 0) {
          paymentAllocations.push({ invoiceNumber: 'ACCOUNT', amount: directApply });
          remainingAmount -= directApply;
        }
      }
    }

    const advanceAmount = explicitAdvance ? amount : remainingAmount;
    const cashAppliedToOutstanding = amount - advanceAmount;

    const payment = await Payment.create(
      [{
        paymentNumber,
        type: PaymentType.PAYMENT,
        entity: PaymentEntity.SUPPLIER,
        supplier: supplierId,
        amount,
        method,
        ...rest,
        allocations: paymentAllocations,
        isAdvance: explicitAdvance || advanceAmount > 0,
        date: date ? new Date(date) : new Date(),
        createdBy: req.user!._id,
      }],
      { session }
    );

    supplierDoc.outstandingAmount = Math.max(0, supplierDoc.outstandingAmount - cashAppliedToOutstanding);
    if (advanceAmount > 0) {
      supplierDoc.advanceBalance += advanceAmount;
    }
    await supplierDoc.save({ session });

    await postPaymentLedger(payment[0]._id.toString(), req.user!._id.toString(), req.user!.name, session);

    const ledgerCheck = await validateSupplierLedgerBalance(supplierId, session);
    if (!ledgerCheck.inSync) {
      console.warn(
        `[ledger] Supplier ${supplierId} out of sync after payment: ledger=${ledgerCheck.ledgerBalance}, expected=${ledgerCheck.expectedLedgerBalance}`
      );
    }

    await session.commitTransaction();
    committed = true;
    logAudit(req, AuditAction.CREATE, 'Payment', payment[0]._id.toString(), { amount, supplier: supplierId }).catch((err) => {
      console.warn('[payment] Audit log failed:', err);
    });

    ApiResponse.success(res, payment[0], 'Supplier payment recorded', 201);
  } catch (error) {
    if (!committed) await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

export const getAgingReportHandler = asyncHandler(async (req: AuthRequest, res: Response) => {
  const entityType = (req.query.entity as LedgerEntityType) || LedgerEntityType.CUSTOMER;
  const report = await getAgingReport(entityType);
  ApiResponse.success(res, report);
});

export const getOutstandingReportHandler = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const report = await getOutstandingReport();
  ApiResponse.success(res, report);
});

export const getCreditDashboardHandler = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const data = await getCreditDashboard();
  ApiResponse.success(res, data);
});

export const downloadCustomerStatement = asyncHandler(async (req: AuthRequest, res: Response) => {
  const settings = await Settings.find({ group: 'company' });
  const companyInfo: Record<string, string> = {};
  settings.forEach((s) => { companyInfo[s.key] = String(s.value); });

  const pdf = await generateCustomerStatementPDF(paramId(req.params.id), companyInfo);
  const customer = await Customer.findById(paramId(req.params.id)).select('name');
  const safeName = (customer?.name || 'customer').replace(/[^\w\-]+/g, '-').slice(0, 40);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=statement-${safeName}.pdf`);
  res.send(pdf);
});

export const setCustomerOpeningBalance = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { amount, remarks } = req.body;
  await setOpeningBalance(
    LedgerEntityType.CUSTOMER,
    paramId(req.params.id),
    amount,
    req.user!._id.toString(),
    req.user!.name,
    remarks
  );
  ApiResponse.success(res, null, 'Opening balance set');
});

export const setSupplierOpeningBalance = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { amount, remarks } = req.body;
  await setOpeningBalance(
    LedgerEntityType.SUPPLIER,
    paramId(req.params.id),
    amount,
    req.user!._id.toString(),
    req.user!.name,
    remarks
  );
  ApiResponse.success(res, null, 'Opening balance set');
});

export const manualLedgerAdjustment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const session = await mongoose.startSession();
  let committed = false;
  session.startTransaction();

  try {
    const { debit, credit, remarks, transactionType } = req.body;
    const entityId = paramId(req.params.id);

    await postLedgerEntry({
      entityType: LedgerEntityType.CUSTOMER,
      entityId,
      transactionType: transactionType || LedgerTransactionType.MANUAL_ADJUSTMENT,
      referenceNumber: `ADJ-${Date.now()}`,
      debit: debit || 0,
      credit: credit || 0,
      remarks,
      userId: req.user!._id.toString(),
      userName: req.user!.name,
      session,
    });

    const netChange = (debit || 0) - (credit || 0);
    await Customer.findByIdAndUpdate(entityId, { $inc: { outstandingAmount: netChange } }, { session });

    const ledgerCheck = await validateCustomerLedgerBalance(entityId, session);

    await session.commitTransaction();
    committed = true;
    ApiResponse.success(res, ledgerCheck, 'Adjustment recorded');
  } catch (error) {
    if (!committed) await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

export const markCustomerBadDebt = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { amount, status, reason } = req.body;
  await markBadDebt(
    paramId(req.params.id),
    amount,
    status || BadDebtStatus.BAD_DEBT,
    req.user!._id.toString(),
    req.user!.name,
    reason
  );
  ApiResponse.success(res, null, 'Bad debt recorded');
});

export const getCustomerRiskAnalysis = asyncHandler(async (req: AuthRequest, res: Response) => {
  const risk = await calculateRiskScore(paramId(req.params.id));
  const summary = await getCustomerSummary(paramId(req.params.id));
  ApiResponse.success(res, { ...risk, summary });
});

export const getWhatsAppStatementLink = asyncHandler(async (req: AuthRequest, res: Response) => {
  const customer = await Customer.findById(paramId(req.params.id));
  if (!customer) throw new ApiError(404, 'Customer not found');

  const summary = await getCustomerSummary(paramId(req.params.id));
  const phone = (customer.whatsapp || customer.phone).replace(/\D/g, '');
  const message = encodeURIComponent(
    `Dear ${customer.name},\n\nYour account summary:\nNet Outstanding: ₹${summary.netOutstanding.toFixed(2)}\nOverdue: ₹${summary.overdueAmount.toFixed(2)}\nPending Invoices: ${summary.pendingInvoices}\n\nPlease contact us for payment.\n\nThank you.`
  );

  ApiResponse.success(res, {
    whatsappUrl: `https://wa.me/91${phone}?text=${message}`,
    phone,
    summary: {
      outstanding: summary.netOutstanding,
      overdue: summary.overdueAmount,
      pendingInvoices: summary.pendingInvoices,
    },
  });
});
