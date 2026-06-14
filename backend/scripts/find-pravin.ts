import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import { connectDB } from '../src/config/database';
import { Customer } from '../src/models/Customer';
import { Sale } from '../src/models/Sale';

async function main() {
  await connectDB();
  const dupes = await Customer.find({ phone: '9265190525' }).select('name phone outstandingAmount advanceBalance');
  console.log('Customers with phone 9265190525:', dupes);

  const sale = await Sale.findOne({ invoiceNumber: 'INV-202606-00005' }).select('customer invoiceNumber total balanceDue paidAmount');
  console.log('INV-00005 sale:', sale);
  if (sale?.customer) {
    const owner = await Customer.findById(sale.customer);
    console.log('Owner:', owner);
  }

  const allPravin = await Customer.find({ name: /pravin/i }).select('name phone outstandingAmount _id');
  console.log('All pravin names:', allPravin);
  await mongoose.disconnect();
}

main();
