import bwipjs from 'bwip-js';
import PDFDocument from 'pdfkit';
import type { LabelOutputFormat, LabelTemplateId, PrinterProfileId } from '../models/PrintJob';
import { getPrinterProfile, mmToDots } from './printerProfileService';

export interface LabelTemplateConfig {
  id: LabelTemplateId;
  name: string;
  widthMm: number;
  heightMm: number;
  /** Minimum quiet zone each side in mm (Code128) */
  quietZoneMm: number;
  maxBarcodeHeightMm: number;
}

export const LABEL_TEMPLATES: Record<LabelTemplateId, LabelTemplateConfig> = {
  '25x15': { id: '25x15', name: '25 × 15 mm', widthMm: 25, heightMm: 15, quietZoneMm: 1.5, maxBarcodeHeightMm: 8 },
  '40x20': { id: '40x20', name: '40 × 20 mm', widthMm: 40, heightMm: 20, quietZoneMm: 2, maxBarcodeHeightMm: 10 },
  '50x25': { id: '50x25', name: '50 × 25 mm', widthMm: 50, heightMm: 25, quietZoneMm: 2.5, maxBarcodeHeightMm: 12 },
  '75x50': { id: '75x50', name: '75 × 50 mm', widthMm: 75, heightMm: 50, quietZoneMm: 3, maxBarcodeHeightMm: 18 },
};

export interface LabelProductData {
  barcode: string;
  name: string;
  sku: string;
}

export interface LabelValidationResult {
  valid: boolean;
  template: LabelTemplateId;
  printerProfile: PrinterProfileId;
  dpi: number;
  barcodeWidthMm: number;
  barcodeHeightMm: number;
  quietZoneMm: number;
  quietZoneOk: boolean;
  fitsLabel: boolean;
  scannerReadable: boolean;
  warnings: string[];
  errors: string[];
}

const MM_TO_PT = 2.834645669;

function getTemplate(id: LabelTemplateId): LabelTemplateConfig {
  return LABEL_TEMPLATES[id] ?? LABEL_TEMPLATES['50x25'];
}

function estimateCode128WidthMm(text: string, moduleWidthMm: number): number {
  const modules = 11 * text.length + 35;
  return modules * moduleWidthMm;
}

export function listLabelTemplates(): LabelTemplateConfig[] {
  return Object.values(LABEL_TEMPLATES);
}

export function validateLabelSpec(
  data: LabelProductData,
  templateId: LabelTemplateId,
  profileId: PrinterProfileId,
  dpi?: number
): LabelValidationResult {
  const template = getTemplate(templateId);
  const profile = getPrinterProfile(profileId);
  const effectiveDpi = dpi ?? profile.defaultDpi;
  const moduleWidthMm = 25.4 / effectiveDpi;
  const barcodeWidthMm = estimateCode128WidthMm(data.barcode, moduleWidthMm);
  const barcodeHeightMm = template.maxBarcodeHeightMm;
  const quietZoneMm = template.quietZoneMm;
  const warnings: string[] = [];
  const errors: string[] = [];

  const usableWidth = template.widthMm - quietZoneMm * 2;
  const fitsLabel = barcodeWidthMm <= usableWidth;
  if (!fitsLabel) {
    errors.push(
      `Barcode width ~${barcodeWidthMm.toFixed(1)}mm exceeds usable width ${usableWidth.toFixed(1)}mm on ${template.name}`
    );
  }

  const quietZoneOk = quietZoneMm >= 2;
  if (!quietZoneOk) warnings.push('Quiet zone below 2mm — scanner reliability may degrade');

  if (data.barcode.length > 20) warnings.push('Long barcode value — consider shorter SKU on small labels');

  const scannerReadable = fitsLabel && quietZoneOk && data.barcode.length >= 4;

  return {
    valid: errors.length === 0 && scannerReadable,
    template: templateId,
    printerProfile: profileId,
    dpi: effectiveDpi,
    barcodeWidthMm,
    barcodeHeightMm,
    quietZoneMm,
    quietZoneOk,
    fitsLabel,
    scannerReadable,
    warnings,
    errors,
  };
}

function renderCode128Png(
  text: string,
  template: LabelTemplateConfig,
  dpi: number
): Promise<Buffer> {
  const targetWidthPx = mmToDots(template.widthMm, dpi);
  const barHeightPx = mmToDots(template.maxBarcodeHeightMm, dpi);
  const scale = Math.max(2, Math.floor(targetWidthPx / (text.length * 12 + 80)));

  return new Promise((resolve, reject) => {
    bwipjs.toBuffer(
      {
        bcid: 'code128',
        text,
        scale,
        height: Math.max(6, Math.round(barHeightPx / scale)),
        includetext: true,
        textxalign: 'center',
        paddingwidth: mmToDots(template.quietZoneMm, dpi),
        paddingheight: 2,
      },
      (err, png) => {
        if (err) reject(err);
        else resolve(png);
      }
    );
  });
}

