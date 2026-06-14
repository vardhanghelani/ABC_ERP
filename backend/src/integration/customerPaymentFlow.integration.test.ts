import { describe, it, expect, beforeEach } from 'vitest';
import { Sale, PaymentMethod, AuditAction, LedgerEntityType } from '../models';
import {
  createTestContext,
  createTestSale,
  payCustomer,
  paySupplier,
  assertCustomerLedgerInSync,
  assertCustomerOutstandingMatchesInvoices,
  assertAuditLogExists,
  assertLedgerBalance,
  reloadCustomer,
  reloadSupplier,
  saleTotal,
  TestContext,
} from '../test/helpers';

describe('Customer Payment Integration', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext(200);
  });

  it('reduces customer outstanding when payment is received', async () => {
    const qty = 10;
    const unitPrice = 1000;
    const total = saleTotal(qty, unitPrice);
    await createTestSale(ctx, {
      customerId: ctx.shortTermCustomer._id.toString(),
      quantity: qty,
      unitPrice,
      payments: [{ method: PaymentMethod.CASH, amount: 0 }],
    });
    await payCustomer(ctx, ctx.shortTermCustomer._id.toString(), 4000);
    const customer = await reloadCustomer(ctx.shortTermCustomer._id.toString());
    expect(customer.outstandingAmount).toBe(total - 4000);
  });

  it('reduces invoice balance due when payment is applied', async () => {
    const sale = await createTestSale(ctx, {
      customerId: ctx.shortTermCustomer._id.toString(),
      quantity: 8,
      unitPrice: 1000,
      payments: [{ method: PaymentMethod.CASH, amount: 0 }],
    });
    await payCustomer(ctx, ctx.shortTermCustomer._id.toString(), 5000);
    const refreshed = await Sale.findById(sale._id);
    expect(refreshed?.balanceDue).toBe(3000);
  });

  it('posts ledger credit on customer payment', async () => {
    await createTestSale(ctx, {
      customerId: ctx.shortTermCustomer._id.toString(),
      quantity: 5,
      unitPrice: 1000,
      payments: [{ method: PaymentMethod.CASH, amount: 0 }],
    });
    await payCustomer(ctx, ctx.shortTermCustomer._id.toString(), 3000);
    await assertLedgerBalance(LedgerEntityType.CUSTOMER, ctx.shortTermCustomer._id.toString(), 2000);
  });

  it('keeps customer ledger in sync after payment', async () => {
    await createTestSale(ctx, {
      customerId: ctx.shortTermCustomer._id.toString(),
      payments: [{ method: PaymentMethod.CASH, amount: 1000 }],
    });
    await payCustomer(ctx, ctx.shortTermCustomer._id.toString(), 2000);
    await assertCustomerLedgerInSync(ctx.shortTermCustomer._id.toString());
  });

  it('writes payment audit log on customer receipt', async () => {
    await createTestSale(ctx, {
      customerId: ctx.shortTermCustomer._id.toString(),
      payments: [{ method: PaymentMethod.CASH, amount: 0 }],
    });
    const payment = await payCustomer(ctx, ctx.shortTermCustomer._id.toString(), 2500);
    await assertAuditLogExists('Payment', AuditAction.CREATE, (payment as { _id: string })._id);
  });

  it('clears outstanding when payment covers full balance', async () => {
    const qty = 5;
    const unitPrice = 1000;
    const total = saleTotal(qty, unitPrice);
    await createTestSale(ctx, {
      customerId: ctx.shortTermCustomer._id.toString(),
      quantity: qty,
      unitPrice,
      payments: [{ method: PaymentMethod.CASH, amount: 0 }],
    });
    await payCustomer(ctx, ctx.shortTermCustomer._id.toString(), total);
    const customer = await reloadCustomer(ctx.shortTermCustomer._id.toString());
    expect(customer.outstandingAmount).toBe(0);
  });

  it('applies partial payment and leaves remaining balance due', async () => {
    const sale = await createTestSale(ctx, {
      customerId: ctx.shortTermCustomer._id.toString(),
      quantity: 10,
      unitPrice: 1000,
      payments: [{ method: PaymentMethod.CASH, amount: 0 }],
    });
    await payCustomer(ctx, ctx.shortTermCustomer._id.toString(), 3500);
    const refreshed = await Sale.findById(sale._id);
    expect(refreshed?.balanceDue).toBe(6500);
  });

  it('keeps invoice outstanding aligned after payment', async () => {
    await createTestSale(ctx, {
      customerId: ctx.shortTermCustomer._id.toString(),
      payments: [{ method: PaymentMethod.CASH, amount: 500 }],
    });
    await payCustomer(ctx, ctx.shortTermCustomer._id.toString(), 1500);
    await assertCustomerOutstandingMatchesInvoices(ctx.shortTermCustomer._id.toString());
  });

  it('applies ACC customer payment against running balance', async () => {
    await createTestSale(ctx, {
      customerId: ctx.accCustomer._id.toString(),
      quantity: 10,
      unitPrice: 1000,
      payments: [{ method: PaymentMethod.CASH, amount: 2000 }],
    });
    await payCustomer(ctx, ctx.accCustomer._id.toString(), 5000);
    const customer = await reloadCustomer(ctx.accCustomer._id.toString());
    expect(customer.outstandingAmount).toBe(3000);
    await assertCustomerLedgerInSync(ctx.accCustomer._id.toString());
  });
});

