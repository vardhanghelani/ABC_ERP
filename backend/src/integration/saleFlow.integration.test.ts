import { describe, it, expect, beforeEach } from 'vitest';
import {
  SaleStatus,
  PaymentMethod,
  CreditTermType,
  AuditAction,
  InventoryTransactionType,
  LedgerEntityType,
} from '../models';
import {
  createTestContext,
  createTestSale,
  cancelTestSale,
  invokeHandler,
  assertProductStock,
  assertInventoryTransaction,
  assertCustomerLedgerInSync,
  assertCustomerOutstandingMatchesInvoices,
  assertAuditLogExists,
  assertLedgerBalance,
  reloadCustomer,
  reloadProduct,
  saleTotal,
  TestContext,
} from '../test/helpers';
import { createSale } from '../controllers/saleController';

describe('Sale Creation Integration', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext(100);
  });

  it('creates a completed sale with correct totals and status', async () => {
    const qty = 5;
    const unitPrice = 1000;
    const total = saleTotal(qty, unitPrice);
    const sale = await createTestSale(ctx, {
      customerId: ctx.shortTermCustomer._id.toString(),
      quantity: qty,
      unitPrice,
      payments: [{ method: PaymentMethod.CASH, amount: 4000 }],
    });

    expect(sale.status).toBe(SaleStatus.COMPLETED);
    expect(sale.total).toBe(total);
    expect(sale.paidAmount).toBe(4000);
    expect(sale.balanceDue).toBe(total - 4000);
  });

  it('reduces product stock when a sale is created', async () => {
    await createTestSale(ctx, {
      customerId: ctx.shortTermCustomer._id.toString(),
      quantity: 8,
      payments: [{ method: PaymentMethod.CASH, amount: 8000 }],
    });
    await assertProductStock(ctx, 92);
  });

  it('records a SALE inventory transaction', async () => {
    await createTestSale(ctx, {
      customerId: ctx.shortTermCustomer._id.toString(),
      quantity: 3,
      payments: [{ method: PaymentMethod.CASH, amount: 3000 }],
    });
    await assertInventoryTransaction(ctx, InventoryTransactionType.SALE, 3);
  });

  it('writes an invoice audit log for sale creation', async () => {
    const sale = await createTestSale(ctx, {
      customerId: ctx.shortTermCustomer._id.toString(),
      payments: [{ method: PaymentMethod.CASH, amount: 5000 }],
    });
    await assertAuditLogExists('Sale', AuditAction.INVOICE, sale._id.toString());
  });

  it('increases short-term customer outstanding for credit portion', async () => {
    const qty = 10;
    const unitPrice = 1000;
    const total = saleTotal(qty, unitPrice);
    await createTestSale(ctx, {
      customerId: ctx.shortTermCustomer._id.toString(),
      quantity: qty,
      unitPrice,
      payments: [{ method: PaymentMethod.CASH, amount: 3000 }],
    });
    const customer = await reloadCustomer(ctx.shortTermCustomer._id.toString());
    expect(customer.outstandingAmount).toBe(total - 3000);
  });

  it('posts short-term ledger debit equal to balance due', async () => {
    const qty = 4;
    const unitPrice = 2500;
    const total = saleTotal(qty, unitPrice);
    const balanceDue = total - 2000;
    await createTestSale(ctx, {
      customerId: ctx.shortTermCustomer._id.toString(),
      quantity: qty,
      unitPrice,
      payments: [{ method: PaymentMethod.CASH, amount: 2000 }],
    });
    await assertLedgerBalance(LedgerEntityType.CUSTOMER, ctx.shortTermCustomer._id.toString(), balanceDue);
  });

  it('keeps short-term ledger in sync after credit sale', async () => {
    await createTestSale(ctx, {
      customerId: ctx.shortTermCustomer._id.toString(),
      payments: [{ method: PaymentMethod.CASH, amount: 1000 }],
    });
    await assertCustomerLedgerInSync(ctx.shortTermCustomer._id.toString());
  });

  it('keeps invoice outstanding aligned with stored outstanding after sale', async () => {
    await createTestSale(ctx, {
      customerId: ctx.shortTermCustomer._id.toString(),
      payments: [{ method: PaymentMethod.CASH, amount: 1500 }],
    });
    await assertCustomerOutstandingMatchesInvoices(ctx.shortTermCustomer._id.toString());
  });

  it('posts ACC sale total and payment-at-sale to ledger', async () => {
    const qty = 6;
    const unitPrice = 1000;
    const total = saleTotal(qty, unitPrice);
    await createTestSale(ctx, {
      customerId: ctx.accCustomer._id.toString(),
      quantity: qty,
      unitPrice,
      payments: [{ method: PaymentMethod.CASH, amount: 2000 }],
    });
    await assertLedgerBalance(
      LedgerEntityType.CUSTOMER,
      ctx.accCustomer._id.toString(),
      total - 2000
    );
  });

  it('sets ACC outstanding equal to balance due after sale', async () => {
    const qty = 5;
    const unitPrice = 1200;
    const total = saleTotal(qty, unitPrice);
    await createTestSale(ctx, {
      customerId: ctx.accCustomer._id.toString(),
      quantity: qty,
      unitPrice,
      payments: [{ method: PaymentMethod.CASH, amount: 1000 }],
    });
    const customer = await reloadCustomer(ctx.accCustomer._id.toString());
    expect(customer.outstandingAmount).toBe(total - 1000);
  });

  it('allows fully paid short-term sale without ledger debit', async () => {
    const qty = 2;
    const unitPrice = 1000;
    const total = saleTotal(qty, unitPrice);
    await createTestSale(ctx, {
      customerId: ctx.shortTermCustomer._id.toString(),
      quantity: qty,
      unitPrice,
      payments: [{ method: PaymentMethod.CASH, amount: total }],
    });
    await assertLedgerBalance(LedgerEntityType.CUSTOMER, ctx.shortTermCustomer._id.toString(), 0);
    const customer = await reloadCustomer(ctx.shortTermCustomer._id.toString());
    expect(customer.outstandingAmount).toBe(0);
  });

  it('rejects walk-in sale when payment is less than total', async () => {
    await expect(
      invokeHandler(createSale, {
        user: ctx.user,
        body: {
          items: [{ product: ctx.product._id.toString(), quantity: 5, unitPrice: 1000 }],
          payments: [{ method: PaymentMethod.CASH, amount: 1000 }],
          isPos: true,
        },
      })
    ).rejects.toThrow('Walk-in customers must pay full amount');
  });

  it('rejects sale when stock is insufficient', async () => {
    await expect(
      createTestSale(ctx, {
        customerId: ctx.shortTermCustomer._id.toString(),
        quantity: 500,
        payments: [{ method: PaymentMethod.CASH, amount: 500000 }],
      })
    ).rejects.toThrow('Insufficient stock');
  });
});

