import { Response, RequestHandler } from 'express';
import mongoose from 'mongoose';
import { expect } from 'vitest';
import { AuthRequest } from '../middleware/auth';
import {
  User,
  Category,
  Product,
  Customer,
  Supplier,
  Sale,
  SaleStatus,
  Purchase,
  PurchaseStatus,
  PaymentMethod,
  CreditTermType,
  LedgerEntityType,
  InventoryTransaction,
  InventoryTransactionType,
  AuditLog,
  AuditAction,
} from '../models';
import {
  getLastBalance,
  validateCustomerLedgerBalance,
  validateSupplierLedgerBalance,
} from '../services/ledgerService';
import { runReconciliation } from '../services/reconciliationService';
import { UserRole } from '../utils/permissions';
import crypto from 'crypto';
import { createSale, cancelSale } from '../controllers/saleController';
import { createPurchase, receivePurchase } from '../controllers/purchaseController';
import { receiveCustomerPayment, makeSupplierPayment } from '../controllers/creditController';
import { adjustStock, stockIn, stockOut, damagedStock, inventoryAudit } from '../controllers/inventoryController';

export interface ApiPayload<T = unknown> {
  success: boolean;
  message: string;
  data: T;
}

export interface TestContext {
  user: InstanceType<typeof User>;
  category: InstanceType<typeof Category>;
  product: InstanceType<typeof Product>;
  shortTermCustomer: InstanceType<typeof Customer>;
  accCustomer: InstanceType<typeof Customer>;
  supplier: InstanceType<typeof Supplier>;
}

let entityCounter = 0;
const nextId = () => {
  entityCounter += 1;
  return `${Date.now()}-${entityCounter}`;
};

export async function createTestContext(stock = 100): Promise<TestContext> {
  const suffix = nextId();
  const user = await User.create({
    name: 'Integration Tester',
    loginId: `test_${suffix.replace(/[^a-z0-9_]/g, '').slice(0, 20)}`,
    email: `test-${suffix}@example.com`,
    password: 'test123456',
    role: UserRole.ADMIN,
  });

  const category = await Category.create({
    name: `Category ${suffix}`,
    code: `T${String(entityCounter).padStart(4, '0')}`.slice(0, 8),
    createdBy: user._id,
  });

  const product = await Product.create({
    sku: `SKU-${suffix}`,
    name: `Product ${suffix}`,
    category: category._id,
    currentStock: stock,
    purchasePrice: 100,
    wholesalePrice: 150,
    retailPrice: 200,
    barcode: `BC-${suffix}`,
    createdBy: user._id,
  });

  const shortTermCustomer = await Customer.create({
    name: `Short Term ${suffix}`,
    phone: `9${suffix.replace(/\D/g, '').slice(-9).padStart(9, '0')}`,
    creditTermType: CreditTermType.SHORT_TERM,
    creditLimit: 500000,
    creditDays: 30,
    createdBy: user._id,
  });

  const accCustomer = await Customer.create({
    name: `ACC Customer ${suffix}`,
    phone: `8${suffix.replace(/\D/g, '').slice(-9).padStart(9, '0')}`,
    creditTermType: CreditTermType.LONG_TERM,
    creditLimit: 500000,
    createdBy: user._id,
  });

  const supplier = await Supplier.create({
    name: `Supplier ${suffix}`,
    phone: `7${suffix.replace(/\D/g, '').slice(-9).padStart(9, '0')}`,
    createdBy: user._id,
  });

  return { user, category, product, shortTermCustomer, accCustomer, supplier };
}

export async function invokeHandler<T = unknown>(
  handler: RequestHandler,
  options: {
    body?: Record<string, unknown>;
    params?: Record<string, string>;
    query?: Record<string, string>;
    user?: InstanceType<typeof User>;
  } = {}
): Promise<{ statusCode: number; payload: ApiPayload<T>; req: AuthRequest }> {
  const req = {
    body: options.body ?? {},
    params: options.params ?? {},
    query: options.query ?? {},
    user: options.user,
    ip: '127.0.0.1',
    headers: { 'user-agent': 'integration-test' },
  } as unknown as AuthRequest;

  let statusCode = 200;
  let payload: ApiPayload<T> = { success: false, message: '', data: null as T };

  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: ApiPayload<T>) {
      payload = data;
      return this;
    },
    setHeader() {
      return this;
    },
    send() {
      return this;
    },
  } as unknown as Response;

  await new Promise<void>((resolve, reject) => {
    handler(req, res, (err?: unknown) => {
      if (err) reject(err);
      else resolve();
    });
  });

  return { statusCode, payload, req };
}

