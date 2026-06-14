import {
  Customer,
  Supplier,
  Sale,
  SaleStatus,
  Purchase,
  PurchaseStatus,
  LedgerEntry,
  LedgerEntityType,
} from '../models';

const SYNC_TOLERANCE = 0.01;

export type ReconciliationStatus = 'in_sync' | 'out_of_sync';

export interface ReconciliationRow {
  id: string;
  name: string;
  ledgerBalance: number;
  outstanding: number;
  storedOutstanding: number;
  advanceBalance: number;
  difference: number;
  status: ReconciliationStatus;
}

export interface ReconciliationSummary {
  totalAccountsChecked: number;
  accountsInSync: number;
  accountsOutOfSync: number;
  customersChecked: number;
  suppliersChecked: number;
  customersInSync: number;
  customersOutOfSync: number;
  suppliersInSync: number;
  suppliersOutOfSync: number;
  generatedAt: string;
}

export interface ReconciliationReport {
  customers: ReconciliationRow[];
  suppliers: ReconciliationRow[];
  summary: ReconciliationSummary;
}

const roundMoney = (value: number) => Math.round(value * 100) / 100;

const buildRow = (
  id: string,
  name: string,
  ledgerBalance: number,
  invoiceOutstanding: number,
  storedOutstanding: number,
  advanceBalance: number
): ReconciliationRow => {
  const ledger = roundMoney(ledgerBalance);
  const outstanding = roundMoney(invoiceOutstanding);
  const stored = roundMoney(storedOutstanding);
  const advance = roundMoney(advanceBalance);
  const expectedLedger = roundMoney(outstanding - advance);
  const difference = roundMoney(ledger - expectedLedger);
  const ledgerInSync = Math.abs(ledger - roundMoney(stored - advance)) < SYNC_TOLERANCE;
  const invoiceInSync = Math.abs(stored - outstanding) < SYNC_TOLERANCE;
  const status: ReconciliationStatus =
    ledgerInSync && invoiceInSync && Math.abs(difference) < SYNC_TOLERANCE ? 'in_sync' : 'out_of_sync';

  return {
    id,
    name,
    ledgerBalance: ledger,
    outstanding,
    storedOutstanding: stored,
    advanceBalance: advance,
    difference,
    status,
  };
};

const getLedgerBalanceMap = async (entityType: LedgerEntityType): Promise<Map<string, number>> => {
  const rows = await LedgerEntry.aggregate<{ _id: string; ledgerBalance: number }>([
    { $match: { entityType, isVoided: false } },
    { $sort: { entityId: 1, date: -1, createdAt: -1 } },
    { $group: { _id: { $toString: '$entityId' }, ledgerBalance: { $first: '$runningBalance' } } },
  ]);

  return new Map(rows.map((row) => [row._id, row.ledgerBalance ?? 0]));
};

const getCustomerInvoiceOutstandingMap = async (): Promise<Map<string, number>> => {
  const rows = await Sale.aggregate<{ _id: string; outstanding: number }>([
    {
      $match: {
        customer: { $ne: null },
        status: SaleStatus.COMPLETED,
      },
    },
    { $group: { _id: { $toString: '$customer' }, outstanding: { $sum: '$balanceDue' } } },
  ]);

  return new Map(rows.map((row) => [row._id, row.outstanding ?? 0]));
};

const getSupplierInvoiceOutstandingMap = async (): Promise<Map<string, number>> => {
  const rows = await Purchase.aggregate<{ _id: string; outstanding: number }>([
    { $match: { status: { $nin: [PurchaseStatus.CANCELLED] } } },
    {
      $group: {
        _id: { $toString: '$supplier' },
        outstanding: { $sum: { $subtract: ['$total', '$paidAmount'] } },
      },
    },
  ]);

  return new Map(rows.map((row) => [row._id, Math.max(0, row.outstanding ?? 0)]));
};

const buildSummary = (customers: ReconciliationRow[], suppliers: ReconciliationRow[]): ReconciliationSummary => {
  const customersInSync = customers.filter((row) => row.status === 'in_sync').length;
  const suppliersInSync = suppliers.filter((row) => row.status === 'in_sync').length;
  const accountsInSync = customersInSync + suppliersInSync;

  return {
    totalAccountsChecked: customers.length + suppliers.length,
    accountsInSync,
    accountsOutOfSync: customers.length + suppliers.length - accountsInSync,
    customersChecked: customers.length,
    suppliersChecked: suppliers.length,
    customersInSync,
    customersOutOfSync: customers.length - customersInSync,
    suppliersInSync,
    suppliersOutOfSync: suppliers.length - suppliersInSync,
    generatedAt: new Date().toISOString(),
  };
};

export const runReconciliation = async (): Promise<ReconciliationReport> => {
  const [customers, suppliers, customerLedgerMap, supplierLedgerMap, customerInvoiceMap, supplierInvoiceMap] =
    await Promise.all([
      Customer.find().select('name outstandingAmount advanceBalance').sort({ name: 1 }).lean(),
      Supplier.find().select('name outstandingAmount advanceBalance').sort({ name: 1 }).lean(),
      getLedgerBalanceMap(LedgerEntityType.CUSTOMER),
      getLedgerBalanceMap(LedgerEntityType.SUPPLIER),
      getCustomerInvoiceOutstandingMap(),
      getSupplierInvoiceOutstandingMap(),
    ]);

  const customerRows = customers.map((customer) =>
    buildRow(
      String(customer._id),
      customer.name,
      customerLedgerMap.get(String(customer._id)) ?? 0,
      customerInvoiceMap.get(String(customer._id)) ?? 0,
      customer.outstandingAmount ?? 0,
      customer.advanceBalance ?? 0
    )
  );

  const supplierRows = suppliers.map((supplier) =>
    buildRow(
      String(supplier._id),
      supplier.name,
      supplierLedgerMap.get(String(supplier._id)) ?? 0,
      supplierInvoiceMap.get(String(supplier._id)) ?? 0,
      supplier.outstandingAmount ?? 0,
      supplier.advanceBalance ?? 0
    )
  );

  return {
    customers: customerRows,
    suppliers: supplierRows,
    summary: buildSummary(customerRows, supplierRows),
  };
};
