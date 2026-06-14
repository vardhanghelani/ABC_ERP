import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { connectDB } from '../src/config/database';
import { LedgerEntry, LedgerEntityType } from '../src/models/LedgerEntry';
import { Customer } from '../src/models/Customer';
import { syncLedgerRunningBalances, validateCustomerLedgerBalance } from '../src/services/ledgerService';

async function main() {
  await connectDB();
  const ref = process.argv[2] || 'INV-202606-00005';
  const entry = await LedgerEntry.findOne({ referenceNumber: ref });
  if (!entry) {
    console.log('No entry for', ref);
    process.exit(1);
  }

  const customerId = entry.entityId.toString();
  const customer = await Customer.findById(customerId);
  console.log('Customer:', customer?.name, customer?.phone);
  console.log('Outstanding:', customer?.outstandingAmount, 'Advance:', customer?.advanceBalance);
  console.log('Purchases:', customer?.totalPurchases, 'Payments:', customer?.totalPayments);

  console.log('\nBefore:', await validateCustomerLedgerBalance(customerId));
  await syncLedgerRunningBalances(LedgerEntityType.CUSTOMER, customerId);
  console.log('After:', await validateCustomerLedgerBalance(customerId));

  const entries = await LedgerEntry.find({ entityType: LedgerEntityType.CUSTOMER, entityId: customerId, isVoided: false })
    .sort({ createdAt: 1 });

  console.log('\nChronological ledger:');
  for (const e of entries) {
    console.log(
      `${e.createdAt.toISOString()} | ${e.referenceNumber.padEnd(20)} | Dr ${String(e.debit || 0).padStart(7)} | Cr ${String(e.credit || 0).padStart(7)} | Bal ${e.runningBalance}`
    );
  }

  await mongoose.disconnect();
}

main();