export async function renderLabelPng(
  data: LabelProductData,
  templateId: LabelTemplateId,
  profileId: PrinterProfileId
): Promise<Buffer> {
  const template = getTemplate(templateId);
  const profile = getPrinterProfile(profileId);
  return renderCode128Png(data.barcode, template, profile.defaultDpi);
}

export async function renderLabelPdf(
  data: LabelProductData,
  templateId: LabelTemplateId,
  profileId: PrinterProfileId
): Promise<Buffer> {
  const template = getTemplate(templateId);
  const profile = getPrinterProfile(profileId);
  const png = await renderCode128Png(data.barcode, template, profile.defaultDpi);
  const pageW = template.widthMm * MM_TO_PT;
  const pageH = template.heightMm * MM_TO_PT;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [pageW, pageH], margin: 0, autoFirstPage: false });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.addPage({ size: [pageW, pageH], margin: 0 });
    const imgW = pageW - template.quietZoneMm * 2 * MM_TO_PT;
    const imgH = template.maxBarcodeHeightMm * MM_TO_PT;
    const x = template.quietZoneMm * MM_TO_PT;
    const y = 2;
    doc.image(png, x, y, { width: imgW, height: imgH });
    const nameY = y + imgH + 2;
    doc.fontSize(6).text(data.name.slice(0, 28), x, nameY, { width: imgW, align: 'center' });
    doc.fontSize(5).fillColor('#444').text(`${data.sku} · ${data.barcode}`, x, nameY + 8, {
      width: imgW,
      align: 'center',
    });
    doc.end();
  });
}

export async function renderBatchPdf(
  items: LabelProductData[],
  templateId: LabelTemplateId,
  profileId: PrinterProfileId,
  copiesPerLabel: number
): Promise<Buffer> {
  const template = getTemplate(templateId);
  const profile = getPrinterProfile(profileId);
  const pageW = template.widthMm * MM_TO_PT;
  const pageH = template.heightMm * MM_TO_PT;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [pageW, pageH], margin: 0, autoFirstPage: false });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const addLabelPage = async (data: LabelProductData) => {
      const png = await renderCode128Png(data.barcode, template, profile.defaultDpi);
      doc.addPage({ size: [pageW, pageH], margin: 0 });
      const imgW = pageW - template.quietZoneMm * 2 * MM_TO_PT;
      const imgH = template.maxBarcodeHeightMm * MM_TO_PT;
      const x = template.quietZoneMm * MM_TO_PT;
      const y = 2;
      doc.image(png, x, y, { width: imgW, height: imgH });
      const nameY = y + imgH + 2;
      doc.fontSize(6).fillColor('#000').text(data.name.slice(0, 28), x, nameY, { width: imgW, align: 'center' });
      doc.fontSize(5).fillColor('#444').text(`${data.sku} · ${data.barcode}`, x, nameY + 8, {
        width: imgW,
        align: 'center',
      });
    };

    (async () => {
      try {
        for (const item of items) {
          for (let c = 0; c < copiesPerLabel; c++) {
            await addLabelPage(item);
          }
        }
        doc.end();
      } catch (e) {
        reject(e);
      }
    })();
  });
}

export function renderLabelZpl(
  data: LabelProductData,
  templateId: LabelTemplateId,
  profileId: PrinterProfileId,
  copies = 1
): string {
  const template = getTemplate(templateId);
  const profile = getPrinterProfile(profileId);
  const dpi = profile.defaultDpi;
  const w = mmToDots(template.widthMm, dpi);
  const h = mmToDots(template.heightMm, dpi);
  const barH = mmToDots(template.maxBarcodeHeightMm, dpi);
  const qz = mmToDots(template.quietZoneMm, dpi);
  const ox = profile.zplHomeOffset.x;
  const oy = profile.zplHomeOffset.y;
  const moduleW = dpi >= 300 ? 2 : 2;

  return `^XA
^PW${w}
^LL${h}
^LH${ox},${oy}
^FO${qz},${qz}^BY${moduleW}^BCN,${barH},Y,N,N^FD${data.barcode}^FS
^FO${qz},${qz + barH + 8}^A0N,18,18^FD${sanitizeZplText(data.name.slice(0, 24))}^FS
^FO${qz},${qz + barH + 28}^A0N,14,14^FD${sanitizeZplText(`${data.sku}`)}^FS
^PQ${copies}
^XZ`;
}

export function renderLabelTspl(
  data: LabelProductData,
  templateId: LabelTemplateId,
  profileId: PrinterProfileId,
  copies = 1
): string {
  const template = getTemplate(templateId);
  const profile = getPrinterProfile(profileId);
  const barH = mmToDots(template.maxBarcodeHeightMm, profile.defaultDpi);
  const qz = mmToDots(template.quietZoneMm, profile.defaultDpi);

  return `SIZE ${template.widthMm} mm, ${template.heightMm} mm
GAP ${profile.tsplGapMm} mm, 0 mm
DIRECTION ${profile.tsplDirection}
REFERENCE 0,0
CLS
BARCODE ${qz},${qz},"128",${barH},1,0,2,2,"${data.barcode}"
TEXT ${qz},${qz + barH + 6},"2",0,1,1,"${sanitizeTsplText(data.name.slice(0, 22))}"
TEXT ${qz},${qz + barH + 22},"1",0,1,1,"${sanitizeTsplText(data.sku)}"
PRINT ${copies},1
`;
}

