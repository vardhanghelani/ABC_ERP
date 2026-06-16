import { getAgingReport, getOutstandingReport } from '../ledgerService';
import { LedgerEntityType } from '../../models';
import {
  PORTRAIT_A4,
  createPdfBuffer,
  drawPdfClosingNote,
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

const customerColumns: PdfTableColumn[] = [
  { label: 'Customer', width: 130, align: 'left' },
  { label: 'Phone', width: 72, align: 'left' },
  { label: 'Net Outstanding', width: 82, align: 'right' },
  { label: 'Credit Limit', width: 72, align: 'right' },
  { label: 'Usage %', width: 48, align: 'center' },
  { label: 'Risk', width: layout.contentWidth - 130 - 72 - 82 - 72 - 48, align: 'center' },
];

const invoiceColumns: PdfTableColumn[] = [
  { label: 'Invoice No.', width: 88, align: 'left' },
  { label: 'Customer', width: 130, align: 'left' },
  { label: 'Due Date', width: 72, align: 'left' },
  { label: 'Balance Due', width: 78, align: 'right' },
  { label: 'Days Overdue', width: layout.contentWidth - 88 - 130 - 72 - 78, align: 'center' },
];

const agingColumns: PdfTableColumn[] = [
  { label: 'Age Bucket', width: layout.contentWidth * 0.45, align: 'left' },
  { label: 'Amount', width: layout.contentWidth * 0.35, align: 'right' },
  { label: 'Accounts', width: layout.contentWidth * 0.2, align: 'center' },
];

export async function generateCreditReportPDF(companyInfo: Record<string, string>): Promise<Buffer> {
  const [outstanding, aging] = await Promise.all([
    getOutstandingReport(),
    getAgingReport(LedgerEntityType.CUSTOMER),
  ]);
  const generatedAt = new Date();

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
      'CREDIT & RECEIVABLES REPORT',
      `Generated: ${formatPdfDateTime(generatedAt)}`
    );
    footerLabel = `${header.companyName} — Credit & Receivables Report`;
    let y = header.y;

    y = drawPdfSummaryStrip(doc, layout, y, [
      { label: 'Total Net Receivables', value: formatPdfMoney(outstanding.totalReceivables) },
      { label: 'Total Overdue', value: formatPdfMoney(outstanding.totalOverdue) },
      { label: 'Customers with Dues', value: String(outstanding.customerWise.length) },
      { label: 'Open Invoices', value: String(outstanding.invoiceWise.length) },
    ]);

    const drawTableHeader = (columns: PdfTableColumn[]) =>
      drawPdfTableRow(doc, layout, y, columns, columns.map((c) => c.label), { header: true, height: 24 });

    ensureSpace(60);
    y = drawPdfSectionBand(doc, layout, y, `Customer Net Outstanding (${outstanding.customerWise.length})`);
    y = drawTableHeader(customerColumns);

    outstanding.customerWise.forEach((customer) => {
      const usage =
        customer.creditLimit > 0
          ? `${Math.min(999, (customer.netOutstanding / customer.creditLimit) * 100).toFixed(0)}%`
          : '—';
      const values = [
        customer.name,
        customer.phone || '—',
        formatPdfMoney(customer.netOutstanding),
        formatPdfMoney(customer.creditLimit),
        usage,
        humanizeToken(String(customer.riskCategory || 'normal')),
      ];
      const rowHeight = measurePdfRowHeight(doc, layout, customerColumns, values, layout.rowHeight);
      ensureSpace(rowHeight + 4, () => {
        y = layout.margin;
        y = drawPdfSectionBand(doc, layout, y, `Customer Net Outstanding (continued)`);
        y = drawTableHeader(customerColumns);
      });
      y = drawPdfTableRow(doc, layout, y, customerColumns, values, { height: rowHeight, wrap: true });
    });
    y += 12;

    ensureSpace(60);
    y = drawPdfSectionBand(doc, layout, y, `Invoice-wise Outstanding (${outstanding.invoiceWise.length})`);
    y = drawTableHeader(invoiceColumns);

    outstanding.invoiceWise.forEach((invoice) => {
      const customerName =
        invoice.customer && typeof invoice.customer === 'object'
          ? (invoice.customer as { name?: string }).name || '—'
          : '—';
      const values = [
        invoice.invoiceNumber,
        customerName,
        formatPdfDate(invoice.dueDate),
        formatPdfMoney(invoice.balanceDue),
        invoice.daysOverdue > 0 ? String(invoice.daysOverdue) : '—',
      ];
      const rowHeight = measurePdfRowHeight(doc, layout, invoiceColumns, values, layout.rowHeight);
      ensureSpace(rowHeight + 4, () => {
        y = layout.margin;
        y = drawPdfSectionBand(doc, layout, y, `Invoice-wise Outstanding (continued)`);
        y = drawTableHeader(invoiceColumns);
      });
      y = drawPdfTableRow(doc, layout, y, invoiceColumns, values, { height: rowHeight, wrap: true });
    });
    y += 12;

    ensureSpace(60);
    y = drawPdfSectionBand(doc, layout, y, 'Aging Analysis');
    y = drawTableHeader(agingColumns);
    aging.buckets.forEach((bucket) => {
      y = drawPdfTableRow(doc, layout, y, agingColumns, [
        bucket.label,
        formatPdfMoney(bucket.amount),
        String(bucket.count),
      ]);
    });

    ensureSpace(30);
    y = drawPdfClosingNote(
      doc,
      layout,
      y,
      'Net outstanding = gross outstanding minus advance balance. This is a system-generated receivables report.'
    );
    drawPdfPageFooter(doc, layout, pageNumber, footerLabel);
  });
}
