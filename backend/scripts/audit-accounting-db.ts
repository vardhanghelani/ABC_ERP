/**
 * Database-wide accounting diagnostics.
 * Usage: npx ts-node-dev --transpile-only scripts/audit-accounting-db.ts
 */
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { connectDB } from '../src/config/database';
import { Customer } from '../src/models/Customer';
import { Supplier } from '../src/models/Supplier';
import { Sale, SaleStatus } from '../src/models/Sale';
import { Purchase, PurchaseStatus } from '../src/models/Purchase';
import { LedgerEntityType } from '../src/models/LedgerEntry';
import {
  syncLedgerRunningBalances,
  validateCustomerLedgerBalance,
  validateSupplierLedgerBalance,
} from '../src/services/ledgerService';

async function main() {
  await connectDB();

  const report: Record<string, unknown> = {
    customers: { negativeOutstanding: [], negativeAdvance: [], ledgerMismatch: [], balanceDueMismatch: [] },
    suppliers: { negativeOutstanding: [], negativeAdvance: [], ledgerMismatch: [], balanceDueMismatch: [] },
  };

  const customers = await Customer.find({});
  for (const c of customers) {
    const id = c._id.toString();
    if (c.outstandingAmount < 0) (report.customers as { negativeOutstanding: string[] }).negativeOutstanding.push(`${c.name} (${id}): ${c.outstandingAmount}`);
    if (c.advanceBalance < 0) (report.customers as { negativeAdvance: string[] }).negativeAdvance.push(`${c.name} (${id}): ${c.advanceBalance}`);

    const sales = await Sale.find({ customer: id, status: SaleStatus.COMPLETED });
    const sumBalanceDue = sales.reduce((s, x) => s + x.balanceDue, 0);
    if (Math.abs(sumBalanceDue - c.outstandingAmount) > 0.01) {
      (report.customers as { balanceDueMismatch: object[] }).balanceDueMismatch.push({
        name: c.name,
        id,
        storedOutstanding: c.outstandingAmount,
        sumInvoiceBalanceDue: sumBalanceDue,
        diff: c.outstandingAmount - sumBalanceDue,
      });
    }

    await syncLedgerRunningBalances(LedgerEntityType.CUSTOMER, id);
    const check = await validateCustomerLedgerBalance(id);
    if (!check.inSync) {
      (report.customers as { ledgerMismatch: object[] }).ledgerMismatch.push({
        name: c.name,
        id,
        ...check,
      });
    }
  }

  const suppliers = await Supplier.find({});
  for (const s of suppliers) {
    const id = s._id.toString();
    if (s.outstandingAmount < 0) (report.suppliers as { negativeOutstanding: string[] }).negativeOutstanding.push(`${s.name} (${id}): ${s.outstandingAmount}`);
    if (s.advanceBalance < 0) (report.suppliers as { negativeAdvance: string[] }).negativeAdvance.push(`${s.name} (${id}): ${s.advanceBalance}`);

    const purchases = await Purchase.find({ supplier: id, status: PurchaseStatus.RECEIVED });
    const sumBalanceDue = purchases.reduce((sum, p) => sum + (p.balanceDue || 0), 0);
    if (Math.abs(sumBalanceDue - s.outstandingAmount) > 0.01) {
      (report.suppliers as { balanceDueMismatch: object[] }).balanceDueMismatch.push({
        name: s.name,
        id,
        storedOutstanding: s.outstandingAmount,
        sumPurchaseBalanceDue: sumBalanceDue,
        diff: s.outstandingAmount - sumBalanceDue,
      });
    }

    await syncLedgerRunningBalances(LedgerEntityType.SUPPLIER, id);
    const check = await validateSupplierLedgerBalance(id);
    if (!check.inSync) {
      (report.suppliers as { ledgerMismatch: object[] }).ledgerMismatch.push({
        name: s.name,
        id,
        ...check,
      });
    }
  }

  console.log(JSON.stringify(report, null, 2));
  await mongoose.disconnect();
}

main();
