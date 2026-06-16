import mongoose from 'mongoose';
import {
  LedgerEntry,
  LedgerEntityType,
  LedgerTransactionType,
  Customer,
  Supplier,
  Sale,
  SaleStatus,
  Purchase,
  PurchaseStatus,
  RiskCategory,
  BadDebtStatus,
  Payment,
  PaymentType,
  PaymentMethod,
  CreditTermType,
} from '../models';
import { ApiError } from '../utils/ApiError';

interface PostLedgerParams {
  entityType: LedgerEntityType;
  entityId: string;
  transactionType: LedgerTransactionType;
  referenceNumber: string;
  debit?: number;
  credit?: number;
  remarks?: string;
  referenceId?: string;
  referenceModel?: string;
  date?: Date;
  userId: string;
  userName: string;
  session?: mongoose.ClientSession;
}

function roundLedgerAmount(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/** Amount customer actually owes after advance credit: gross outstanding − advance. */
export const computeNetOutstanding = (outstandingAmount: number, advanceBalance = 0): number =>
  roundLedgerAmount(outstandingAmount - advanceBalance);

/** Net amount due for UI/collections — never negative. */
export const computeAmountDue = (outstandingAmount: number, advanceBalance = 0): number =>
  Math.max(0, computeNetOutstanding(outstandingAmount, advanceBalance));

/** Latest passbook balance — must follow insert order, not back-dated `date`. */
export const getLastBalance = async (
  entityType: LedgerEntityType,
  entityId: string,
  session?: mongoose.ClientSession
): Promise<number> => {
  const last = await LedgerEntry.findOne({ entityType, entityId, isVoided: false })
    .sort({ createdAt: -1 })
    .session(session || null);
  return last?.runningBalance ?? 0;
};

/** Rebuild running balances in true chronological (createdAt) order. */
export const syncLedgerRunningBalances = async (
  entityType: LedgerEntityType,
  entityId: string,
  session?: mongoose.ClientSession
): Promise<number> => {
  const entries = await LedgerEntry.find({ entityType, entityId, isVoided: false })
    .sort({ createdAt: 1 })
    .session(session || null);

  let balance = 0;
  for (const entry of entries) {
    balance = roundLedgerAmount(balance + (entry.debit || 0) - (entry.credit || 0));
    if (entry.runningBalance !== balance) {
      await LedgerEntry.updateOne(
        { _id: entry._id },
        { $set: { runningBalance: balance } },
        { session }
      );
    }
  }
  return balance;
};

export const postLedgerEntry = async (params: PostLedgerParams) => {
  const debit = params.debit || 0;
  const credit = params.credit || 0;
  const previousBalance = await getLastBalance(params.entityType, params.entityId, params.session);
  const runningBalance = roundLedgerAmount(previousBalance + debit - credit);

  const entry = await LedgerEntry.create(
    [{
      entityType: params.entityType,
      entityId: params.entityId,
      date: params.date || new Date(),
      referenceNumber: params.referenceNumber,
      transactionType: params.transactionType,
      debit,
      credit,
      runningBalance,
      remarks: params.remarks,
      referenceId: params.referenceId,
      referenceModel: params.referenceModel,
      createdBy: params.userId,
      createdByName: params.userName,
    }],
    { session: params.session }
  );

  return entry[0];
};

export const checkCreditLimit = async (
  customerId: string,
  additionalAmount: number
): Promise<{ allowed: boolean; warning: boolean; message?: string; availableCredit: number }> => {
  const customer = await Customer.findById(customerId);
  if (!customer) throw new ApiError(404, 'Customer not found');

  const netOutstanding = computeNetOutstanding(customer.outstandingAmount, customer.advanceBalance);
  const amountDue = computeAmountDue(customer.outstandingAmount, customer.advanceBalance);
  const newNetOutstanding = netOutstanding + additionalAmount;
  const availableCredit = Math.max(0, customer.creditLimit - amountDue);

  if (customer.creditLimit > 0 && newNetOutstanding > customer.creditLimit) {
    if (customer.blockOnCreditLimit) {
      return {
        allowed: false,
        warning: true,
        message: `Credit limit exceeded. Limit: ₹${customer.creditLimit}, Net outstanding would be: ₹${newNetOutstanding}`,
        availableCredit,
      };
    }
    return {
      allowed: true,
      warning: true,
      message: `Warning: Credit limit will be exceeded (${((newNetOutstanding / customer.creditLimit) * 100).toFixed(0)}% used)`,
      availableCredit,
    };
  }

  const usagePercent = customer.creditLimit > 0 ? (amountDue / customer.creditLimit) * 100 : 0;
  return {
    allowed: true,
    warning: usagePercent >= 80,
    message: usagePercent >= 80 ? `Credit usage at ${usagePercent.toFixed(0)}%` : undefined,
    availableCredit,
  };
};

export const calculateRiskScore = async (customerId: string): Promise<{ score: number; category: RiskCategory }> => {
  const customer = await Customer.findById(customerId);
  if (!customer) return { score: 0, category: RiskCategory.LOW };

  let score = 0;

  // Outstanding vs credit limit
  if (customer.creditLimit > 0) {
    const amountDue = computeAmountDue(customer.outstandingAmount, customer.advanceBalance);
    const usage = (amountDue / customer.creditLimit) * 100;
    if (usage > 100) score += 40;
    else if (usage > 80) score += 25;
    else if (usage > 50) score += 10;
  }

  // Overdue invoices
  const overdueSales = await Sale.find({
    customer: customerId,
    balanceDue: { $gt: 0 },
    dueDate: { $lt: new Date() },
    status: SaleStatus.COMPLETED,
  });
  const overdueAmount = overdueSales.reduce((s, sale) => s + sale.balanceDue, 0);
  if (overdueAmount > 0) {
    score += Math.min(30, (overdueAmount / Math.max(customer.outstandingAmount, 1)) * 30);
  }

  // Payment consistency - ratio of payments to purchases
  if (customer.totalPurchases > 0) {
    const paymentRatio = customer.totalPayments / customer.totalPurchases;
    if (paymentRatio < 0.5) score += 20;
    else if (paymentRatio < 0.8) score += 10;
  }

  // Bad debt status
  if (customer.badDebtStatus === BadDebtStatus.BAD_DEBT) score += 30;
  if (customer.badDebtStatus === BadDebtStatus.WRITTEN_OFF) score += 50;

  score = Math.min(100, Math.round(score));

  let category = RiskCategory.LOW;
  if (score >= 75) category = RiskCategory.VERY_HIGH;
  else if (score >= 50) category = RiskCategory.HIGH;
  else if (score >= 25) category = RiskCategory.MEDIUM;

  await Customer.findByIdAndUpdate(customerId, { riskScore: score, riskCategory: category });
  return { score, category };
};

export const getCustomerSummary = async (
  customerId: string,
  options?: { includeLedgerCheck?: boolean }
) => {
  const [customer, pendingInvoices, lastEntry] = await Promise.all([
    Customer.findById(customerId),
    Sale.find({
      customer: customerId,
      balanceDue: { $gt: 0 },
      status: SaleStatus.COMPLETED,
    })
      .sort({ dueDate: 1, createdAt: 1 })
      .limit(50)
      .select('invoiceNumber total balanceDue dueDate creditTermType createdAt'),
    LedgerEntry.findOne({
      entityType: LedgerEntityType.CUSTOMER,
      entityId: customerId,
      isVoided: false,
    })
      .sort({ createdAt: -1 })
      .select('date'),
  ]);

  if (!customer) throw new ApiError(404, 'Customer not found');

  const now = new Date();
  const overdueInvoices = pendingInvoices.filter((s) => s.dueDate && s.dueDate < now);
  const overdueAmount = overdueInvoices.reduce((sum, s) => sum + s.balanceDue, 0);

  const amountDue = computeAmountDue(customer.outstandingAmount, customer.advanceBalance);
  const availableCredit = Math.max(0, customer.creditLimit - amountDue);
  const creditUsagePercent = customer.creditLimit > 0
    ? (amountDue / customer.creditLimit) * 100
    : 0;

  let ledgerInSync: boolean | undefined;
  if (options?.includeLedgerCheck) {
    ledgerInSync = (await validateCustomerLedgerBalance(customerId)).inSync;
  }

  return {
    customer,
    currentOutstanding: customer.outstandingAmount,
    netOutstanding: computeNetOutstanding(customer.outstandingAmount, customer.advanceBalance),
    amountDue,
    totalPurchases: customer.totalPurchases,
    totalPayments: customer.totalPayments,
    pendingInvoices: pendingInvoices.length,
    pendingInvoiceAmount: pendingInvoices.reduce((s, i) => s + i.balanceDue, 0),
    overdueAmount,
    overdueInvoices: overdueInvoices.length,
    availableCredit,
    creditLimit: customer.creditLimit,
    creditUsagePercent,
    advanceBalance: customer.advanceBalance,
    lastTransactionDate: lastEntry?.date,
    lastPurchaseDate: customer.lastPurchaseDate,
    lastPaymentDate: customer.lastPaymentDate,
    riskCategory: customer.riskCategory,
    riskScore: customer.riskScore,
    pendingInvoiceList: pendingInvoices.map((s) => ({
      _id: s._id,
      invoiceNumber: s.invoiceNumber,
      total: s.total,
      balanceDue: s.balanceDue,
      dueDate: s.dueDate,
      creditTermType: s.creditTermType,
      daysOverdue: s.dueDate ? Math.max(0, Math.floor((now.getTime() - s.dueDate.getTime()) / 86400000)) : 0,
      createdAt: (s as unknown as { createdAt: Date }).createdAt,
    })),
    creditTermType: customer.creditTermType,
    creditTermLabel: customer.creditTermType === CreditTermType.LONG_TERM ? 'Long Term (ACC)' : 'Short Term',
    ...(ledgerInSync !== undefined ? { ledgerInSync } : {}),
  };
};

export const getLedgerView = async (
  entityType: LedgerEntityType,
  entityId: string,
  page = 1,
  limit = 50,
  sortOrder: 'asc' | 'desc' = 'asc'
) => {
  // Fix stored balances when back-dated payments broke the chain
  await syncLedgerRunningBalances(entityType, entityId);

  const filter = { entityType, entityId, isVoided: false };
  const sort = sortOrder === 'desc'
    ? { createdAt: -1 as const }
    : { createdAt: 1 as const };
  const skip = (page - 1) * limit;

  const [entries, total] = await Promise.all([
    LedgerEntry.find(filter).sort(sort).skip(skip).limit(limit),
    LedgerEntry.countDocuments(filter),
  ]);

  return { entries, total, page, limit, sortOrder };
};

export const postSaleLedger = async (
  saleId: string,
  userId: string,
  userName: string,
  session?: mongoose.ClientSession
) => {
  const sale = await Sale.findById(saleId).session(session || null);
  if (!sale || !sale.customer) return;

  const isLongTerm = sale.creditTermType === CreditTermType.LONG_TERM;

  if (isLongTerm) {
    // ACC running account — full bank-statement ledger:
    // every sale stays as debit; payments (at sale or later) stay as credit.
    // Old paid entries remain when new sales happen.
    await postLedgerEntry({
      entityType: LedgerEntityType.CUSTOMER,
      entityId: sale.customer.toString(),
      transactionType: LedgerTransactionType.LONG_TERM_INVOICE,
      referenceNumber: sale.invoiceNumber,
      debit: sale.total,
      remarks: `ACC Sale — Bill ${sale.invoiceNumber} (Total ₹${sale.total.toLocaleString('en-IN')})`,
      referenceId: saleId,
      referenceModel: 'Sale',
      date: new Date(),
      userId,
      userName,
      session,
    });

    if (sale.paidAmount > 0) {
      const payMethods = sale.payments
        .filter((p) => p.amount > 0 && p.method !== PaymentMethod.CREDIT)
        .map((p) => p.method)
        .join(', ');

      await postLedgerEntry({
        entityType: LedgerEntityType.CUSTOMER,
        entityId: sale.customer.toString(),
        transactionType: LedgerTransactionType.PAYMENT_RECEIVED,
        referenceNumber: `${sale.invoiceNumber}-PAY`,
        credit: sale.paidAmount,
        remarks: payMethods
          ? `Payment at sale — ${payMethods}`
          : `Payment at sale — ₹${sale.paidAmount.toLocaleString('en-IN')}`,
        referenceId: saleId,
        referenceModel: 'Sale',
        date: new Date(),
        userId,
        userName,
        session,
      });

      await Customer.findByIdAndUpdate(
        sale.customer,
        {
          $inc: { totalPayments: sale.paidAmount },
          lastPaymentDate: new Date(),
        },
        { session }
      );
    }

    await Customer.findByIdAndUpdate(
      sale.customer,
      {
        $inc: { totalPurchases: sale.total, outstandingAmount: sale.balanceDue },
        lastPurchaseDate: new Date(),
      },
      { session }
    );
    return;
  }

  // Short term: debit only unpaid invoice portion
  const creditAmount = sale.balanceDue;
  if (creditAmount <= 0) return;

  await postLedgerEntry({
    entityType: LedgerEntityType.CUSTOMER,
    entityId: sale.customer.toString(),
    transactionType: LedgerTransactionType.SALES_INVOICE,
    referenceNumber: sale.invoiceNumber,
    debit: creditAmount,
    remarks: `Sales invoice - ${sale.customerName || 'Customer'}`,
    referenceId: saleId,
    referenceModel: 'Sale',
    date: new Date(),
    userId,
    userName,
    session,
  });

  await Customer.findByIdAndUpdate(
    sale.customer,
    {
      $inc: { totalPurchases: sale.total, outstandingAmount: creditAmount },
      lastPurchaseDate: new Date(),
    },
    { session }
  );
};

export const postPaymentLedger = async (
  paymentId: string,
  userId: string,
  userName: string,
  session?: mongoose.ClientSession
) => {
  const payment = await Payment.findById(paymentId).session(session || null);
  if (!payment || payment.isVoided) return;

  if (payment.customer && payment.type === PaymentType.RECEIPT) {
    const allocatedToInvoices = (payment.allocations || []).reduce((sum, a) => sum + (a.amount || 0), 0);
    const invoiceCredit = roundLedgerAmount(Math.min(payment.amount, allocatedToInvoices));
    const advanceCredit = roundLedgerAmount(payment.amount - invoiceCredit);

    if (invoiceCredit > 0) {
      await postLedgerEntry({
        entityType: LedgerEntityType.CUSTOMER,
        entityId: payment.customer.toString(),
        transactionType: LedgerTransactionType.PAYMENT_RECEIVED,
        referenceNumber: payment.paymentNumber,
        credit: invoiceCredit,
        remarks: payment.notes || `Payment via ${payment.method}`,
        referenceId: paymentId,
        referenceModel: 'Payment',
        date: payment.date,
        userId,
        userName,
        session,
      });
    }

    if (advanceCredit > 0) {
      await postLedgerEntry({
        entityType: LedgerEntityType.CUSTOMER,
        entityId: payment.customer.toString(),
        transactionType: LedgerTransactionType.ADVANCE_PAYMENT,
        referenceNumber: `${payment.paymentNumber}-ADV`,
        credit: advanceCredit,
        remarks: payment.notes || `Advance via ${payment.method}`,
        referenceId: paymentId,
        referenceModel: 'Payment',
        date: payment.date,
        userId,
        userName,
        session,
      });
    }

    await Customer.findByIdAndUpdate(
      payment.customer,
      {
        $inc: { totalPayments: payment.amount },
        lastPaymentDate: payment.date,
      },
      { session }
    );
  }

  if (payment.supplier && payment.type === PaymentType.PAYMENT) {
    await postLedgerEntry({
      entityType: LedgerEntityType.SUPPLIER,
      entityId: payment.supplier.toString(),
      transactionType: payment.isAdvance
        ? LedgerTransactionType.ADVANCE_PAYMENT
        : LedgerTransactionType.PAYMENT_MADE,
      referenceNumber: payment.paymentNumber,
      credit: payment.amount,
      remarks: payment.notes || `Payment via ${payment.method}`,
      referenceId: paymentId,
      referenceModel: 'Payment',
      date: payment.date,
      userId,
      userName,
      session,
    });

    await Supplier.findByIdAndUpdate(
      payment.supplier,
      { $inc: { totalPayments: payment.amount }, lastPaymentDate: payment.date },
      { session }
    );
  }
};

/** Full ledger + customer reversal for cancelled sales. Call before zeroing balanceDue. */
export const reverseSaleLedger = async (
  saleId: string,
  userId: string,
  userName: string,
  session?: mongoose.ClientSession
) => {
  const sale = await Sale.findById(saleId).session(session || null);
  if (!sale || !sale.customer) return;

  const customerId = sale.customer.toString();
  const balanceDueAtCancel = sale.balanceDue;
  const isLongTerm = sale.creditTermType === CreditTermType.LONG_TERM;

  if (isLongTerm) {
    await postLedgerEntry({
      entityType: LedgerEntityType.CUSTOMER,
      entityId: customerId,
      transactionType: LedgerTransactionType.SALES_RETURN,
      referenceNumber: `${sale.invoiceNumber}-REV`,
      credit: sale.total,
      remarks: `Sale cancelled — reverse ACC bill ${sale.invoiceNumber}`,
      referenceId: saleId,
      referenceModel: 'Sale',
      userId,
      userName,
      session,
    });

    if (sale.paidAmount > 0) {
      await postLedgerEntry({
        entityType: LedgerEntityType.CUSTOMER,
        entityId: customerId,
        transactionType: LedgerTransactionType.MANUAL_ADJUSTMENT,
        referenceNumber: `${sale.invoiceNumber}-PAY-REV`,
        debit: sale.paidAmount,
        remarks: `Sale cancelled — reverse payment at sale for ${sale.invoiceNumber}`,
        referenceId: saleId,
        referenceModel: 'Sale',
        userId,
        userName,
        session,
      });
    }

    await Customer.findByIdAndUpdate(
      customerId,
      {
        $inc: {
          outstandingAmount: -balanceDueAtCancel,
          totalPurchases: -sale.total,
          totalPayments: -sale.paidAmount,
        },
      },
      { session }
    );
    return;
  }

  if (balanceDueAtCancel > 0) {
    await postLedgerEntry({
      entityType: LedgerEntityType.CUSTOMER,
      entityId: customerId,
      transactionType: LedgerTransactionType.SALES_RETURN,
      referenceNumber: `${sale.invoiceNumber}-REV`,
      credit: balanceDueAtCancel,
      remarks: `Sale cancelled — ${sale.invoiceNumber}`,
      referenceId: saleId,
      referenceModel: 'Sale',
      userId,
      userName,
      session,
    });

    await Customer.findByIdAndUpdate(
      customerId,
      {
        $inc: {
          outstandingAmount: -balanceDueAtCancel,
          totalPurchases: -sale.total,
        },
      },
      { session }
    );
    return;
  }

  await Customer.findByIdAndUpdate(
    customerId,
    { $inc: { totalPurchases: -sale.total } },
    { session }
  );
};

/** @deprecated Use reverseSaleLedger — kept for reference only */
export const postSaleReturnLedger = reverseSaleLedger;

export const validateCustomerLedgerBalance = async (
  customerId: string,
  session?: mongoose.ClientSession
): Promise<{
  ledgerBalance: number;
  outstanding: number;
  advanceBalance: number;
  expectedLedgerBalance: number;
  inSync: boolean;
}> => {
  const customer = await Customer.findById(customerId).session(session || null);
  if (!customer) throw new ApiError(404, 'Customer not found');

  const ledgerBalance = await getLastBalance(LedgerEntityType.CUSTOMER, customerId, session);
  const outstanding = customer.outstandingAmount;
  const advanceBalance = customer.advanceBalance;
  // Prepaid advance shows as credit on passbook — adjust expected running balance
  const expectedLedgerBalance = outstanding - advanceBalance;
  const inSync = Math.abs(ledgerBalance - expectedLedgerBalance) < 0.01;

  return { ledgerBalance, outstanding, advanceBalance, expectedLedgerBalance, inSync };
};

export const validateSupplierLedgerBalance = async (
  supplierId: string,
  session?: mongoose.ClientSession
): Promise<{
  ledgerBalance: number;
  outstanding: number;
  advanceBalance: number;
  expectedLedgerBalance: number;
  inSync: boolean;
}> => {
  const supplier = await Supplier.findById(supplierId).session(session || null);
  if (!supplier) throw new ApiError(404, 'Supplier not found');

  const ledgerBalance = await getLastBalance(LedgerEntityType.SUPPLIER, supplierId, session);
  const outstanding = supplier.outstandingAmount;
  const advanceBalance = supplier.advanceBalance;
  const expectedLedgerBalance = outstanding - advanceBalance;
  const inSync = Math.abs(ledgerBalance - expectedLedgerBalance) < 0.01;

  return { ledgerBalance, outstanding, advanceBalance, expectedLedgerBalance, inSync };
};

export const getSupplierSummary = async (supplierId: string) => {
  const supplier = await Supplier.findById(supplierId);
  if (!supplier) throw new ApiError(404, 'Supplier not found');

  const pendingPurchases = await Purchase.find({
    supplier: supplierId,
    status: { $nin: [PurchaseStatus.CANCELLED] },
    $expr: { $gt: [{ $subtract: ['$total', '$paidAmount'] }, 0] },
  }).sort({ createdAt: 1 });

  const lastEntry = await LedgerEntry.findOne({
    entityType: LedgerEntityType.SUPPLIER,
    entityId: supplierId,
    isVoided: false,
  }).sort({ date: -1, createdAt: -1 });

  const ledgerCheck = await validateSupplierLedgerBalance(supplierId);

  return {
    supplier,
    currentOutstanding: supplier.outstandingAmount,
    totalPurchases: supplier.totalPurchases,
    totalPayments: supplier.totalPayments,
    advanceBalance: supplier.advanceBalance,
    pendingPurchases: pendingPurchases.length,
    pendingPurchaseAmount: pendingPurchases.reduce((s, p) => s + (p.total - p.paidAmount), 0),
    lastTransactionDate: lastEntry?.date,
    lastPurchaseDate: supplier.lastPurchaseDate,
    lastPaymentDate: supplier.lastPaymentDate,
    ledgerInSync: ledgerCheck.inSync,
    pendingPurchaseList: pendingPurchases.map((p) => ({
      _id: p._id,
      poNumber: p.poNumber,
      total: p.total,
      paidAmount: p.paidAmount,
      balanceDue: p.total - p.paidAmount,
      status: p.status,
      createdAt: (p as unknown as { createdAt: Date }).createdAt,
    })),
  };
};

export const postPurchaseLedger = async (
  purchaseId: string,
  userId: string,
  userName: string,
  session?: mongoose.ClientSession
) => {
  const purchase = await Purchase.findById(purchaseId).session(session || null);
  if (!purchase) return;

  const supplierId = purchase.supplier.toString();
  const balanceDue = purchase.total - purchase.paidAmount;

  await postLedgerEntry({
    entityType: LedgerEntityType.SUPPLIER,
    entityId: supplierId,
    transactionType: LedgerTransactionType.PURCHASE_INVOICE,
    referenceNumber: purchase.poNumber,
    debit: purchase.total,
    remarks: `Purchase bill — ${purchase.poNumber} (Total ₹${purchase.total.toLocaleString('en-IN')})`,
    referenceId: purchaseId,
    referenceModel: 'Purchase',
    userId,
    userName,
    session,
  });

  await Supplier.findByIdAndUpdate(
    supplierId,
    {
      $inc: { totalPurchases: purchase.total, outstandingAmount: balanceDue },
      lastPurchaseDate: new Date(),
    },
    { session }
  );
};

export const reversePurchaseLedger = async (
  purchaseId: string,
  userId: string,
  userName: string,
  session?: mongoose.ClientSession
) => {
  const purchase = await Purchase.findById(purchaseId).session(session || null);
  if (!purchase) return;

  const supplierId = purchase.supplier.toString();
  const balanceDue = purchase.total - purchase.paidAmount;

  await postLedgerEntry({
    entityType: LedgerEntityType.SUPPLIER,
    entityId: supplierId,
    transactionType: LedgerTransactionType.PURCHASE_RETURN,
    referenceNumber: `${purchase.poNumber}-REV`,
    credit: purchase.total,
    remarks: `Purchase cancelled — ${purchase.poNumber}`,
    referenceId: purchaseId,
    referenceModel: 'Purchase',
    userId,
    userName,
    session,
  });

  await Supplier.findByIdAndUpdate(
    supplierId,
    {
      $inc: {
        outstandingAmount: -balanceDue,
        totalPurchases: -purchase.total,
        totalPayments: -purchase.paidAmount,
      },
    },
    { session }
  );
};

export const getAgingReport = async (entityType: LedgerEntityType = LedgerEntityType.CUSTOMER) => {
  const now = new Date();

  const customers = entityType === LedgerEntityType.CUSTOMER
    ? await Customer.find({ outstandingAmount: { $gt: 0 }, isActive: true })
    : await Supplier.find({ outstandingAmount: { $gt: 0 }, isActive: true });

  const buckets = {
    current: { label: '0-30 Days', amount: 0, count: 0 },
    days31_60: { label: '31-60 Days', amount: 0, count: 0 },
    days61_90: { label: '61-90 Days', amount: 0, count: 0 },
    days91_180: { label: '91-180 Days', amount: 0, count: 0 },
    days180plus: { label: '180+ Days', amount: 0, count: 0 },
  };

  const customerDetails: unknown[] = [];

  for (const entity of customers) {
    if (entityType !== LedgerEntityType.CUSTOMER) continue;

    const sales = await Sale.find({
      customer: entity._id,
      balanceDue: { $gt: 0 },
      status: SaleStatus.COMPLETED,
    });

    let entityAging = { current: 0, days31_60: 0, days61_90: 0, days91_180: 0, days180plus: 0 };

    for (const sale of sales) {
      const isLongTerm = sale.creditTermType === CreditTermType.LONG_TERM;
      const dueDate = sale.dueDate || (sale as unknown as { createdAt: Date }).createdAt;
      const daysOverdue = isLongTerm ? 0 : Math.floor((now.getTime() - dueDate.getTime()) / 86400000);
      const amount = sale.balanceDue;

      if (isLongTerm || daysOverdue <= 30) { entityAging.current += amount; buckets.current.amount += amount; }
      else if (daysOverdue <= 60) { entityAging.days31_60 += amount; buckets.days31_60.amount += amount; }
      else if (daysOverdue <= 90) { entityAging.days61_90 += amount; buckets.days61_90.amount += amount; }
      else if (daysOverdue <= 180) { entityAging.days91_180 += amount; buckets.days91_180.amount += amount; }
      else { entityAging.days180plus += amount; buckets.days180plus.amount += amount; }
    }

    if (entity.outstandingAmount > 0) {
      buckets.current.count += entityAging.current > 0 ? 1 : 0;
      customerDetails.push({
        _id: entity._id,
        name: entity.name,
        phone: entity.phone,
        outstandingAmount: entity.outstandingAmount,
        aging: entityAging,
        riskCategory: (entity as { riskCategory?: string }).riskCategory,
      });
    }
  }

  return { buckets: Object.values(buckets), customers: customerDetails };
};

export const getOutstandingReport = async () => {
  const [customers, totalOverdue, invoiceWise] = await Promise.all([
    Customer.find({
      isActive: true,
      $expr: { $gt: [{ $subtract: ['$outstandingAmount', '$advanceBalance'] }, 0] },
    })
      .select('name phone outstandingAmount advanceBalance creditLimit riskCategory lastPaymentDate')
      .lean(),
    Sale.aggregate([
      { $match: { balanceDue: { $gt: 0 }, status: SaleStatus.COMPLETED, dueDate: { $lt: new Date() } } },
      { $group: { _id: null, total: { $sum: '$balanceDue' } } },
    ]),
    Sale.find({ balanceDue: { $gt: 0 }, status: SaleStatus.COMPLETED })
      .populate('customer', 'name phone')
      .sort({ dueDate: 1 })
      .limit(100),
  ]);

  const customerWise = customers
    .map((c) => ({
      ...c,
      netOutstanding: computeAmountDue(c.outstandingAmount, c.advanceBalance ?? 0),
    }))
    .sort((a, b) => b.netOutstanding - a.netOutstanding);

  const totalReceivables = customerWise.reduce((sum, c) => sum + c.netOutstanding, 0);

  return {
    totalReceivables,
    totalOverdue: totalOverdue[0]?.total || 0,
    customerWise,
    invoiceWise: invoiceWise.map((s) => ({
      invoiceNumber: s.invoiceNumber,
      customer: s.customer,
      balanceDue: s.balanceDue,
      dueDate: s.dueDate,
      daysOverdue: s.dueDate ? Math.max(0, Math.floor((Date.now() - s.dueDate.getTime()) / 86400000)) : 0,
    })),
  };
};

export const getCreditDashboard = async () => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);

  const [
    receivables,
    payables,
    overdueCustomers,
    nearLimitCustomers,
    todayCollections,
    monthCollections,
    topOutstanding,
  ] = await Promise.all([
    Customer.aggregate([
      {
        $project: {
          netDue: {
            $max: [0, { $subtract: ['$outstandingAmount', '$advanceBalance'] }],
          },
        },
      },
      { $group: { _id: null, total: { $sum: '$netDue' } } },
    ]),
    Supplier.aggregate([{ $group: { _id: null, total: { $sum: '$outstandingAmount' } } }]),
    Customer.countDocuments({
      isActive: true,
      $expr: { $gt: [{ $subtract: ['$outstandingAmount', '$advanceBalance'] }, 0] },
    }),
    Customer.find({
      isActive: true,
      creditLimit: { $gt: 0 },
      $expr: {
        $gte: [
          { $max: [0, { $subtract: ['$outstandingAmount', '$advanceBalance'] }] },
          { $multiply: ['$creditLimit', 0.8] },
        ],
      },
    }).limit(10).select('name outstandingAmount advanceBalance creditLimit'),
    Payment.aggregate([
      { $match: { type: PaymentType.RECEIPT, date: { $gte: todayStart }, isVoided: false } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Payment.aggregate([
      { $match: { type: PaymentType.RECEIPT, date: { $gte: monthStart }, isVoided: false } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Customer.find({
      isActive: true,
      $expr: { $gt: [{ $subtract: ['$outstandingAmount', '$advanceBalance'] }, 0] },
    })
      .select('name phone outstandingAmount advanceBalance riskCategory')
      .lean(),
  ]);

  const largestOutstanding = topOutstanding
    .map((c) => ({
      ...c,
      netOutstanding: computeAmountDue(c.outstandingAmount, c.advanceBalance ?? 0),
    }))
    .sort((a, b) => b.netOutstanding - a.netOutstanding)
    .slice(0, 5);

  return {
    totalReceivables: receivables[0]?.total || 0,
    totalPayables: payables[0]?.total || 0,
    overdueCustomers,
    nearLimitCustomers,
    todayCollections: todayCollections[0]?.total || 0,
    monthCollections: monthCollections[0]?.total || 0,
    largestOutstanding,
  };
};

export const setOpeningBalance = async (
  entityType: LedgerEntityType,
  entityId: string,
  amount: number,
  userId: string,
  userName: string,
  remarks?: string,
  session?: mongoose.ClientSession
) => {
  const existingOB = await LedgerEntry.findOne({
    entityType,
    entityId,
    transactionType: LedgerTransactionType.OPENING_BALANCE,
    isVoided: false,
  }).session(session || null);

  if (existingOB) {
    throw new ApiError(409, 'Opening balance already set for this account');
  }

  if (entityType === LedgerEntityType.CUSTOMER) {
    const entity = await Customer.findById(entityId).session(session || null);
    if (!entity) throw new ApiError(404, 'Customer not found');

    await postLedgerEntry({
      entityType,
      entityId,
      transactionType: LedgerTransactionType.OPENING_BALANCE,
      referenceNumber: 'OB-' + Date.now(),
      debit: amount > 0 ? amount : 0,
      credit: amount < 0 ? Math.abs(amount) : 0,
      remarks: remarks || 'Opening balance',
      userId,
      userName,
      session,
    });

    if (amount > 0) {
      await Customer.findByIdAndUpdate(entityId, { outstandingAmount: amount }, { session });
    } else if (amount < 0) {
      await Customer.findByIdAndUpdate(
        entityId,
        { outstandingAmount: 0, advanceBalance: Math.abs(amount) },
        { session }
      );
    }
    return;
  }

  const entity = await Supplier.findById(entityId).session(session || null);
  if (!entity) throw new ApiError(404, 'Supplier not found');

  await postLedgerEntry({
    entityType,
    entityId,
    transactionType: LedgerTransactionType.OPENING_BALANCE,
    referenceNumber: 'OB-' + Date.now(),
    debit: amount > 0 ? amount : 0,
    credit: amount < 0 ? Math.abs(amount) : 0,
    remarks: remarks || 'Opening balance',
    userId,
    userName,
    session,
  });

  if (amount > 0) {
    await Supplier.findByIdAndUpdate(entityId, { outstandingAmount: amount }, { session });
  } else if (amount < 0) {
    await Supplier.findByIdAndUpdate(
      entityId,
      { outstandingAmount: 0, advanceBalance: Math.abs(amount) },
      { session }
    );
  }
};

export const markBadDebt = async (
  customerId: string,
  amount: number,
  status: BadDebtStatus,
  userId: string,
  userName: string,
  reason?: string
) => {
  await postLedgerEntry({
    entityType: LedgerEntityType.CUSTOMER,
    entityId: customerId,
    transactionType: LedgerTransactionType.BAD_DEBT,
    referenceNumber: `BD-${Date.now()}`,
    credit: amount,
    remarks: reason || `Bad debt - ${status}`,
    userId,
    userName,
  });

  await Customer.findByIdAndUpdate(customerId, {
    $inc: { outstandingAmount: -amount },
    badDebtStatus: status,
  });

  await calculateRiskScore(customerId);
};
