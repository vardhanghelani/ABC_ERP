import PDFDocument from 'pdfkit';
import { ISale } from '../models/Sale';

const MARGIN = 45;
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const ROW_HEIGHT = 22;
const HEADER_BG = '#eef2f7';
const BORDER_COLOR = '#1f2937';
const MUTED_TEXT = '#4b5563';
const FOOTER_Y = PAGE_HEIGHT - MARGIN - 36;

type TextAlign = 'left' | 'center' | 'right';

interface TableColumn {
  label: string;
  width: number;
  align: TextAlign;
}

/** Helvetica does not render the Rupee glyph — use Rs. for reliable PDF output */
function formatMoney(amount: number): string {
  const formatted = Number(amount || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `Rs. ${formatted}`;
}

function formatDateIN(date: Date | string | undefined): string {
  if (!date) return '-';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date));
}

function paymentLabel(method: string): string {
  const labels: Record<string, string> = {
    cash: 'Cash',
    upi: 'UPI',
    bank: 'Bank Transfer',
    credit: 'Credit',
    card: 'Card',
    cheque: 'Cheque',
    credit_adjustment: 'Credit Adjustment',
  };
  return labels[method] || method.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function amountInWords(num: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const below1000 = (n: number): string => {
    if (n === 0) return '';
    if (n < 20) return ones[n];
    if (n < 100) return `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ''}`.trim();
    return `${ones[Math.floor(n / 100)]} Hundred${n % 100 ? ` ${below1000(n % 100)}` : ''}`.trim();
  };

  const convert = (n: number): string => {
    if (n === 0) return 'Zero';
    const crore = Math.floor(n / 10000000);
    const lakh = Math.floor((n % 10000000) / 100000);
    const thousand = Math.floor((n % 100000) / 1000);
    const rest = n % 1000;
    const parts: string[] = [];
    if (crore) parts.push(`${below1000(crore)} Crore`);
    if (lakh) parts.push(`${below1000(lakh)} Lakh`);
    if (thousand) parts.push(`${below1000(thousand)} Thousand`);
    if (rest) parts.push(below1000(rest));
    return parts.join(' ');
  };

  const rupees = Math.floor(Math.abs(num));
  const paise = Math.round((Math.abs(num) - rupees) * 100);
  let words = `Rupees ${convert(rupees)}`;
  if (paise > 0) words += ` and ${convert(paise)} Paise`;
  return `${words} Only`;
}

function columnOffsets(columns: TableColumn[]): number[] {
  const offsets = [MARGIN];
  let x = MARGIN;
  columns.forEach((col) => {
    x += col.width;
    offsets.push(x);
  });
  return offsets;
}

function drawCellText(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  align: TextAlign,
  bold = false
): void {
  const padding = 5;
  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor('#111827');
  const textY = y + Math.max(4, (height - 9) / 2);
  doc.text(text, x + padding, textY, {
    width: width - padding * 2,
    align,
    lineBreak: false,
  });
}

function drawTableRow(
  doc: PDFKit.PDFDocument,
  y: number,
  columns: TableColumn[],
  values: string[],
  options: { header?: boolean; height?: number; boldLast?: boolean } = {}
): number {
  const height = options.height ?? ROW_HEIGHT;
  const startX = MARGIN;
  const offsets = columnOffsets(columns);

  if (options.header) {
    doc.save().fillColor(HEADER_BG).rect(startX, y, CONTENT_WIDTH, height).fill().restore();
  }

  doc.save().strokeColor(BORDER_COLOR).lineWidth(0.6).rect(startX, y, CONTENT_WIDTH, height).stroke().restore();

  columns.forEach((col, i) => {
    if (i > 0) {
      doc.save().strokeColor(BORDER_COLOR).lineWidth(0.6)
        .moveTo(offsets[i], y).lineTo(offsets[i], y + height).stroke().restore();
    }
    const bold = options.boldLast && i === columns.length - 1;
    drawCellText(doc, values[i] ?? '', offsets[i], y, col.width, height, col.align, bold || (options.header ?? false));
  });

  return y + height;
}

/** Summary row aligned to the items table — label in Disc. col, value in Amount col */
function drawTableSummaryRow(
  doc: PDFKit.PDFDocument,
  y: number,
  columns: TableColumn[],
  label: string,
  value: string,
  options: { bold?: boolean; fill?: string } = {}
): number {
  const height = ROW_HEIGHT;
  const startX = MARGIN;
  const offsets = columnOffsets(columns);
  const labelColIndex = columns.length - 2;
  const valueColIndex = columns.length - 1;

  if (options.fill) {
    doc.save().fillColor(options.fill).rect(startX, y, CONTENT_WIDTH, height).fill().restore();
  }

  doc.save().strokeColor(BORDER_COLOR).lineWidth(0.6).rect(startX, y, CONTENT_WIDTH, height).stroke().restore();
  offsets.slice(1).forEach((xPos) => {
    doc.save().strokeColor(BORDER_COLOR).lineWidth(0.6)
      .moveTo(xPos, y).lineTo(xPos, y + height).stroke().restore();
  });

  drawCellText(doc, label, offsets[labelColIndex], y, columns[labelColIndex].width, height, 'right', options.bold ?? false);
  drawCellText(doc, value, offsets[valueColIndex], y, columns[valueColIndex].width, height, 'right', options.bold ?? false);

  return y + height;
}

function drawInfoBox(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  title: string,
  lines: string[]
): number {
  const padding = 10;
  const lineHeight = 13;
  const blockHeight = padding * 2 + 16 + lines.length * lineHeight;

  doc.save().fillColor('#fafafa').rect(x, y, width, blockHeight).fill().restore();
  doc.save().strokeColor(BORDER_COLOR).lineWidth(0.6).rect(x, y, width, blockHeight).stroke().restore();
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#111827').text(title.toUpperCase(), x + padding, y + padding);
  doc.font('Helvetica').fontSize(8).fillColor(MUTED_TEXT);
  lines.forEach((line, i) => {
    doc.text(line, x + padding, y + padding + 16 + i * lineHeight, { width: width - padding * 2 });
  });

  return blockHeight;
}

function drawKeyValueTable(
  doc: PDFKit.PDFDocument,
  y: number,
  title: string,
  rows: { label: string; value: string; bold?: boolean }[]
): number {
  const tableWidth = CONTENT_WIDTH;
  const labelWidth = tableWidth * 0.32;
  const valueWidth = tableWidth - labelWidth;
  const headerHeight = 20;
  const rowHeight = 18;

  doc.save().fillColor(HEADER_BG).rect(MARGIN, y, tableWidth, headerHeight).fill().restore();
  doc.save().strokeColor(BORDER_COLOR).lineWidth(0.6).rect(MARGIN, y, tableWidth, headerHeight).stroke().restore();
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#111827')
    .text(title.toUpperCase(), MARGIN + 8, y + 6, { width: tableWidth - 16 });

  let currentY = y + headerHeight;
  rows.forEach((row) => {
    doc.save().strokeColor(BORDER_COLOR).lineWidth(0.6)
      .rect(MARGIN, currentY, tableWidth, rowHeight).stroke().restore();
    doc.save().strokeColor(BORDER_COLOR).lineWidth(0.6)
      .moveTo(MARGIN + labelWidth, currentY).lineTo(MARGIN + labelWidth, currentY + rowHeight).stroke().restore();

    drawCellText(doc, row.label, MARGIN, currentY, labelWidth, rowHeight, 'left', row.bold ?? false);
    drawCellText(doc, row.value, MARGIN + labelWidth, currentY, valueWidth, rowHeight, 'right', row.bold ?? false);
    currentY += rowHeight;
  });

  return currentY + 8;
}

export const generateInvoicePDF = (
  sale: ISale,
  companyInfo: Record<string, string>,
  customerInfo?: { name?: string; phone?: string; address?: string; gstNumber?: string }
): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: MARGIN, size: 'A4' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const rawCompanyName = String(companyInfo.company_name || '').trim();
      const companyName =
        !rawCompanyName || rawCompanyName === 'Jewellery Raw Material ERP' ? 'ABC SALES' : rawCompanyName;

      const itemColumns: TableColumn[] = [
        { label: '#', width: 26, align: 'center' },
        { label: 'SKU', width: 68, align: 'left' },
        { label: 'Description', width: 162, align: 'left' },
        { label: 'Qty', width: 36, align: 'center' },
        { label: 'Rate (Rs.)', width: 72, align: 'right' },
        { label: 'Disc. (Rs.)', width: 58, align: 'right' },
        { label: 'Amount (Rs.)', width: CONTENT_WIDTH - 26 - 68 - 162 - 36 - 72 - 58, align: 'right' },
      ];

      const createdAt = (sale as ISale & { createdAt?: Date }).createdAt;

      // ── Header band ──
      doc.save().fillColor(HEADER_BG).rect(MARGIN, MARGIN, CONTENT_WIDTH, 78).fill().restore();
      doc.save().strokeColor(BORDER_COLOR).lineWidth(0.8).rect(MARGIN, MARGIN, CONTENT_WIDTH, 78).stroke().restore();

      doc.font('Helvetica-Bold').fontSize(17).fillColor('#111827')
        .text(companyName, MARGIN + 14, MARGIN + 12, { width: CONTENT_WIDTH * 0.62 });
      doc.font('Helvetica-Bold').fontSize(14).fillColor('#111827')
        .text('INVOICE', MARGIN + CONTENT_WIDTH * 0.62, MARGIN + 14, { width: CONTENT_WIDTH * 0.36 - 14, align: 'right' });

      doc.font('Helvetica').fontSize(8).fillColor(MUTED_TEXT);
      let headerY = MARGIN + 36;
      if (companyInfo.company_address) {
        doc.text(companyInfo.company_address, MARGIN + 14, headerY, { width: CONTENT_WIDTH * 0.62 });
        headerY = doc.y + 2;
      }
      const meta: string[] = [];
      if (companyInfo.company_gst) meta.push(`GSTIN: ${companyInfo.company_gst}`);
      if (companyInfo.company_phone) meta.push(`Tel: ${companyInfo.company_phone}`);
      if (meta.length) doc.text(meta.join('   |   '), MARGIN + 14, headerY, { width: CONTENT_WIDTH * 0.62 });

      doc.font('Helvetica').fontSize(8).fillColor(MUTED_TEXT)
        .text(`Original for Recipient`, MARGIN + CONTENT_WIDTH * 0.62, MARGIN + 38, {
          width: CONTENT_WIDTH * 0.36 - 14,
          align: 'right',
        });

      let y = MARGIN + 92;

      // ── Bill To / Invoice meta ──
      const boxWidth = (CONTENT_WIDTH - 10) / 2;
      const customerName = customerInfo?.name || sale.customerName || 'Walk-in Customer';
      const billToLines = [customerName];
      if (customerInfo?.phone) billToLines.push(`Phone: ${customerInfo.phone}`);
      if (customerInfo?.address) billToLines.push(customerInfo.address);
      if (customerInfo?.gstNumber) billToLines.push(`GSTIN: ${customerInfo.gstNumber}`);

      const invoiceLines = [
        `Invoice No.: ${sale.invoiceNumber}`,
        `Invoice Date: ${formatDateIN(createdAt)}`,
        `Status: ${sale.status.charAt(0).toUpperCase() + sale.status.slice(1)}`,
      ];
      if (sale.dueDate) invoiceLines.push(`Due Date: ${formatDateIN(sale.dueDate)}`);

      const leftH = drawInfoBox(doc, MARGIN, y, boxWidth, 'Bill To', billToLines);
      const rightH = drawInfoBox(doc, MARGIN + boxWidth + 10, y, boxWidth, 'Invoice Details', invoiceLines);
      y += Math.max(leftH, rightH) + 14;

      // ── Items table ──
      y = drawTableRow(doc, y, itemColumns, itemColumns.map((c) => c.label), { header: true });

      sale.items.forEach((item, index) => {
        if (y > FOOTER_Y - 120) {
          doc.addPage();
          y = MARGIN;
          y = drawTableRow(doc, y, itemColumns, itemColumns.map((c) => c.label), { header: true });
        }
        const rowHeight = item.productName.length > 32 ? 28 : ROW_HEIGHT;
        y = drawTableRow(
          doc,
          y,
          itemColumns,
          [
            String(index + 1),
            item.sku,
            item.productName,
            String(item.quantity),
            formatMoney(item.unitPrice),
            item.discount > 0 ? formatMoney(item.discount) : '-',
            formatMoney(item.total),
          ],
          { height: rowHeight }
        );
      });

      // ── Totals — continuation of items table (aligned columns) ──
      y = drawTableSummaryRow(doc, y, itemColumns, 'Subtotal', formatMoney(sale.subtotal));
      y = drawTableSummaryRow(doc, y, itemColumns, 'Discount', formatMoney(sale.discount));
      y = drawTableSummaryRow(doc, y, itemColumns, 'Round Off', formatMoney(sale.roundOff));
      y = drawTableSummaryRow(doc, y, itemColumns, 'Grand Total', formatMoney(sale.total), {
        bold: true,
        fill: HEADER_BG,
      });

      y += 10;

      // ── Amount in words (full-width bordered row) ──
      const wordsHeight = 28;
      doc.save().fillColor('#fafafa').rect(MARGIN, y, CONTENT_WIDTH, wordsHeight).fill().restore();
      doc.save().strokeColor(BORDER_COLOR).lineWidth(0.6).rect(MARGIN, y, CONTENT_WIDTH, wordsHeight).stroke().restore();
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#111827').text('Amount in Words:', MARGIN + 8, y + 10);
      doc.font('Helvetica').fontSize(8).fillColor(MUTED_TEXT)
        .text(amountInWords(sale.total), MARGIN + 92, y + 10, { width: CONTENT_WIDTH - 100 });
      y += wordsHeight + 10;

      // ── Payment summary table ──
      const paymentRows: { label: string; value: string; bold?: boolean }[] = [];
      if (sale.payments?.length) {
        sale.payments.forEach((p) => {
          paymentRows.push({
            label: paymentLabel(p.method) + (p.reference ? ` (Ref: ${p.reference})` : ''),
            value: formatMoney(p.amount),
          });
        });
      }
      paymentRows.push({ label: 'Total Paid', value: formatMoney(sale.paidAmount), bold: true });
      if (sale.balanceDue > 0) {
        paymentRows.push({ label: 'Balance Due', value: formatMoney(sale.balanceDue), bold: true });
      }
      if (sale.changeAmount > 0) {
        paymentRows.push({ label: 'Change Returned', value: formatMoney(sale.changeAmount) });
      }

      if (paymentRows.length) {
        y = drawKeyValueTable(doc, y, 'Payment Summary', paymentRows);
      }

      if (sale.notes) {
        const notesHeight = 36;
        doc.save().fillColor('#fafafa').rect(MARGIN, y, CONTENT_WIDTH, notesHeight).fill().restore();
        doc.save().strokeColor(BORDER_COLOR).lineWidth(0.6).rect(MARGIN, y, CONTENT_WIDTH, notesHeight).stroke().restore();
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#111827').text('Notes:', MARGIN + 8, y + 8);
        doc.font('Helvetica').fontSize(8).fillColor(MUTED_TEXT)
          .text(sale.notes, MARGIN + 48, y + 8, { width: CONTENT_WIDTH - 56 });
        y += notesHeight + 8;
      }

      // ── Footer ──
      doc.save().strokeColor('#cbd5e1').lineWidth(0.5)
        .moveTo(MARGIN, FOOTER_Y).lineTo(MARGIN + CONTENT_WIDTH, FOOTER_Y).stroke().restore();
      doc.font('Helvetica').fontSize(7).fillColor('#6b7280')
        .text(
          'This is a computer-generated invoice and does not require a physical signature.',
          MARGIN,
          FOOTER_Y + 8,
          { width: CONTENT_WIDTH, align: 'center' }
        );
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#374151')
        .text('Thank you for your business!', MARGIN, FOOTER_Y + 20, { width: CONTENT_WIDTH, align: 'center' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};
