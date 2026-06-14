/**
 * Full customer accounting audit for a given phone or customer id.
 * Usage: npx ts-node-dev --transpile-only scripts/audit-customer.ts 9265190525
 */
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { connectDB } from '../src/config/database';
import { Customer } from '../src/models/Customer';
import { Sale, SaleStatus } from '../src/models/Sale';
import { Payment } from '../src/models/Payment';
import { LedgerEntry, LedgerEntityType } from '../src/models/LedgerEntry';
import {
  syncLedgerRunningBalances,
  validateCustomerLedgerBalance,
  getCustomerSummary,
} from '../src/services/ledgerService';

async function main() {
  await connectDB();
  const key = process.argv[2] || '9265190525';
  const customer = mongoose.isValidObjectId(key)
    ? await Customer.findById(key)
    : await Customer.findOne({ $or: [{ phone: key }, { name: new RegExp(key, 'i') }] });

  if (!customer) {
    console.error('Customer not found:', key);
    process.exit(1);
  }

  const customerId = customer._id.toString();

  const sales = await Sale.find({ customer: customerId, status: SaleStatus.COMPLETED }).sort({ createdAt: 1 });
  const payments = await Payment.find({ customer: customerId, isVoided: { $ne: true } }).sort({ createdAt: 1 });
  const ledger = await LedgerEntry.find({
    entityType: LedgerEntityType.CUSTOMER,
    entityId: customerId,
    isVoided: false,
  }).sort({ createdAt: 1 });

  await syncLedgerRunningBalances(LedgerEntityType.CUSTOMER, customerId);
  const ledgerCheck = await validateCustomerLedgerBalance(customerId);
  const summary = await getCustomerSummary(customerId, { includeLedgerCheck: true });

  const sumInvoiceBalanceDue = sales.reduce((s, x) => s + x.balanceDue, 0);
  const sumInvoiceTotal = sales.reduce((s, x) => s + x.total, 0);
  const sumPayments = payments.reduce((s, x) => s + x.amount, 0);

  console.log(JSON.stringify({
    customer: {
      id: customerId,
      name: customer.name,
      phone: customer.phone,
      creditTermType: customer.creditTermType,
      stored: {
        outstandingAmount: customer.outstandingAmount,
        advanceBalance: customer.advanceBalance,
        totalPurchases: customer.totalPurchases,
        totalPayments: customer.totalPayments,
      },
    },
    computed: {
      sumSaleTotal: sumInvoiceTotal,
      sumSaleBalanceDue: sumInvoiceBalanceDue,
      sumPaymentAmount: sumPayments,
      netOutstanding: customer.outstandingAmount - customer.advanceBalance,
      pendingInvoiceCount: sales.filter((s) => s.balanceDue > 0).length,
    },
    ledgerCheck,
    summaryCards: {
      currentOutstanding: summary.currentOutstanding,
      advanceBalance: summary.advanceBalance,
      totalPurchases: summary.totalPurchases,
      totalPayments: summary.totalPayments,
      pendingInvoices: summary.pendingInvoices,
      pendingInvoiceAmount: summary.pendingInvoiceAmount,
      ledgerInSync: (summary as { ledgerInSync?: boolean }).ledgerInSync,
    },
    sales: sales.map((s) => ({
      invoiceNumber: s.invoiceNumber,
      total: s.total,
      paidAmount: s.paidAmount,
      balanceDue: s.balanceDue,
      createdAt: s.createdAt,
      payments: s.payments,
    })),
    payments: payments.map((p) => ({
      paymentNumber: p.paymentNumber,
      amount: p.amount,
      isAdvance: p.isAdvance,
      method: p.method,
      date: p.date,
      createdAt: p.createdAt,
      allocations: p.allocations,
    })),
    ledger: ledger.map((e) => ({
      referenceNumber: e.referenceNumber,
      transactionType: e.transactionType,
      debit: e.debit,
      credit: e.credit,
      runningBalance: e.runningBalance,
      createdAt: e.createdAt,
      remarks: e.remarks,
    })),
  }, null, 2));

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
