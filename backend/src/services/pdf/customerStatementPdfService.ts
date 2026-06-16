import PDFDocument from 'pdfkit';
import { getCustomerSummary, getLedgerView } from '../ledgerService';
import { LedgerEntityType } from '../../models';
import {
  PORTRAIT_A4,
  PDF_THEME,
  createPdfBuffer,
  drawPdfClosingNote,
  drawPdfInfoBox,
  drawPdfKeyValueTable,
  drawPdfPageFooter,
  drawPdfReportHeader,
  drawPdfSectionBand,
  drawPdfSummaryStrip,
  drawPdfTableRow,
  formatPdfDate,
  formatPdfDateTime,
  formatPdfMoney,
  humanizeToken,
  measurePdfRowHeight,
  type PdfTableColumn,
} from './pdfLayout';

const layout = PORTRAIT_A4;

const ledgerColumns: PdfTableColumn[] = [
  { label: '#', width: 24, align: 'center' },
  { label: 'Date', width: 62, align: 'left' },
  { label: 'Reference', width: 72, align: 'left' },
  { label: 'Type', width: 78, align: 'left' },
  { label: 'Remarks', width: layout.contentWidth - 24 - 62 - 72 - 78 - 58 - 58 - 68, align: 'left' },
  { label: 'Debit (Rs.)', width: 58, align: 'right' },
  { label: 'Credit (Rs.)', width: 58, align: 'right' },
  { label: 'Balance (Rs.)', width: 68, align: 'right' },
];

const invoiceColumns: PdfTableColumn[] = [
  { label: 'Invoice No.', width: 88, align: 'left' },
  { label: 'Invoice Date', width: 72, align: 'left' },
  { label: 'Due Date', width: 72, align: 'left' },
  { label: 'Invoice Total', width: 78, align: 'right' },
  { label: 'Balance Due', width: 78, align: 'right' },
  { label: 'Days Overdue', width: layout.contentWidth - 88 - 72 - 72 - 78 - 78, align: 'center' },
];

function moneyOrDash(amount: number): string {
  return amount > 0 ? formatPdfMoney(amount) : '—';
}