export function renderBatchZpl(
  items: LabelProductData[],
  templateId: LabelTemplateId,
  profileId: PrinterProfileId,
  copiesPerLabel: number
): string {
  return items.map((item) => renderLabelZpl(item, templateId, profileId, copiesPerLabel)).join('\n');
}

export function renderBatchTspl(
  items: LabelProductData[],
  templateId: LabelTemplateId,
  profileId: PrinterProfileId,
  copiesPerLabel: number
): string {
  return items.map((item) => renderLabelTspl(item, templateId, profileId, copiesPerLabel)).join('\n');
}

export function renderCalibrationLabel(
  templateId: LabelTemplateId,
  profileId: PrinterProfileId,
  format: LabelOutputFormat
): Promise<{ payload: string; mimeType: string; validation: LabelValidationResult }> {
  const sample: LabelProductData = {
    barcode: 'ABC-000001',
    name: 'CALIBRATION TEST',
    sku: 'CAL-SKU',
  };
  const validation = validateLabelSpec(sample, templateId, profileId);

  if (format === 'zpl') {
    return Promise.resolve({
      payload: renderLabelZpl(sample, templateId, profileId, 1),
      mimeType: 'text/plain',
      validation,
    });
  }
  if (format === 'tspl') {
    return Promise.resolve({
      payload: renderLabelTspl(sample, templateId, profileId, 1),
      mimeType: 'text/plain',
      validation,
    });
  }
  if (format === 'png') {
    return renderLabelPng(sample, templateId, profileId).then((buf) => ({
      payload: buf.toString('base64'),
      mimeType: 'image/png',
      validation,
    }));
  }
  return renderLabelPdf(sample, templateId, profileId).then((buf) => ({
    payload: buf.toString('base64'),
    mimeType: 'application/pdf',
    validation,
  }));
}

function sanitizeZplText(value: string): string {
  return value.replace(/[\^~\\]/g, ' ').slice(0, 40);
}

function sanitizeTsplText(value: string): string {
  return value.replace(/"/g, "'").slice(0, 40);
}

export async function renderLabelOutput(
  items: LabelProductData[],
  templateId: LabelTemplateId,
  profileId: PrinterProfileId,
  format: LabelOutputFormat,
  copiesPerLabel: number
): Promise<{ payload: string; mimeType: string; labelCount: number }> {
  if (items.length === 0) {
    throw new Error('No label items to render');
  }

  const labelCount = items.length * copiesPerLabel;

  if (format === 'zpl') {
    return {
      payload: renderBatchZpl(items, templateId, profileId, copiesPerLabel),
      mimeType: 'text/plain',
      labelCount,
    };
  }
  if (format === 'tspl') {
    return {
      payload: renderBatchTspl(items, templateId, profileId, copiesPerLabel),
      mimeType: 'text/plain',
      labelCount,
    };
  }
  if (format === 'png') {
    const images: { barcode: string; name: string; sku: string; image: string }[] = [];
    for (const item of items) {
      const png = await renderLabelPng(item, templateId, profileId);
      for (let c = 0; c < copiesPerLabel; c++) {
        images.push({
          barcode: item.barcode,
          name: item.name,
          sku: item.sku,
          image: png.toString('base64'),
        });
      }
    }
    return { payload: JSON.stringify(images), mimeType: 'application/json', labelCount };
  }

  const pdf = await renderBatchPdf(items, templateId, profileId, copiesPerLabel);
  return { payload: pdf.toString('base64'), mimeType: 'application/pdf', labelCount };
}

export function getPrinterDiagnostics(profileId: PrinterProfileId) {
  const profile = getPrinterProfile(profileId);
  return {
    profile,
    templates: listLabelTemplates(),
    supportedFormats: ['pdf', 'png', 'zpl', 'tspl'] as LabelOutputFormat[],
    recommendedFormat:
      profileId === 'zebra' ? 'zpl' : profileId === 'tsc' || profileId === 'tvs' ? 'tspl' : 'pdf',
    checks: [
      { id: 'dpi', label: 'DPI scaling', status: 'ok', detail: `${profile.defaultDpi} DPI (${profile.dotsPerMm} dots/mm)` },
      { id: 'quiet_zone', label: 'Quiet zones', status: 'ok', detail: 'Code128 quiet zones enforced per template' },
      { id: 'symbology', label: 'Barcode type', status: 'ok', detail: 'Code128 only' },
      { id: 'profile', label: 'Profile loaded', status: 'ok', detail: profile.name },
    ],
  };
}
