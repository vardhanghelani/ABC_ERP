import PDFDocument from 'pdfkit';

export type TextAlign = 'left' | 'center' | 'right';

export interface PdfTableColumn {
  label: string;
  width: number;
  align: TextAlign;
  key?: string;
}

export interface PdfPageLayout {
  margin: number;
  pageWidth: number;
  pageHeight: number;
  contentWidth: number;
  footerY: number;
  rowHeight: number;
}

export const PDF_THEME = {
  headerBg: '#eef2f7',
  sectionBg: '#dbeafe',
  border: '#1f2937',
  muted: '#4b5563',
  text: '#111827',
  subtleFill: '#fafafa',
  subtotalFill: '#f3f4f6',
};

export const PORTRAIT_A4: PdfPageLayout = {
  margin: 45,
  pageWidth: 595.28,
  pageHeight: 841.89,
  contentWidth: 595.28 - 90,
  footerY: 841.89 - 45 - 36,
  rowHeight: 22,
};

export const LANDSCAPE_A4: PdfPageLayout = {
  margin: 36,
  pageWidth: 841.89,
  pageHeight: 595.28,
  contentWidth: 841.89 - 72,
  footerY: 595.28 - 36 - 28,
  rowHeight: 20,
};

export function resolveCompanyName(companyInfo: Record<string, string>): string {
  const raw = String(companyInfo.company_name || '').trim();
  if (!raw || raw === 'Jewellery Raw Material ERP') return 'ABC SALES';
  return raw;
}

