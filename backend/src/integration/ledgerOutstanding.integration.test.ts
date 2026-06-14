import { describe, it, expect, beforeEach } from 'vitest';
import {
  PaymentMethod,
  LedgerEntityType,
  LedgerEntry,
} from '../models';
import {
  createTestContext,
  createTestSale,
  cancelTestSale,
  createTestPurchase,
  receiveTestPurchase,
  payCustomer,
  paySupplier,
  assertCustomerLedgerInSync,
  assertSupplierLedgerInSync,
  assertCustomerOutstandingMatchesInvoices,
  assertSupplierOutstandingMatchesPurchases,
  assertReconciliationInSync,
  assertLedgerBalance,
  sumCustomerInvoiceOutstanding,
  sumSupplierPurchaseOutstanding,
  TestContext,
} from '../test/helpers';
import { validateCustomerLedgerBalance, validateSupplierLedgerBalance } from '../services/ledgerService';
import { runReconciliation } from '../services/reconciliationService';

describe('Ledger Validation Integration', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext(150);
  });

  it('validates customer ledger in sync after credit sale', async () => {
    await createTestSale(ctx, {
      customerId: ctx.shortTermCustomer._id.toString(),
      payments: [{ method: PaymentMethod.CASH, amount: 1000 }],
    });
    const result = await validateCustomerLedgerBalance(ctx.shortTermCustomer._id.toString());
    expect(result.inSync).toBe(true);
  });

  it('validates customer ledger in sync after sale and payment', async () => {
    await createTestSale(ctx, {
      customerId: ctx.shortTermCustomer._id.toString(),
      quantity: 10,
      unitPrice: 1000,
      payments: [{ method: PaymentMethod.CASH, amount: 0 }],
    });
    await payCustomer(ctx, ctx.shortTermCustomer._id.toString(), 6000);
    await assertCustomerLedgerInSync(ctx.shortTermCustomer._id.toString());
  });

  it('validates customer ledger in sync after sale cancellation', async () => {
    const sale = await createTestSale(ctx, {
      customerId: ctx.shortTermCustomer._id.toString(),
      payments: [{ method: PaymentMethod.CASH, amount: 500 }],
    });
    await cancelTestSale(ctx, sale._id.toString());
    await assertCustomerLedgerInSync(ctx.shortTermCustomer._id.toString());
  });

  it('validates ACC customer ledger after multiple sales and payments', async () => {
    await createTestSale(ctx, {
      customerId: ctx.accCustomer._id.toString(),
      quantity: 5,
      unitPrice: 1000,
      payments: [{ method: PaymentMethod.CASH, amount: 1000 }],
    });
    await createTestSale(ctx, {
      customerId: ctx.accCustomer._id.toString(),
      quantity: 3,
      unitPrice: 1000,
      payments: [{ method: PaymentMethod.CASH, amount: 0 }],
    });
    await payCustomer(ctx, ctx.accCustomer._id.toString(), 4000);
    await assertCustomerLedgerInSync(ctx.accCustomer._id.toString());
  });

  it('validates supplier ledger in sync after purchase creation', async () => {
    await createTestPurchase(ctx, { quantity: 10, unitPrice: 800 });
    await assertSupplierLedgerInSync(ctx.supplier._id.toString());
  });

  it('validates supplier ledger in sync after purchase and payment', async () => {
    await createTestPurchase(ctx, { quantity: 12, unitPrice: 500 });
    await paySupplier(ctx, ctx.supplier._id.toString(), 3000);
    const result = await validateSupplierLedgerBalance(ctx.supplier._id.toString());
    expect(result.inSync).toBe(true);
    expect(result.expectedLedgerBalance).toBeCloseTo(result.ledgerBalance, 2);
  });

  it('matches getLastBalance to final ledger entry running balance', async () => {
    await createTestSale(ctx, {
      customerId: ctx.shortTermCustomer._id.toString(),
      payments: [{ method: PaymentMethod.CASH, amount: 2000 }],
    });
    await payCustomer(ctx, ctx.shortTermCustomer._id.toString(), 1000);
    const lastEntry = await LedgerEntry.findOne({
      entityType: LedgerEntityType.CUSTOMER,
      entityId: ctx.shortTermCustomer._id,
      isVoided: false,
    }).sort({ date: -1, createdAt: -1 });
    await assertLedgerBalance(
      LedgerEntityType.CUSTOMER,
      ctx.shortTermCustomer._id.toString(),
      lastEntry?.runningBalance ?? 0
    );
  });

  it('keeps advance-adjusted expected ledger balance correct', async () => {
    await payCustomer(ctx, ctx.shortTermCustomer._id.toString(), 2500, { isAdvance: true });
    const check = await validateCustomerLedgerBalance(ctx.shortTermCustomer._id.toString());
    expect(check.advanceBalance).toBe(2500);
    expect(check.expectedLedgerBalance).toBeCloseTo(-2500, 2);
    expect(check.inSync).toBe(true);
  });
});

