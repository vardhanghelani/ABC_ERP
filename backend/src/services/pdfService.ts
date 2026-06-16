import { ISale } from '../models/Sale';
import {
  PORTRAIT_A4,
  PDF_THEME,
  amountInWords,
  createPdfBuffer,
  drawPdfClosingNote,
  drawPdfInfoBox,
  drawPdfKeyValueTable,
  drawPdfPageFooter,
  drawPdfReportHeader,
  drawPdfTableRow,
  drawPdfTableSummaryRow,
  formatPdfDate,
  formatPdfMoney,
  paymentLabel,
  resolveCompanyName,
  type PdfTableColumn,
} from './pdf/pdfLayout';

const layout = PORTRAIT_A4;
const FOOTER_Y = layout.footerY;
export const generateInvoicePDF = (
  sale: ISale,
  companyInfo: Record<string, string>,
  customerInfo?: { name?: string; phone?: string; address?: string; gstNumber?: string }
): Promise<Buffer> => {
  const itemColumns: PdfTableColumn[] = [
    { label: '#', width: 26, align: 'center' },
    { label: 'SKU', width: 68, align: 'left' },
    { label: 'Description', width: 162, align: 'left' },
    { label: 'Qty', width: 36, align: 'center' },
    { label: 'Rate (Rs.)', width: 72, align: 'right' },
    { label: 'Disc. (Rs.)', width: 58, align: 'right' },
    { label: 'Amount (Rs.)', width: layout.contentWidth - 26 - 68 - 162 - 36 - 72 - 58, align: 'right' },
  ];

  return createPdfBuffer(layout, (doc) => {
    const companyName = resolveCompanyName(companyInfo);
    const createdAt = (sale as ISale & { createdAt?: Date }).createdAt;
    let pageNumber = 1;

    const header = drawPdfReportHeader(doc, layout, companyInfo, 'INVOICE', 'Original for Recipient');
    let y = header.y;

    const boxWidth = (layout.contentWidth - 10) / 2;
    const customerName = customerInfo?.name || sale.customerName || 'Walk-in Customer';
    const billToLines = [customerName];
    if (customerInfo?.phone) billToLines.push(`Phone: ${customerInfo.phone}`);
    if (customerInfo?.address) billToLines.push(customerInfo.address);
    if (customerInfo?.gstNumber) billToLines.push(`GSTIN: ${customerInfo.gstNumber}`);

    const invoiceLines = [
      `Invoice No.: ${sale.invoiceNumber}`,
      `Invoice Date: ${formatPdfDate(createdAt)}`,
      `Status: ${sale.status.charAt(0).toUpperCase() + sale.status.slice(1)}`,
    ];
    if (sale.dueDate) invoiceLines.push(`Due Date: ${formatPdfDate(sale.dueDate)}`);

    const leftH = drawPdfInfoBox(doc, layout, layout.margin, y, boxWidth, 'Bill To', billToLines);
    const rightH = drawPdfInfoBox(doc, layout, layout.margin + boxWidth + 10, y, boxWidth, 'Invoice Details', invoiceLines);
    y += Math.max(leftH, rightH) + 14;

    const drawItemsHeader = () => {
      y = drawPdfTableRow(doc, layout, y, itemColumns, itemColumns.map((c) => c.label), { header: true });
    };
    drawItemsHeader();

    sale.items.forEach((item, index) => {
      if (y > FOOTER_Y - 120) {
        drawPdfPageFooter(doc, layout, pageNumber, `${companyName} — Invoice ${sale.invoiceNumber}`);
        doc.addPage({ size: [layout.pageWidth, layout.pageHeight], margin: layout.margin });
        pageNumber += 1;
        y = layout.margin;
        drawItemsHeader();
      }
      const rowHeight = item.productName.length > 32 ? 28 : layout.rowHeight;
      y = drawPdfTableRow(
        doc,
        layout,
        y,
        itemColumns,
        [
          String(index + 1),
          item.sku,
          item.productName,
          String(item.quantity),
          formatPdfMoney(item.unitPrice),
          item.discount > 0 ? formatPdfMoney(item.discount) : '-',
          formatPdfMoney(item.total),
        ],
        { height: rowHeight }
      );
    });

    y = drawPdfTableSummaryRow(doc, layout, y, itemColumns, 'Subtotal', formatPdfMoney(sale.subtotal));
    y = drawPdfTableSummaryRow(doc, layout, y, itemColumns, 'Discount', formatPdfMoney(sale.discount));
    y = drawPdfTableSummaryRow(doc, layout, y, itemColumns, 'Round Off', formatPdfMoney(sale.roundOff));
    y = drawPdfTableSummaryRow(doc, layout, y, itemColumns, 'Grand Total', formatPdfMoney(sale.total), {
      bold: true,
      fill: PDF_THEME.headerBg,
    });
    y += 10;

    const wordsHeight = 28;
    doc.save().fillColor(PDF_THEME.subtleFill).rect(layout.margin, y, layout.contentWidth, wordsHeight).fill().restore();
    doc.save().strokeColor(PDF_THEME.border).lineWidth(0.6).rect(layout.margin, y, layout.contentWidth, wordsHeight).stroke().restore();
    doc.font('Helvetica-Bold').fontSize(8).fillColor(PDF_THEME.text).text('Amount in Words:', layout.margin + 8, y + 10);
    doc.font('Helvetica').fontSize(8).fillColor(PDF_THEME.muted)
      .text(amountInWords(sale.total), layout.margin + 92, y + 10, { width: layout.contentWidth - 100 });
    y += wordsHeight + 10;

    const paymentRows: { label: string; value: string; bold?: boolean }[] = [];
    if (sale.payments?.length) {
      sale.payments.forEach((p) => {
        paymentRows.push({
          label: paymentLabel(p.method) + (p.reference ? ` (Ref: ${p.reference})` : ''),
          value: formatPdfMoney(p.amount),
        });
      });
    }
    paymentRows.push({ label: 'Total Paid', value: formatPdfMoney(sale.paidAmount), bold: true });
    if (sale.balanceDue > 0) paymentRows.push({ label: 'Balance Due', value: formatPdfMoney(sale.balanceDue), bold: true });
    if (sale.changeAmount > 0) paymentRows.push({ label: 'Change Returned', value: formatPdfMoney(sale.changeAmount) });

    if (paymentRows.length) y = drawPdfKeyValueTable(doc, layout, y, 'Payment Summary', paymentRows);

    if (sale.notes) {
      const notesHeight = 36;
      doc.save().fillColor(PDF_THEME.subtleFill).rect(layout.margin, y, layout.contentWidth, notesHeight).fill().restore();
      doc.save().strokeColor(PDF_THEME.border).lineWidth(0.6).rect(layout.margin, y, layout.contentWidth, notesHeight).stroke().restore();
      doc.font('Helvetica-Bold').fontSize(8).fillColor(PDF_THEME.text).text('Notes:', layout.margin + 8, y + 8);
      doc.font('Helvetica').fontSize(8).fillColor(PDF_THEME.muted)
        .text(sale.notes, layout.margin + 48, y + 8, { width: layout.contentWidth - 56 });
      y += notesHeight + 8;
    }

    drawPdfClosingNote(doc, layout, FOOTER_Y - 8, 'Thank you for your business!');
    drawPdfPageFooter(
      doc,
      layout,
      pageNumber,
      `${companyName} — Invoice ${sale.invoiceNumber} — computer-generated, no signature required`
    );
  });
};