describe('Advance Payment Integration', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext(200);
  });

  it('stores explicit advance in customer advance balance', async () => {
    await payCustomer(ctx, ctx.shortTermCustomer._id.toString(), 5000, { isAdvance: true });
    const customer = await reloadCustomer(ctx.shortTermCustomer._id.toString());
    expect(customer.advanceBalance).toBe(5000);
    expect(customer.outstandingAmount).toBe(0);
  });

  it('keeps ledger in sync when advance is recorded', async () => {
    await payCustomer(ctx, ctx.shortTermCustomer._id.toString(), 3000, { isAdvance: true });
    await assertCustomerLedgerInSync(ctx.shortTermCustomer._id.toString());
  });

  it('shows negative ledger balance equal to advance amount', async () => {
    await payCustomer(ctx, ctx.shortTermCustomer._id.toString(), 4500, { isAdvance: true });
    await assertLedgerBalance(LedgerEntityType.CUSTOMER, ctx.shortTermCustomer._id.toString(), -4500);
  });

  it('marks payment record as advance when isAdvance is true', async () => {
    const payment = await payCustomer(ctx, ctx.shortTermCustomer._id.toString(), 2000, { isAdvance: true });
    expect((payment as { isAdvance: boolean }).isAdvance).toBe(true);
  });

  it('auto-applies existing advance when new payment is received', async () => {
    await createTestSale(ctx, {
      customerId: ctx.shortTermCustomer._id.toString(),
      quantity: 10,
      unitPrice: 1000,
      payments: [{ method: PaymentMethod.CASH, amount: 0 }],
    });
    await payCustomer(ctx, ctx.shortTermCustomer._id.toString(), 3000, { isAdvance: true });
    await payCustomer(ctx, ctx.shortTermCustomer._id.toString(), 2000);
    const customer = await reloadCustomer(ctx.shortTermCustomer._id.toString());
    expect(customer.advanceBalance).toBe(0);
    expect(customer.outstandingAmount).toBe(5000);
    await assertCustomerLedgerInSync(ctx.shortTermCustomer._id.toString());
  });

  it('keeps outstanding and ledger aligned after advance plus sale plus payment', async () => {
    await payCustomer(ctx, ctx.accCustomer._id.toString(), 1000, { isAdvance: true });
    await createTestSale(ctx, {
      customerId: ctx.accCustomer._id.toString(),
      quantity: 4,
      unitPrice: 1000,
      payments: [{ method: PaymentMethod.CASH, amount: 500 }],
    });
    await payCustomer(ctx, ctx.accCustomer._id.toString(), 500);
    await assertCustomerOutstandingMatchesInvoices(ctx.accCustomer._id.toString());
    await assertCustomerLedgerInSync(ctx.accCustomer._id.toString());
  });

  it('writes audit log for advance payment receipt', async () => {
    const payment = await payCustomer(ctx, ctx.shortTermCustomer._id.toString(), 1500, { isAdvance: true });
    await assertAuditLogExists('Payment', AuditAction.CREATE, (payment as { _id: string })._id);
  });

  it('supports supplier advance payment balance', async () => {
    await paySupplier(ctx, ctx.supplier._id.toString(), 6000, { isAdvance: true });
    const supplier = await reloadSupplier(ctx.supplier._id.toString());
    expect(supplier.advanceBalance).toBe(6000);
  });
});