export function formatPdfMoney(amount: number): string {
  return `Rs. ${Number(amount || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatPdfDate(date: Date | string | undefined): string {
  if (!date) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date));
}

export function formatPdfDateTime(date: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export function formatPdfInteger(n: number): string {
  return Number(n || 0).toLocaleString('en-IN');
}

export function humanizeToken(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function columnOffsets(layout: PdfPageLayout, columns: PdfTableColumn[]): number[] {
  const offsets = [layout.margin];
  let x = layout.margin;
  columns.forEach((col) => {
    x += col.width;
    offsets.push(x);
  });
  return offsets;
}

export function measurePdfRowHeight(
  doc: PDFKit.PDFDocument,
  layout: PdfPageLayout,
  columns: PdfTableColumn[],
  values: string[],
  baseHeight?: number,
  fontSize = 8
): number {
  let maxHeight = baseHeight ?? layout.rowHeight;
  const padding = 8;
  columns.forEach((col, index) => {
    doc.font('Helvetica').fontSize(fontSize);
    const textHeight = doc.heightOfString(values[index] ?? '—', {
      width: Math.max(10, col.width - padding),
    });
    maxHeight = Math.max(maxHeight, textHeight + 10);
  });
  return Math.min(maxHeight, 56);
}

export function drawPdfCellText(
  doc: PDFKit.PDFDocument,
  layout: PdfPageLayout,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  align: TextAlign,
  options: { bold?: boolean; fontSize?: number; wrap?: boolean } = {}
): void {
  const padding = 5;
  const fontSize = options.fontSize ?? 8;
  doc.font(options.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize).fillColor(PDF_THEME.text);

  if (options.wrap) {
    doc.text(text || '—', x + padding, y + 5, {
      width: Math.max(10, width - padding * 2),
      align,
      lineBreak: true,
    });
    return;
  }

  const textY = y + Math.max(4, (height - fontSize - 2) / 2);
  doc.text(text || '—', x + padding, textY, {
    width: width - padding * 2,
    align,
    lineBreak: false,
  });
}

export function drawPdfTableRow(
  doc: PDFKit.PDFDocument,
  layout: PdfPageLayout,
  y: number,
  columns: PdfTableColumn[],
  values: string[],
  options: {
    header?: boolean;
    height?: number;
    boldLast?: boolean;
    fill?: string;
    wrap?: boolean;
    fontSize?: number;
  } = {}
): number {
  const height = options.height ?? layout.rowHeight;
  const startX = layout.margin;
  const offsets = columnOffsets(layout, columns);

  if (options.fill) {
    doc.save().fillColor(options.fill).rect(startX, y, layout.contentWidth, height).fill().restore();
  } else if (options.header) {
    doc.save().fillColor(PDF_THEME.headerBg).rect(startX, y, layout.contentWidth, height).fill().restore();
  }

  doc
    .save()
    .strokeColor(PDF_THEME.border)
    .lineWidth(0.6)
    .rect(startX, y, layout.contentWidth, height)
    .stroke()
    .restore();

  columns.forEach((col, i) => {
    if (i > 0) {
      doc
        .save()
        .strokeColor(PDF_THEME.border)
        .lineWidth(0.6)
        .moveTo(offsets[i], y)
        .lineTo(offsets[i], y + height)
        .stroke()
        .restore();
    }
    const bold = (options.boldLast && i === columns.length - 1) || (options.header ?? false);
    drawPdfCellText(doc, layout, values[i] ?? '—', offsets[i], y, col.width, height, col.align, {
      bold,
      fontSize: options.fontSize,
      wrap: options.wrap,
    });
  });

  return y + height;
}

export function drawPdfTableSummaryRow(
  doc: PDFKit.PDFDocument,
  layout: PdfPageLayout,
  y: number,
  columns: PdfTableColumn[],
  label: string,
  value: string,
  options: { bold?: boolean; fill?: string } = {}
): number {
  const height = layout.rowHeight;
  const offsets = columnOffsets(layout, columns);
  const labelColIndex = columns.length - 2;
  const valueColIndex = columns.length - 1;
  const startX = layout.margin;

  if (options.fill) {
    doc.save().fillColor(options.fill).rect(startX, y, layout.contentWidth, height).fill().restore();
  }

  doc
    .save()
    .strokeColor(PDF_THEME.border)
    .lineWidth(0.6)
    .rect(startX, y, layout.contentWidth, height)
    .stroke()
    .restore();
  offsets.slice(1).forEach((xPos) => {
    doc
      .save()
      .strokeColor(PDF_THEME.border)
      .lineWidth(0.6)
      .moveTo(xPos, y)
      .lineTo(xPos, y + height)
      .stroke()
      .restore();
  });

  drawPdfCellText(
    doc,
    layout,
    label,
    offsets[labelColIndex],
    y,
    columns[labelColIndex].width,
    height,
    'right',
    { bold: options.bold ?? false }
  );
  drawPdfCellText(
    doc,
    layout,
    value,
    offsets[valueColIndex],
    y,
    columns[valueColIndex].width,
    height,
    'right',
    { bold: options.bold ?? false }
  );

  return y + height;
}

export function drawPdfInfoBox(
  doc: PDFKit.PDFDocument,
  layout: PdfPageLayout,
  x: number,
  y: number,
  width: number,
  title: string,
  lines: string[]
): number {
  const padding = 10;
  const lineHeight = 13;
  const blockHeight = padding * 2 + 16 + lines.length * lineHeight;

  doc.save().fillColor(PDF_THEME.subtleFill).rect(x, y, width, blockHeight).fill().restore();
  doc.save().strokeColor(PDF_THEME.border).lineWidth(0.6).rect(x, y, width, blockHeight).stroke().restore();
  doc.font('Helvetica-Bold').fontSize(9).fillColor(PDF_THEME.text).text(title.toUpperCase(), x + padding, y + padding);
  doc.font('Helvetica').fontSize(8).fillColor(PDF_THEME.muted);
  lines.forEach((line, i) => {
    doc.text(line, x + padding, y + padding + 16 + i * lineHeight, { width: width - padding * 2 });
  });

  return blockHeight;
}

export function drawPdfKeyValueTable(
  doc: PDFKit.PDFDocument,
  layout: PdfPageLayout,
  y: number,
  title: string,
  rows: { label: string; value: string; bold?: boolean }[]
): number {
  const tableWidth = layout.contentWidth;
  const labelWidth = tableWidth * 0.38;
  const valueWidth = tableWidth - labelWidth;
  const headerHeight = 20;
  const rowHeight = 18;

  doc.save().fillColor(PDF_THEME.headerBg).rect(layout.margin, y, tableWidth, headerHeight).fill().restore();
  doc
    .save()
    .strokeColor(PDF_THEME.border)
    .lineWidth(0.6)
    .rect(layout.margin, y, tableWidth, headerHeight)
    .stroke()
    .restore();
  doc
    .font('Helvetica-Bold')
    .fontSize(8)
    .fillColor(PDF_THEME.text)
    .text(title.toUpperCase(), layout.margin + 8, y + 6, { width: tableWidth - 16 });

  let currentY = y + headerHeight;
  rows.forEach((row) => {
    doc
      .save()
      .strokeColor(PDF_THEME.border)
      .lineWidth(0.6)
      .rect(layout.margin, currentY, tableWidth, rowHeight)
      .stroke()
      .restore();
    doc
      .save()
      .strokeColor(PDF_THEME.border)
      .lineWidth(0.6)
      .moveTo(layout.margin + labelWidth, currentY)
      .lineTo(layout.margin + labelWidth, currentY + rowHeight)
      .stroke()
      .restore();

    drawPdfCellText(doc, layout, row.label, layout.margin, currentY, labelWidth, rowHeight, 'left', {
      bold: row.bold ?? false,
    });
    drawPdfCellText(
      doc,
      layout,
      row.value,
      layout.margin + labelWidth,
      currentY,
      valueWidth,
      rowHeight,
      'right',
      { bold: row.bold ?? false }
    );
    currentY += rowHeight;
  });

  return currentY + 8;
}

export function drawPdfSectionBand(
  doc: PDFKit.PDFDocument,
  layout: PdfPageLayout,
  y: number,
  title: string,
  fill = PDF_THEME.sectionBg
): number {
  doc.save().fillColor(fill).rect(layout.margin, y, layout.contentWidth, 22).fill().restore();
  doc
    .save()
    .strokeColor(PDF_THEME.border)
    .lineWidth(0.6)
    .rect(layout.margin, y, layout.contentWidth, 22)
    .stroke()
    .restore();
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#1e3a8a').text(title, layout.margin + 8, y + 6, {
    width: layout.contentWidth - 16,
  });
  return y + 24;
}

export interface PdfReportHeaderResult {
  y: number;
  companyName: string;
}

export function drawPdfReportHeader(
  doc: PDFKit.PDFDocument,
  layout: PdfPageLayout,
  companyInfo: Record<string, string>,
  reportTitle: string,
  subtitle?: string
): PdfReportHeaderResult {
  const companyName = resolveCompanyName(companyInfo);
  let y = layout.margin;

  doc.save().fillColor(PDF_THEME.headerBg).rect(layout.margin, y, layout.contentWidth, 72).fill().restore();
  doc
    .save()
    .strokeColor(PDF_THEME.border)
    .lineWidth(0.8)
    .rect(layout.margin, y, layout.contentWidth, 72)
    .stroke()
    .restore();

  doc
    .font('Helvetica-Bold')
    .fontSize(16)
    .fillColor(PDF_THEME.text)
    .text(companyName, layout.margin + 12, y + 10, { width: layout.contentWidth * 0.55 });
  doc
    .font('Helvetica-Bold')
    .fontSize(13)
    .fillColor(PDF_THEME.text)
    .text(reportTitle, layout.margin + layout.contentWidth * 0.55, y + 10, {
      width: layout.contentWidth * 0.43 - 12,
      align: 'right',
    });

  doc.font('Helvetica').fontSize(8).fillColor(PDF_THEME.muted);
  let headerLineY = y + 32;
  if (companyInfo.company_address) {
    doc.text(String(companyInfo.company_address), layout.margin + 12, headerLineY, {
      width: layout.contentWidth * 0.55,
    });
    headerLineY = doc.y + 2;
  }
  const meta: string[] = [];
  if (companyInfo.company_phone) meta.push(`Tel: ${companyInfo.company_phone}`);
  if (companyInfo.company_gst) meta.push(`GSTIN: ${companyInfo.company_gst}`);
  if (meta.length) doc.text(meta.join('   |   '), layout.margin + 12, headerLineY, { width: layout.contentWidth * 0.55 });

  const rightLines = [subtitle || `Generated: ${formatPdfDateTime(new Date())}`];
  rightLines.forEach((line, index) => {
    doc.text(line, layout.margin + layout.contentWidth * 0.55, y + 32 + index * 14, {
      width: layout.contentWidth * 0.43 - 12,
      align: 'right',
    });
  });

  return { y: y + 84, companyName };
}

export function drawPdfSummaryStrip(
  doc: PDFKit.PDFDocument,
  layout: PdfPageLayout,
  y: number,
  items: Array<{ label: string; value: string }>
): number {
  if (items.length === 0) return y;
  const colWidth = layout.contentWidth / items.length;
  items.forEach((item, index) => {
    const x = layout.margin + index * colWidth;
    doc.save().fillColor(PDF_THEME.subtleFill).rect(x, y, colWidth, 42).fill().restore();
    doc.save().strokeColor(PDF_THEME.border).lineWidth(0.6).rect(x, y, colWidth, 42).stroke().restore();
    doc.font('Helvetica').fontSize(7).fillColor(PDF_THEME.muted).text(item.label, x + 6, y + 8, {
      width: colWidth - 12,
      align: 'center',
    });
    doc.font('Helvetica-Bold').fontSize(9).fillColor(PDF_THEME.text).text(item.value, x + 6, y + 22, {
      width: colWidth - 12,
      align: 'center',
    });
  });
  return y + 52;
}

export function drawPdfPageFooter(
  doc: PDFKit.PDFDocument,
  layout: PdfPageLayout,
  pageNumber: number,
  footerLabel: string
): void {
  doc
    .save()
    .strokeColor('#cbd5e1')
    .lineWidth(0.5)
    .moveTo(layout.margin, layout.footerY)
    .lineTo(layout.margin + layout.contentWidth, layout.footerY)
    .stroke()
    .restore();
  doc
    .font('Helvetica')
    .fontSize(7)
    .fillColor(PDF_THEME.muted)
    .text(footerLabel, layout.margin, layout.footerY + 8, {
      width: layout.contentWidth * 0.72,
      align: 'left',
    });
  doc.text(`Page ${pageNumber}`, layout.margin, layout.footerY + 8, {
    width: layout.contentWidth,
    align: 'right',
  });
}

export function drawPdfClosingNote(doc: PDFKit.PDFDocument, layout: PdfPageLayout, y: number, text: string): number {
  doc
    .save()
    .strokeColor('#cbd5e1')
    .lineWidth(0.5)
    .moveTo(layout.margin, y)
    .lineTo(layout.margin + layout.contentWidth, y)
    .stroke()
    .restore();
  doc.font('Helvetica').fontSize(7).fillColor(PDF_THEME.muted).text(text, layout.margin, y + 8, {
    width: layout.contentWidth,
    align: 'center',
  });
  return y + 24;
}

export function createPdfBuffer(
  layout: PdfPageLayout,
  build: (doc: PDFKit.PDFDocument) => void
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: layout.margin,
        size: [layout.pageWidth, layout.pageHeight],
        bufferPages: true,
      });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      build(doc);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

export function amountInWords(num: number): string {
  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
  ];
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

export function paymentLabel(method: string): string {
  const labels: Record<string, string> = {
    cash: 'Cash',
    upi: 'UPI',
    bank: 'Bank Transfer',
    credit: 'Credit',
    card: 'Card',
    cheque: 'Cheque',
    credit_adjustment: 'Credit Adjustment',
  };
  return labels[method] || humanizeToken(method);
}

export function sendPdfResponse(
  res: { setHeader: (name: string, value: string) => void; send: (body: Buffer) => void },
  pdf: Buffer,
  filename: string
): void {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
  res.send(pdf);
}
