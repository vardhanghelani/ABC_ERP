import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import { connectDB } from '../src/config/database';
import { Sale } from '../src/models/Sale';

async function main() {
  await connectDB();
  const sales = await Sale.find({ invoiceNumber: /^INV-202606-0000[5-9]|^INV-202606-00010$/ })
    .sort({ invoiceNumber: 1 })
    .select('invoiceNumber total paidAmount customer customerName createdAt createdBy isPos items');
  for (const s of sales) {
    console.log(
      s.invoiceNumber,
      s.customerName || 'walk-in',
      'total', s.total,
      'paid', s.paidAmount,
      'items', s.items.length,
      'qty', s.items[0]?.quantity,
      'price', s.items[0]?.unitPrice,
      'at', s.createdAt?.toISOString(),
      'by', s.createdBy?.toString()
    );
  }
  await mongoose.disconnect();
}
main();