describe('Sale Cancellation Integration', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext(100);
  });

  it('restores stock when a credit sale is cancelled', async () => {
    const sale = await createTestSale(ctx, {
      customerId: ctx.shortTermCustomer._id.toString(),
      quantity: 7,
      payments: [{ method: PaymentMethod.CASH, amount: 0 }],
    });
    await assertProductStock(ctx, 93);
    await cancelTestSale(ctx, sale._id.toString());
    await assertProductStock(ctx, 100);
  });

  it('creates RETURN inventory transaction on cancellation', async () => {
    const sale = await createTestSale(ctx, {
      customerId: ctx.shortTermCustomer._id.toString(),
      quantity: 4,
      payments: [{ method: PaymentMethod.CASH, amount: 0 }],
    });
    await cancelTestSale(ctx, sale._id.toString());
    await assertInventoryTransaction(ctx, InventoryTransactionType.RETURN, 4);
  });

  it('sets sale status to CANCELLED', async () => {
    const sale = await createTestSale(ctx, {
      customerId: ctx.shortTermCustomer._id.toString(),
      payments: [{ method: PaymentMethod.CASH, amount: 1000 }],
    });
    const cancelled = await cancelTestSale(ctx, sale._id.toString());
    expect(cancelled.status).toBe(SaleStatus.CANCELLED);
  });

  it('zeros balance due after cancellation', async () => {
    const sale = await createTestSale(ctx, {
      customerId: ctx.shortTermCustomer._id.toString(),
      payments: [{ method: PaymentMethod.CASH, amount: 1000 }],
    });
    const cancelled = await cancelTestSale(ctx, sale._id.toString());
    expect(cancelled.balanceDue).toBe(0);
  });

  it('reverses short-term customer outstanding on cancel', async () => {
    const sale = await createTestSale(ctx, {
      customerId: ctx.shortTermCustomer._id.toString(),
      quantity: 5,
      unitPrice: 1000,
      payments: [{ method: PaymentMethod.CASH, amount: 2000 }],
    });
    await cancelTestSale(ctx, sale._id.toString());
    const customer = await reloadCustomer(ctx.shortTermCustomer._id.toString());
    expect(customer.outstandingAmount).toBe(0);
  });

  it('keeps short-term ledger in sync after cancellation', async () => {
    const sale = await createTestSale(ctx, {
      customerId: ctx.shortTermCustomer._id.toString(),
      payments: [{ method: PaymentMethod.CASH, amount: 1500 }],
    });
    await cancelTestSale(ctx, sale._id.toString());
    await assertCustomerLedgerInSync(ctx.shortTermCustomer._id.toString());
  });

  it('reverses ACC ledger balance after cancellation', async () => {
    await createTestSale(ctx, {
      customerId: ctx.accCustomer._id.toString(),
      quantity: 5,
      unitPrice: 1000,
      payments: [{ method: PaymentMethod.CASH, amount: 2000 }],
    });
    const sale = await createTestSale(ctx, {
      customerId: ctx.accCustomer._id.toString(),
      quantity: 3,
      unitPrice: 1000,
      payments: [{ method: PaymentMethod.CASH, amount: 1000 }],
    });
    await cancelTestSale(ctx, sale._id.toString());
    await assertCustomerLedgerInSync(ctx.accCustomer._id.toString());
  });

  it('rejects cancelling an already cancelled sale', async () => {
    const sale = await createTestSale(ctx, {
      customerId: ctx.shortTermCustomer._id.toString(),
      payments: [{ method: PaymentMethod.CASH, amount: 5000 }],
    });
    await cancelTestSale(ctx, sale._id.toString());
    await expect(cancelTestSale(ctx, sale._id.toString())).rejects.toThrow('Sale already cancelled');
  });

  it('keeps invoice outstanding aligned after cancellation', async () => {
    const sale = await createTestSale(ctx, {
      customerId: ctx.shortTermCustomer._id.toString(),
      payments: [{ method: PaymentMethod.CASH, amount: 1000 }],
    });
    await cancelTestSale(ctx, sale._id.toString());
    await assertCustomerOutstandingMatchesInvoices(ctx.shortTermCustomer._id.toString());
  });
});
