import { describe, it, expect, beforeEach } from 'vitest';
import {
  Purchase,
  PurchaseStatus,
  AuditAction,
  InventoryTransactionType,
  LedgerEntityType,
} from '../models';
import {
  createTestContext,
  createTestPurchase,
  receiveTestPurchase,
  paySupplier,
  invokeHandler,
  assertProductStock,
  assertInventoryTransaction,
  assertSupplierLedgerInSync,
  assertSupplierOutstandingMatchesPurchases,
  assertAuditLogExists,
  assertLedgerBalance,
  reloadSupplier,
  reloadProduct,
  TestContext,
} from '../test/helpers';
import { receivePurchase } from '../controllers/purchaseController';

describe('Purchase Creation Integration', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext(50);
  });

  it('creates purchase order with PENDING status', async () => {
    const purchase = await createTestPurchase(ctx, { quantity: 20, unitPrice: 500 });
    expect(purchase.status).toBe(PurchaseStatus.PENDING);
    expect(purchase.total).toBe(10000);
  });

  it('increases supplier outstanding on purchase creation', async () => {
    await createTestPurchase(ctx, { quantity: 10, unitPrice: 1000 });
    const supplier = await reloadSupplier(ctx.supplier._id.toString());
    expect(supplier.outstandingAmount).toBe(10000);
  });

  it('posts supplier ledger debit on purchase creation', async () => {
    await createTestPurchase(ctx, { quantity: 8, unitPrice: 1250 });
    await assertLedgerBalance(LedgerEntityType.SUPPLIER, ctx.supplier._id.toString(), 10000);
  });

  it('does not change stock when purchase order is created', async () => {
    const before = (await reloadProduct(ctx)).currentStock;
    await createTestPurchase(ctx, { quantity: 15, unitPrice: 400 });
    await assertProductStock(ctx, before);
  });

  it('writes purchase create audit log', async () => {
    const purchase = await createTestPurchase(ctx);
    await assertAuditLogExists('Purchase', AuditAction.CREATE, purchase._id.toString());
  });

  it('keeps supplier ledger in sync after purchase creation', async () => {
    await createTestPurchase(ctx, { quantity: 12, unitPrice: 500 });
    await assertSupplierLedgerInSync(ctx.supplier._id.toString());
  });
});

describe('Purchase Receive Integration', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext(50);
  });

  it('sets PARTIAL status when only part of PO is received', async () => {
    const purchase = await createTestPurchase(ctx, { quantity: 20, unitPrice: 500 });
    const received = await receiveTestPurchase(ctx, purchase._id.toString(), 8);
    expect(received.status).toBe(PurchaseStatus.PARTIAL);
  });

  it('sets RECEIVED status when full PO quantity is received', async () => {
    const purchase = await createTestPurchase(ctx, { quantity: 15, unitPrice: 400 });
    const received = await receiveTestPurchase(ctx, purchase._id.toString(), 15);
    expect(received.status).toBe(PurchaseStatus.RECEIVED);
  });

  it('increases product stock on purchase receive', async () => {
    const purchase = await createTestPurchase(ctx, { quantity: 10, unitPrice: 500 });
    await receiveTestPurchase(ctx, purchase._id.toString(), 10);
    await assertProductStock(ctx, 60);
  });

  it('records PURCHASE inventory transaction on receive', async () => {
    const purchase = await createTestPurchase(ctx, { quantity: 6, unitPrice: 500 });
    await receiveTestPurchase(ctx, purchase._id.toString(), 6);
    await assertInventoryTransaction(ctx, InventoryTransactionType.PURCHASE, 6);
  });

  it('writes purchase receive audit log', async () => {
    const purchase = await createTestPurchase(ctx, { quantity: 5, unitPrice: 500 });
    await receiveTestPurchase(ctx, purchase._id.toString(), 5);
    await assertAuditLogExists('Purchase', AuditAction.UPDATE, purchase._id.toString());
  });

  it('rejects receiving more than remaining PO quantity', async () => {
    const purchase = await createTestPurchase(ctx, { quantity: 10, unitPrice: 500 });
    await expect(
      invokeHandler(receivePurchase, {
        user: ctx.user,
        params: { id: purchase._id.toString() },
        body: { receivedItems: [{ productId: ctx.product._id.toString(), quantity: 15 }] },
      })
    ).rejects.toThrow('Cannot receive');
  });

  it('keeps supplier outstanding unchanged on receive (payable already posted)', async () => {
    const purchase = await createTestPurchase(ctx, { quantity: 10, unitPrice: 1000 });
    const before = (await reloadSupplier(ctx.supplier._id.toString())).outstandingAmount;
    await receiveTestPurchase(ctx, purchase._id.toString(), 10);
    const after = (await reloadSupplier(ctx.supplier._id.toString())).outstandingAmount;
    expect(after).toBe(before);
  });
});

