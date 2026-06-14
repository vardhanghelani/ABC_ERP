import { Response } from 'express';
import { z } from 'zod';
import { Order, OrderStatus, Product, Customer } from '../models';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { generateDocumentNumber } from '../utils/tokens';
import { logAudit } from '../middleware/auditLog';
import { AuditAction } from '../models/AuditLog';

export const orderSchema = z.object({
  customer: z.string(),
  items: z.array(z.object({
    product: z.string(),
    quantity: z.number().min(1),
    unitPrice: z.number().min(0),
  })).min(1),
  discount: z.number().optional(),
  tax: z.number().optional(),
  deliveryDate: z.string().optional(),
  notes: z.string().optional(),
});

export const getOrders = asyncHandler(async (req: AuthRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const skip = (page - 1) * limit;
  const filter: Record<string, unknown> = {};
  if (req.query.status) filter.status = req.query.status;

  const [orders, total] = await Promise.all([
    Order.find(filter).populate('customer', 'name phone').sort({ createdAt: -1 }).skip(skip).limit(limit),
    Order.countDocuments(filter),
  ]);

  ApiResponse.paginated(res, orders, { page, limit, total });
});

export const getOrder = asyncHandler(async (req: AuthRequest, res: Response) => {
  const order = await Order.findById(req.params.id).populate('customer').populate('items.product', 'name sku');
  if (!order) throw new ApiError(404, 'Order not found');
  ApiResponse.success(res, order);
});

export const createOrder = asyncHandler(async (req: AuthRequest, res: Response) => {
  const customer = await Customer.findById(req.body.customer);
  if (!customer) throw new ApiError(404, 'Customer not found');

  const items = [];
  let subtotal = 0;

  for (const item of req.body.items) {
    const product = await Product.findById(item.product);
    if (!product) throw new ApiError(404, 'Product not found');
    const total = item.quantity * item.unitPrice;
    subtotal += total;
    items.push({
      product: product._id,
      productName: product.name,
      sku: product.sku,
      quantity: item.quantity,
      deliveredQuantity: 0,
      unitPrice: item.unitPrice,
      total,
    });
  }

  const orderNumber = await generateDocumentNumber('ORD', Order, 'orderNumber');
  const discount = req.body.discount || 0;
  const tax = req.body.tax || 0;

  const order = await Order.create({
    orderNumber,
    customer: customer._id,
    items,
    subtotal,
    discount,
    tax,
    total: subtotal - discount + tax,
    deliveryDate: req.body.deliveryDate,
    notes: req.body.notes,
    createdBy: req.user!._id,
  });

  await logAudit(req, AuditAction.CREATE, 'Order', order._id.toString());
  ApiResponse.success(res, order, 'Order created', 201);
});

export const deliverOrder = asyncHandler(async (req: AuthRequest, res: Response) => {
  const order = await Order.findById(req.params.id);
  if (!order) throw new ApiError(404, 'Order not found');

  const { deliveredItems } = req.body as { deliveredItems: { productId: string; quantity: number }[] };

  for (const delivered of deliveredItems) {
    const item = order.items.find((i) => i.product.toString() === delivered.productId);
    if (item) item.deliveredQuantity += delivered.quantity;
  }

  const allDelivered = order.items.every((i) => i.deliveredQuantity >= i.quantity);
  const anyDelivered = order.items.some((i) => i.deliveredQuantity > 0);
  order.status = allDelivered ? OrderStatus.COMPLETED : anyDelivered ? OrderStatus.PARTIAL : order.status;

  await order.save();
  ApiResponse.success(res, order, 'Delivery updated');
});

export const cancelOrder = asyncHandler(async (req: AuthRequest, res: Response) => {
  const order = await Order.findByIdAndUpdate(req.params.id, { status: OrderStatus.CANCELLED }, { new: true });
  if (!order) throw new ApiError(404, 'Order not found');
  ApiResponse.success(res, order, 'Order cancelled');
});
