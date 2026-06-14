import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { connectDB } from '../src/config/database';
import { Customer } from '../src/models/Customer';
import { LedgerEntityType } from '../src/models/LedgerEntry';
import {
  getLedgerView,
  syncLedgerRunningBalances,
  validateCustomerLedgerBalance,
} from '../src/services/ledgerService';

async function main() {
  await connectDB();
  const phone = process.argv[2];
  const nameQuery = process.argv[3];
  const customer = phone
    ? await Customer.findOne({ phone })
    : await Customer.findOne(nameQuery ? { name: new RegExp(nameQuery, 'i') } : { outstandingAmount: { $gt: 0 } });
  if (!customer) {
    console.error('Customer not found');
    process.exit(1);
  }

  console.log('Customer:', customer.name, customer._id.toString());
  console.log('Outstanding:', customer.outstandingAmount, 'Advance:', customer.advanceBalance);
  console.log('Before sync:', await validateCustomerLedgerBalance(customer._id.toString()));

  await syncLedgerRunningBalances(LedgerEntityType.CUSTOMER, customer._id.toString());
  console.log('After sync:', await validateCustomerLedgerBalance(customer._id.toString()));

  const { entries } = await getLedgerView(LedgerEntityType.CUSTOMER, customer._id.toString(), 1, 50, 'asc');
  console.log('\nChronological ledger:');
  for (const e of entries) {
    console.log(
      `${e.createdAt?.toISOString?.() || e.date} | ${e.referenceNumber} | Dr ${e.debit || 0} | Cr ${e.credit || 0} | Bal ${e.runningBalance}`
    );
  }

  await mongoose.disconnect();
}

main();