describe('Supplier Payment Integration', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext(50);
  });

  it('reduces supplier outstanding when payment is made', async () => {
    await createTestPurchase(ctx, { quantity: 10, unitPrice: 1000 });
    await paySupplier(ctx, ctx.supplier._id.toString(), 4000);
    const supplier = await reloadSupplier(ctx.supplier._id.toString());
    expect(supplier.outstandingAmount).toBe(6000);
  });

  it('updates purchase paid amount when supplier payment is applied', async () => {
    const purchase = await createTestPurchase(ctx, { quantity: 10, unitPrice: 1000 });
    await paySupplier(ctx, ctx.supplier._id.toString(), 5000);
    const refreshed = await Purchase.findById(purchase._id);
    expect(refreshed?.paidAmount).toBe(5000);
  });

  it('posts supplier ledger credit on payment', async () => {
    await createTestPurchase(ctx, { quantity: 8, unitPrice: 1000 });
    await paySupplier(ctx, ctx.supplier._id.toString(), 3000);
    await assertLedgerBalance(LedgerEntityType.SUPPLIER, ctx.supplier._id.toString(), 5000);
  });

  it('keeps supplier ledger in sync after payment', async () => {
    await createTestPurchase(ctx, { quantity: 5, unitPrice: 2000 });
    await paySupplier(ctx, ctx.supplier._id.toString(), 5000);
    await assertSupplierLedgerInSync(ctx.supplier._id.toString());
  });

  it('writes supplier payment audit log', async () => {
    await createTestPurchase(ctx, { quantity: 4, unitPrice: 2500 });
    const payment = await paySupplier(ctx, ctx.supplier._id.toString(), 2500);
    await assertAuditLogExists('Payment', AuditAction.CREATE, (payment as { _id: string })._id);
  });

  it('clears supplier outstanding when PO is fully paid', async () => {
    await createTestPurchase(ctx, { quantity: 10, unitPrice: 1000 });
    await paySupplier(ctx, ctx.supplier._id.toString(), 10000);
    const supplier = await reloadSupplier(ctx.supplier._id.toString());
    expect(supplier.outstandingAmount).toBe(0);
  });

  it('keeps purchase outstanding aligned with stored supplier outstanding', async () => {
    await createTestPurchase(ctx, { quantity: 6, unitPrice: 1000 });
    await paySupplier(ctx, ctx.supplier._id.toString(), 2000);
    await assertSupplierOutstandingMatchesPurchases(ctx.supplier._id.toString());
  });

  it('records supplier advance separately from outstanding', async () => {
    await createTestPurchase(ctx, { quantity: 5, unitPrice: 1000 });
    await paySupplier(ctx, ctx.supplier._id.toString(), 8000, { isAdvance: false });
    const supplier = await reloadSupplier(ctx.supplier._id.toString());
    expect(supplier.outstandingAmount).toBe(0);
    expect(supplier.advanceBalance).toBe(3000);
    await assertSupplierLedgerInSync(ctx.supplier._id.toString());
  });
});
