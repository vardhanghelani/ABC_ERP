import { Response } from 'express';
import { z } from 'zod';
import { Payment, PaymentType, PaymentEntity, PaymentMethod } from '../models';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { generateDocumentNumber } from '../utils/tokens';

export const paymentSchema = z.object({
  type: z.nativeEnum(PaymentType),
  entity: z.nativeEnum(PaymentEntity),
  customer: z.string().optional(),
  supplier: z.string().optional(),
  sale: z.string().optional(),
  purchase: z.string().optional(),
  amount: z.number().min(0.01),
  method: z.nativeEnum(PaymentMethod),
  reference: z.string().optional(),
  notes: z.string().optional(),
  date: z.string().optional(),
});

export const getPayments = asyncHandler(async (req: AuthRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const skip = (page - 1) * limit;
  const filter: Record<string, unknown> = {};
  if (req.query.type) filter.type = req.query.type;
  if (req.query.entity) filter.entity = req.query.entity;

  const [payments, total] = await Promise.all([
    Payment.find(filter)
      .populate('customer', 'name')
      .populate('supplier', 'name')
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit),
    Payment.countDocuments(filter),
  ]);

  ApiResponse.paginated(res, payments, { page, limit, total });
});

export const createPayment = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (
    req.body.type === PaymentType.RECEIPT &&
    req.body.entity === PaymentEntity.CUSTOMER &&
    req.body.customer
  ) {
    throw new ApiError(
      400,
      'Customer receipts must use POST /customers/:id/receive-payment to keep ledger and invoices in sync'
    );
  }

  if (
    req.body.type === PaymentType.PAYMENT &&
    req.body.entity === PaymentEntity.SUPPLIER &&
    req.body.supplier
  ) {
    throw new ApiError(
      400,
      'Supplier payments must use POST /suppliers/:id/make-payment to keep ledger and purchase records in sync'
    );
  }

  const paymentNumber = await generateDocumentNumber(
    req.body.type === PaymentType.RECEIPT ? 'RCP' : 'PAY',
    Payment,
    'paymentNumber'
  );

  const payment = await Payment.create({
    ...req.body,
    paymentNumber,
    date: req.body.date ? new Date(req.body.date) : new Date(),
    createdBy: req.user!._id,
  });

  ApiResponse.success(res, payment, 'Payment recorded', 201);
});

export const getCashBook = asyncHandler(async (req: AuthRequest, res: Response) => {
  const from = req.query.from ? new Date(req.query.from as string) : new Date(new Date().setDate(1));
  const to = req.query.to ? new Date(req.query.to as string) : new Date();

  const payments = await Payment.find({
    date: { $gte: from, $lte: to },
    method: { $in: [PaymentMethod.CASH, PaymentMethod.UPI] },
  }).sort({ date: -1 });

  const summary = payments.reduce(
    (acc, p) => {
      if (p.type === PaymentType.RECEIPT) acc.receipts += p.amount;
      else acc.payments += p.amount;
      return acc;
    },
    { receipts: 0, payments: 0 }
  );

  ApiResponse.success(res, { payments, summary, balance: summary.receipts - summary.payments });
});

export const getBankBook = asyncHandler(async (req: AuthRequest, res: Response) => {
  const from = req.query.from ? new Date(req.query.from as string) : new Date(new Date().setDate(1));
  const to = req.query.to ? new Date(req.query.to as string) : new Date();

  const payments = await Payment.find({
    date: { $gte: from, $lte: to },
    method: PaymentMethod.BANK,
  }).sort({ date: -1 });

  ApiResponse.success(res, payments);
});
