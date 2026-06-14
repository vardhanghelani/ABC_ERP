import { Response } from 'express';
import ExcelJS from 'exceljs';
import { AuthRequest } from '../middleware/auth';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { runReconciliation, ReconciliationRow } from '../services/reconciliationService';

const formatStatus = (status: ReconciliationRow['status']) =>
  status === 'in_sync' ? 'In Sync' : 'Out Of Sync';

const addAccountSheet = (
  workbook: ExcelJS.Workbook,
  sheetName: string,
  rows: ReconciliationRow[]
) => {
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = [
    { header: 'Name', key: 'name', width: 30 },
    { header: 'Ledger Balance', key: 'ledgerBalance', width: 16 },
    { header: 'Outstanding', key: 'outstanding', width: 16 },
    { header: 'Stored Outstanding', key: 'storedOutstanding', width: 18 },
    { header: 'Advance Balance', key: 'advanceBalance', width: 16 },
    { header: 'Difference', key: 'difference', width: 14 },
    { header: 'Status', key: 'status', width: 14 },
  ];

  rows.forEach((row) => {
    sheet.addRow({
      name: row.name,
      ledgerBalance: row.ledgerBalance,
      outstanding: row.outstanding,
      storedOutstanding: row.storedOutstanding,
      advanceBalance: row.advanceBalance,
      difference: row.difference,
      status: formatStatus(row.status),
    });
  });

  sheet.getRow(1).font = { bold: true };
  return sheet;
};

export const getReconciliationReport = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const report = await runReconciliation();
  ApiResponse.success(res, report, 'Reconciliation report generated');
});

export const exportReconciliationReport = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const report = await runReconciliation();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ABC ERP';
  workbook.created = new Date();

  addAccountSheet(workbook, 'Customers', report.customers);
  addAccountSheet(workbook, 'Suppliers', report.suppliers);

  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.columns = [
    { header: 'Metric', key: 'metric', width: 28 },
    { header: 'Value', key: 'value', width: 20 },
  ];
  summarySheet.getRow(1).font = { bold: true };

  const summaryRows = [
    { metric: 'Generated At', value: report.summary.generatedAt },
    { metric: 'Total Accounts Checked', value: report.summary.totalAccountsChecked },
    { metric: 'Accounts In Sync', value: report.summary.accountsInSync },
    { metric: 'Accounts Out Of Sync', value: report.summary.accountsOutOfSync },
    { metric: 'Customers Checked', value: report.summary.customersChecked },
    { metric: 'Customers In Sync', value: report.summary.customersInSync },
    { metric: 'Customers Out Of Sync', value: report.summary.customersOutOfSync },
    { metric: 'Suppliers Checked', value: report.summary.suppliersChecked },
    { metric: 'Suppliers In Sync', value: report.summary.suppliersInSync },
    { metric: 'Suppliers Out Of Sync', value: report.summary.suppliersOutOfSync },
  ];
  summaryRows.forEach((row) => summarySheet.addRow(row));

  const timestamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=accounting-health-check-${timestamp}.xlsx`);
  await workbook.xlsx.write(res);
});
