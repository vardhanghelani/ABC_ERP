/**
 * Reproduce POS sale against configured MONGODB_URI.
 * Usage: npx ts-node-dev --transpile-only scripts/reproduce-sale.ts
 */
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { connectDB } from '../src/config/database';
import { Product, User } from '../src/models';
import { PaymentMethod } from '../src/models/Sale';
import { createSale } from '../src/controllers/saleController';
import { AuthRequest } from '../src/middleware/auth';

async function main() {
  await connectDB();

  const user = await User.findOne({ isActive: true }).sort({ createdAt: 1 });
  const product = await Product.findOne({ status: 'active', currentStock: { $gt: 0 } }).sort({ updatedAt: -1 });

  if (!user) {
    console.error('No active user found');
    process.exit(1);
  }
  if (!product) {
    console.error('No in-stock product found');
    process.exit(1);
  }

  const step = product.minimumBunch && product.minimumBunch > 0 ? product.minimumBunch : 1;
  const qty = Math.min(step, product.currentStock);
  const unitPrice = product.sellingPrice > 0 ? product.sellingPrice : product.wholesalePrice;
  const lineTotal = Math.round(qty * unitPrice * 100) / 100;
  const total = Math.round(lineTotal);

  const body = {
    items: [{ product: product._id.toString(), quantity: qty, unitPrice, discount: 0 }],
    discount: 0,
    discountType: 'fixed' as const,
    taxRate: 0,
    payments: [{ method: PaymentMethod.CASH, amount: total }],
    isPos: true,
  };

  console.log('=== REPRODUCE SALE ===');
  console.log('User:', user._id.toString(), user.email);
  console.log('Product:', product._id.toString(), product.name, 'stock:', product.currentStock);
  console.log('Payload:', JSON.stringify(body, null, 2));
  console.log('Product attributes type:', product.attributes?.constructor?.name);

  const req = {
    body,
    user,
    ip: '127.0.0.1',
    headers: { 'user-agent': 'reproduce-sale-script' },
  } as unknown as AuthRequest;

  let statusCode = 200;
  let payload: unknown = null;

  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: unknown) {
      payload = data;
      return this;
    },
  };

  try {
    await new Promise<void>((resolve, reject) => {
      createSale(req, res as never, (err?: unknown) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('SUCCESS status:', statusCode);
    console.log('Response:', JSON.stringify(payload, null, 2));
  } catch (error) {
    console.error('FAILED');
    if (error instanceof Error) {
      console.error('message:', error.message);
      console.error('stack:', error.stack);
    } else {
      console.error('error:', error);
    }
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