describe('Outstanding Validation Integration', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext(150);
  });

  it('matches customer stored outstanding to invoice balance due sum', async () => {
    await createTestSale(ctx, {
      customerId: ctx.shortTermCustomer._id.toString(),
      quantity: 6,
      unitPrice: 1000,
      payments: [{ method: PaymentMethod.CASH, amount: 1000 }],
    });
    await assertCustomerOutstandingMatchesInvoices(ctx.shortTermCustomer._id.toString());
  });

  it('matches supplier stored outstanding to open purchase balance sum', async () => {
    await createTestPurchase(ctx, { quantity: 8, unitPrice: 1000 });
    await assertSupplierOutstandingMatchesPurchases(ctx.supplier._id.toString());
  });

  it('updates invoice outstanding sum after customer payment', async () => {
    await createTestSale(ctx, {
      customerId: ctx.shortTermCustomer._id.toString(),
      quantity: 10,
      unitPrice: 1000,
      payments: [{ method: PaymentMethod.CASH, amount: 0 }],
    });
    await payCustomer(ctx, ctx.shortTermCustomer._id.toString(), 7000);
    const invoiceOutstanding = await sumCustomerInvoiceOutstanding(ctx.shortTermCustomer._id.toString());
    expect(invoiceOutstanding).toBe(3000);
    await assertCustomerOutstandingMatchesInvoices(ctx.shortTermCustomer._id.toString());
  });

  it('updates purchase outstanding sum after supplier payment', async () => {
    await createTestPurchase(ctx, { quantity: 10, unitPrice: 1000 });
    await paySupplier(ctx, ctx.supplier._id.toString(), 4000);
    const purchaseOutstanding = await sumSupplierPurchaseOutstanding(ctx.supplier._id.toString());
    expect(purchaseOutstanding).toBe(6000);
    await assertSupplierOutstandingMatchesPurchases(ctx.supplier._id.toString());
  });

  it('zeros customer outstanding after full payment', async () => {
    await createTestSale(ctx, {
      customerId: ctx.shortTermCustomer._id.toString(),
      quantity: 5,
      unitPrice: 1000,
      payments: [{ method: PaymentMethod.CASH, amount: 0 }],
    });
    await payCustomer(ctx, ctx.shortTermCustomer._id.toString(), 5000);
    const invoiceOutstanding = await sumCustomerInvoiceOutstanding(ctx.shortTermCustomer._id.toString());
    expect(invoiceOutstanding).toBe(0);
  });

  it('zeros supplier outstanding after full payment', async () => {
    await createTestPurchase(ctx, { quantity: 6, unitPrice: 1000 });
    await paySupplier(ctx, ctx.supplier._id.toString(), 6000);
    const purchaseOutstanding = await sumSupplierPurchaseOutstanding(ctx.supplier._id.toString());
    expect(purchaseOutstanding).toBe(0);
  });

  it('passes reconciliation report after full business cycle', async () => {
    const purchase = await createTestPurchase(ctx, { quantity: 20, unitPrice: 500 });
    await receiveTestPurchase(ctx, purchase._id.toString(), 10);
    await paySupplier(ctx, ctx.supplier._id.toString(), 5000);
    await createTestSale(ctx, {
      customerId: ctx.shortTermCustomer._id.toString(),
      quantity: 5,
      unitPrice: 1000,
      payments: [{ method: PaymentMethod.CASH, amount: 2000 }],
    });
    await payCustomer(ctx, ctx.shortTermCustomer._id.toString(), 1000);
    const report = await assertReconciliationInSync();
    expect(report.summary.totalAccountsChecked).toBeGreaterThan(0);
  });

  it('reports all accounts in sync after coordinated flows', async () => {
    const purchase = await createTestPurchase(ctx, { quantity: 10, unitPrice: 1000 });
    await receiveTestPurchase(ctx, purchase._id.toString(), 10);
    await paySupplier(ctx, ctx.supplier._id.toString(), 10000);
    await createTestSale(ctx, {
      customerId: ctx.accCustomer._id.toString(),
      quantity: 4,
      unitPrice: 1000,
      payments: [{ method: PaymentMethod.CASH, amount: 1000 }],
    });
    await payCustomer(ctx, ctx.accCustomer._id.toString(), 2000);
    const report = await runReconciliation();
    expect(report.summary.accountsOutOfSync).toBe(0);
    expect(report.summary.accountsInSync).toBe(report.summary.totalAccountsChecked);
  });

  it('clears outstanding validation after sale cancellation', async () => {
    const sale = await createTestSale(ctx, {
      customerId: ctx.shortTermCustomer._id.toString(),
      payments: [{ method: PaymentMethod.CASH, amount: 0 }],
    });
    await cancelTestSale(ctx, sale._id.toString());
    const invoiceOutstanding = await sumCustomerInvoiceOutstanding(ctx.shortTermCustomer._id.toString());
    expect(invoiceOutstanding).toBe(0);
    await assertCustomerOutstandingMatchesInvoices(ctx.shortTermCustomer._id.toString());
  });
});