export async function generateCustomerStatementPDF(
  customerId: string,
  companyInfo: Record<string, string>
): Promise<Buffer> {
  const summary = await getCustomerSummary(customerId);
  const { entries } = await getLedgerView(LedgerEntityType.CUSTOMER, customerId, 1, 1000, 'asc');
  const generatedAt = new Date();
  const customer = summary.customer;

  return createPdfBuffer(layout, (doc) => {
    let pageNumber = 1;
    let footerLabel = '';

    const ensureSpace = (needed: number, onNewPage?: () => void) => {
      if (y + needed <= layout.footerY) return;
      drawPdfPageFooter(doc, layout, pageNumber, footerLabel);
      doc.addPage({ size: [layout.pageWidth, layout.pageHeight], margin: layout.margin });
      pageNumber += 1;
      onNewPage?.();
    };

    const header = drawPdfReportHeader(
      doc,
      layout,
      companyInfo,
      'CUSTOMER ACCOUNT STATEMENT',
      `Statement Date: ${formatPdfDateTime(generatedAt)}`
    );
    footerLabel = `${header.companyName} — Customer Statement (${customer.name})`;
    let y = header.y;

    y = drawPdfSummaryStrip(doc, layout, y, [
      { label: 'Net Outstanding', value: formatPdfMoney(summary.amountDue) },
      { label: 'Advance Balance', value: formatPdfMoney(summary.advanceBalance) },
      { label: 'Credit Limit', value: formatPdfMoney(summary.creditLimit) },
      { label: 'Available Credit', value: formatPdfMoney(summary.availableCredit) },
      { label: 'Overdue Amount', value: formatPdfMoney(summary.overdueAmount) },
    ]);

    const boxWidth = (layout.contentWidth - 10) / 2;
    const customerLines = [
      customer.name,
      customer.phone ? `Phone: ${customer.phone}` : '',
      customer.email ? `Email: ${customer.email}` : '',
      customer.address ? customer.address : '',
      customer.gstNumber ? `GSTIN: ${customer.gstNumber}` : '',
      `Account Type: ${summary.creditTermLabel}`,
    ].filter(Boolean);

    const accountLines = [
      `Gross Outstanding: ${formatPdfMoney(summary.currentOutstanding)}`,
      `Net Amount Due: ${formatPdfMoney(summary.amountDue)}`,
      `Total Purchases: ${formatPdfMoney(summary.totalPurchases)}`,
      `Total Payments: ${formatPdfMoney(summary.totalPayments)}`,
      `Pending Invoices: ${summary.pendingInvoices}`,
      `Risk Category: ${humanizeToken(String(summary.riskCategory || 'normal'))}`,
    ];

    const leftH = drawPdfInfoBox(doc, layout, layout.margin, y, boxWidth, 'Customer Details', customerLines);
    const rightH = drawPdfInfoBox(doc, layout, layout.margin + boxWidth + 10, y, boxWidth, 'Account Summary', accountLines);
    y += Math.max(leftH, rightH) + 12;

    y = drawPdfKeyValueTable(doc, layout, y, 'Financial Position', [
      { label: 'Net Outstanding (Amount Due)', value: formatPdfMoney(summary.amountDue), bold: true },
      { label: 'Gross Outstanding', value: formatPdfMoney(summary.currentOutstanding) },
      { label: 'Advance Balance', value: formatPdfMoney(summary.advanceBalance) },
      { label: 'Overdue Amount', value: formatPdfMoney(summary.overdueAmount) },
      { label: 'Available Credit', value: formatPdfMoney(summary.availableCredit) },
      { label: 'Credit Usage', value: `${summary.creditUsagePercent.toFixed(1)}%` },
    ]);

    if (summary.pendingInvoiceList.length > 0) {
      ensureSpace(60);
      y = drawPdfSectionBand(doc, layout, y, `Pending Invoices (${summary.pendingInvoiceList.length})`);
      y = drawPdfTableRow(
        doc,
        layout,
        y,
        invoiceColumns,
        invoiceColumns.map((col) => col.label),
        { header: true, height: 24 }
      );

      summary.pendingInvoiceList.forEach((invoice) => {
        const values = [
          invoice.invoiceNumber,
          formatPdfDate(invoice.createdAt),
          formatPdfDate(invoice.dueDate),
          formatPdfMoney(invoice.total),
          formatPdfMoney(invoice.balanceDue),
          invoice.daysOverdue > 0 ? String(invoice.daysOverdue) : '—',
        ];
        const rowHeight = measurePdfRowHeight(doc, layout, invoiceColumns, values, layout.rowHeight);
        ensureSpace(rowHeight + 4, () => {
          y = layout.margin;
          y = drawPdfTableRow(
            doc,
            layout,
            y,
            invoiceColumns,
            invoiceColumns.map((col) => col.label),
            { header: true, height: 24 }
          );
        });
        y = drawPdfTableRow(doc, layout, y, invoiceColumns, values, { height: rowHeight, wrap: true });
      });
      y += 10;
    }

    ensureSpace(60);
    y = drawPdfSectionBand(doc, layout, y, `Ledger Passbook (${entries.length} entries)`);
    const drawLedgerHeader = () => {
      y = drawPdfTableRow(
        doc,
        layout,
        y,
        ledgerColumns,
        ledgerColumns.map((col) => col.label),
        { header: true, height: 24 }
      );
    };
    drawLedgerHeader();

    entries.forEach((entry, index) => {
      const values = [
        String(index + 1),
        formatPdfDate(entry.date),
        entry.referenceNumber || '—',
        humanizeToken(entry.transactionType),
        entry.remarks || '—',
        moneyOrDash(entry.debit || 0),
        moneyOrDash(entry.credit || 0),
        formatPdfMoney(entry.runningBalance),
      ];
      const rowHeight = measurePdfRowHeight(doc, layout, ledgerColumns, values, layout.rowHeight);
      ensureSpace(rowHeight + 4, () => {
        y = layout.margin;
        drawLedgerHeader();
      });
      y = drawPdfTableRow(doc, layout, y, ledgerColumns, values, { height: rowHeight, wrap: true });
    });

    if (entries.length > 0) {
      const closingBalance = entries[entries.length - 1].runningBalance;
      ensureSpace(layout.rowHeight + 8);
      y = drawPdfTableRow(
        doc,
        layout,
        y,
        ledgerColumns,
        ['', '', '', 'Closing Balance', '', '', '', formatPdfMoney(closingBalance)],
        { fill: PDF_THEME.subtotalFill, boldLast: true }
      );
    } else {
      ensureSpace(40);
      doc.font('Helvetica').fontSize(9).fillColor(PDF_THEME.muted).text('No ledger entries recorded yet.', layout.margin, y + 8, {
        width: layout.contentWidth,
        align: 'center',
      });
      y += 28;
    }

    ensureSpace(30);
    y = drawPdfClosingNote(
      doc,
      layout,
      y,
      'This is a computer-generated account statement. Please verify entries and contact us for any discrepancy within 7 days.'
    );
    drawPdfPageFooter(doc, layout, pageNumber, footerLabel);
  });
}

/** Backward-compatible alias */
export const generateStatementPDF = generateCustomerStatementPDF;