export async function createTestSale(
  ctx: TestContext,
  options: {
    customerId?: string;
    quantity?: number;
    unitPrice?: number;
    payments: { method: PaymentMethod; amount: number; reference?: string }[];
  }
) {
  const quantity = options.quantity ?? 5;
  const unitPrice = options.unitPrice ?? 1000;
  const { payload, statusCode } = await invokeHandler(createSale, {
    user: ctx.user,
    body: {
      customer: options.customerId,
      items: [{ product: ctx.product._id.toString(), quantity, unitPrice }],
      payments: options.payments,
      isPos: true,
      idempotencyKey: crypto.randomUUID(),
    },
  });
  expect(statusCode).toBe(201);
  expect(payload.success).toBe(true);
  return payload.data as InstanceType<typeof Sale>;
}

export async function cancelTestSale(ctx: TestContext, saleId: string) {
  const { payload, statusCode } = await invokeHandler(cancelSale, {
    user: ctx.user,
    params: { id: saleId },
  });
  expect(statusCode).toBe(200);
  expect(payload.success).toBe(true);
  return payload.data as InstanceType<typeof Sale>;
}

export async function createTestPurchase(
  ctx: TestContext,
  options?: { quantity?: number; unitPrice?: number; supplierId?: string }
) {
  const quantity = options?.quantity ?? 20;
  const unitPrice = options?.unitPrice ?? 500;
  const { payload, statusCode } = await invokeHandler(createPurchase, {
    user: ctx.user,
    body: {
      supplier: options?.supplierId ?? ctx.supplier._id.toString(),
      items: [{ product: ctx.product._id.toString(), quantity, unitPrice }],
    },
  });
  expect(statusCode).toBe(201);
  expect(payload.success).toBe(true);
  return payload.data as InstanceType<typeof Purchase>;
}

export async function receiveTestPurchase(
  ctx: TestContext,
  purchaseId: string,
  quantity: number
) {
  const { payload, statusCode } = await invokeHandler(receivePurchase, {
    user: ctx.user,
    params: { id: purchaseId },
    body: {
      receivedItems: [{ productId: ctx.product._id.toString(), quantity }],
    },
  });
  expect(statusCode).toBe(200);
  expect(payload.success).toBe(true);
  return payload.data as InstanceType<typeof Purchase>;
}

export async function payCustomer(
  ctx: TestContext,
  customerId: string,
  amount: number,
  options?: { isAdvance?: boolean; method?: PaymentMethod }
) {
  const { payload, statusCode } = await invokeHandler(receiveCustomerPayment, {
    user: ctx.user,
    params: { id: customerId },
    body: {
      amount,
      method: options?.method ?? PaymentMethod.CASH,
      isAdvance: options?.isAdvance ?? false,
    },
  });
  expect(statusCode).toBe(201);
  expect(payload.success).toBe(true);
  return payload.data;
}

export async function paySupplier(
  ctx: TestContext,
  supplierId: string,
  amount: number,
  options?: { isAdvance?: boolean; method?: PaymentMethod }
) {
  const { payload, statusCode } = await invokeHandler(makeSupplierPayment, {
    user: ctx.user,
    params: { id: supplierId },
    body: {
      amount,
      method: options?.method ?? PaymentMethod.BANK,
      isAdvance: options?.isAdvance ?? false,
    },
  });
  expect(statusCode).toBe(201);
  expect(payload.success).toBe(true);
  return payload.data;
}

export async function adjustProductStock(ctx: TestContext, newQuantity: number) {
  const { payload, statusCode } = await invokeHandler(adjustStock, {
    user: ctx.user,
    body: { productId: ctx.product._id.toString(), quantity: newQuantity },
  });
  expect(statusCode).toBe(200);
  return payload.data;
}

export async function stockInProduct(ctx: TestContext, quantity: number) {
  const { statusCode } = await invokeHandler(stockIn, {
    user: ctx.user,
    body: { productId: ctx.product._id.toString(), quantity },
  });
  expect(statusCode).toBe(200);
}

export async function stockOutProduct(ctx: TestContext, quantity: number) {
  const { statusCode } = await invokeHandler(stockOut, {
    user: ctx.user,
    body: { productId: ctx.product._id.toString(), quantity },
  });
  expect(statusCode).toBe(200);
}

