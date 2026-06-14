import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import { Sale } from '../src/models/Sale';
import { DocumentCounter } from '../src/models/DocumentCounter';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const sales = await Sale.find({ invoiceNumber: /^INV-202606/i })
    .sort({ invoiceNumber: -1 })
    .limit(10)
    .select('invoiceNumber createdAt');
  const counters = await DocumentCounter.find({ key: /^INV-202606/ });
  console.log('Recent sales:', sales.map((s) => s.invoiceNumber));
  console.log('DocumentCounter:', counters);
  await mongoose.disconnect();
}

main();
