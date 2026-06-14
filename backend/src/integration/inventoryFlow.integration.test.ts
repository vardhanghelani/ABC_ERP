import { describe, it, expect, beforeEach } from 'vitest';
import { AuditAction, InventoryTransactionType, InventoryTransaction } from '../models';
import {
  createTestContext,
  adjustProductStock,
  stockInProduct,
  stockOutProduct,
  markDamagedStock,
  runInventoryAudit,
  assertProductStock,
  assertInventoryTransaction,
  assertAuditLogExists,
  reloadProduct,
  TestContext,
} from '../test/helpers';

describe('Inventory Adjustment Integration', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext(100);
  });

  it('sets stock to absolute quantity on adjustment', async () => {
    await adjustProductStock(ctx, 75);
    await assertProductStock(ctx, 75);
  });

  it('records ADJUSTMENT inventory transaction', async () => {
    await adjustProductStock(ctx, 60);
    await assertInventoryTransaction(ctx, InventoryTransactionType.ADJUSTMENT, 40);
  });

  it('writes stock adjustment audit log', async () => {
    await adjustProductStock(ctx, 80);
    await assertAuditLogExists('Product', AuditAction.STOCK_CHANGE, ctx.product._id.toString());
  });

  it('increases stock on stock in movement', async () => {
    await stockInProduct(ctx, 25);
    await assertProductStock(ctx, 125);
  });

  it('records STOCK_IN inventory transaction', async () => {
    await stockInProduct(ctx, 10);
    await assertInventoryTransaction(ctx, InventoryTransactionType.STOCK_IN, 10);
  });

  it('decreases stock on stock out movement', async () => {
    await stockOutProduct(ctx, 15);
    await assertProductStock(ctx, 85);
  });

  it('records STOCK_OUT inventory transaction', async () => {
    await stockOutProduct(ctx, 12);
    await assertInventoryTransaction(ctx, InventoryTransactionType.STOCK_OUT, 12);
  });

  it('reduces stock when damaged quantity is recorded', async () => {
    await markDamagedStock(ctx, 8);
    await assertProductStock(ctx, 92);
  });

  it('records DAMAGED inventory transaction', async () => {
    await markDamagedStock(ctx, 5);
    await assertInventoryTransaction(ctx, InventoryTransactionType.DAMAGED, 5);
  });

  it('sets stock via inventory audit count', async () => {
    await runInventoryAudit(ctx, 42);
    await assertProductStock(ctx, 42);
  });

  it('records AUDIT inventory transaction with delta quantity', async () => {
    await runInventoryAudit(ctx, 110);
    await assertInventoryTransaction(ctx, InventoryTransactionType.AUDIT, 10);
  });

  it('writes inventory audit batch audit log', async () => {
    await runInventoryAudit(ctx, 95);
    await assertAuditLogExists('InventoryAudit', AuditAction.STOCK_CHANGE, 'batch');
  });

  it('tracks previous and new stock on adjustment transaction', async () => {
    await adjustProductStock(ctx, 55);
    const product = await reloadProduct(ctx);
    const tx = await InventoryTransaction.findOne({
      product: ctx.product._id,
      type: InventoryTransactionType.ADJUSTMENT,
    }).sort({ createdAt: -1 });
    expect(tx?.previousStock).toBe(100);
    expect(tx?.newStock).toBe(55);
  });
});