export async function markDamagedStock(ctx: TestContext, quantity: number) {
  const { statusCode } = await invokeHandler(damagedStock, {
    user: ctx.user,
    body: { productId: ctx.product._id.toString(), quantity },
  });
  expect(statusCode).toBe(200);
}

export async function runInventoryAudit(ctx: TestContext, actualStock: number) {
  const { statusCode } = await invokeHandler(inventoryAudit, {
    user: ctx.user,
    body: { items: [{ productId: ctx.product._id.toString(), actualStock }] },
  });
  expect(statusCode).toBe(200);
}

export async function reloadProduct(ctx: TestContext) {
  const product = await Product.findById(ctx.product._id);
  if (!product) throw new Error('Product missing in test reload');
  return product;
}

export async function reloadCustomer(customerId: string) {
  const customer = await Customer.findById(customerId);
  if (!customer) throw new Error('Customer missing in test reload');
  return customer;
}

export async function reloadSupplier(supplierId: string) {
  const supplier = await Supplier.findById(supplierId);
  if (!supplier) throw new Error('Supplier missing in test reload');
  return supplier;
}

export async function sumCustomerInvoiceOutstanding(customerId: string) {
  const sales = await Sale.find({ customer: customerId, status: SaleStatus.COMPLETED });
  return sales.reduce((sum, sale) => sum + sale.balanceDue, 0);
}

export async function sumSupplierPurchaseOutstanding(supplierId: string) {
  const purchases = await Purchase.find({
    supplier: supplierId,
    status: { $nin: [PurchaseStatus.CANCELLED] },
  });
  return purchases.reduce((sum, purchase) => sum + (purchase.total - purchase.paidAmount), 0);
}

export async function assertProductStock(ctx: TestContext, expected: number) {
  const product = await reloadProduct(ctx);
  expect(product.currentStock).toBe(expected);
}

export async function assertInventoryTransaction(
  ctx: TestContext,
  type: InventoryTransactionType,
  quantity: number
) {
  const tx = await InventoryTransaction.findOne({
    product: ctx.product._id,
    type,
    quantity,
  }).sort({ createdAt: -1 });
  expect(tx).toBeTruthy();
  expect(tx?.quantity).toBe(quantity);
}

export async function assertCustomerLedgerInSync(customerId: string) {
  const check = await validateCustomerLedgerBalance(customerId);
  expect(check.inSync).toBe(true);
  expect(Math.abs(check.ledgerBalance - check.expectedLedgerBalance)).toBeLessThan(0.01);
  return check;
}

export async function assertSupplierLedgerInSync(supplierId: string) {
  const check = await validateSupplierLedgerBalance(supplierId);
  expect(check.inSync).toBe(true);
  expect(Math.abs(check.ledgerBalance - check.expectedLedgerBalance)).toBeLessThan(0.01);
  return check;
}

export async function assertCustomerOutstandingMatchesInvoices(customerId: string) {
  const customer = await reloadCustomer(customerId);
  const invoiceOutstanding = await sumCustomerInvoiceOutstanding(customerId);
  expect(customer.outstandingAmount).toBeCloseTo(invoiceOutstanding, 2);
  return { customer, invoiceOutstanding };
}

export async function assertSupplierOutstandingMatchesPurchases(supplierId: string) {
  const supplier = await reloadSupplier(supplierId);
  const purchaseOutstanding = await sumSupplierPurchaseOutstanding(supplierId);
  expect(supplier.outstandingAmount).toBeCloseTo(purchaseOutstanding, 2);
  return { supplier, purchaseOutstanding };
}

export async function assertAuditLogExists(
  entity: string,
  action: AuditAction,
  entityId?: string
) {
  const filter: Record<string, unknown> = { entity, action };
  if (entityId) filter.entityId = entityId;
  const log = await AuditLog.findOne(filter).sort({ createdAt: -1 });
  expect(log).toBeTruthy();
  return log;
}

export async function assertLedgerBalance(
  entityType: LedgerEntityType,
  entityId: string,
  expected: number
) {
  const balance = await getLastBalance(entityType, entityId);
  expect(balance).toBeCloseTo(expected, 2);
  return balance;
}

export async function assertReconciliationInSync() {
  const report = await runReconciliation();
  expect(report.summary.accountsOutOfSync).toBe(0);
  return report;
}

export function saleTotal(quantity: number, unitPrice: number) {
  return quantity * unitPrice;
}
