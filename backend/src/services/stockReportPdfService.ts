import { Product } from '../models/Product';
import { Category } from '../models/Category';
import { CategoryField } from '../models/CategoryField';
import { getInventoryValuation } from './stockService';
import {
  LANDSCAPE_A4,
  PDF_THEME,
  createPdfBuffer,
  drawPdfClosingNote,
  drawPdfKeyValueTable,
  drawPdfPageFooter,
  drawPdfReportHeader,
  drawPdfSectionBand,
  drawPdfSummaryStrip,
  drawPdfTableRow,
  formatPdfInteger,
  formatPdfMoney,
  humanizeToken,
  measurePdfRowHeight,
  type PdfTableColumn,
} from './pdf/pdfLayout';

const layout = LANDSCAPE_A4;

interface SpecColumn {
  key: string;
  label: string;
}

interface CategoryGroup {
  categoryId: string;
  categoryName: string;
  categoryCode: string;
  specColumns: SpecColumn[];
  products: Array<{
    name: string;
    currentStock: number;
    reorderLevel: number;
    minimumBunch: number;
    purchasePrice: number;
    attributes: Map<string, unknown> | Record<string, unknown>;
  }>;
}

function stockStatusLabel(current: number, reorder: number): string {
  if (current <= 0) return 'Out of Stock';
  if (current <= reorder) return 'Low Stock';
  return 'In Stock';
}

function getAttributeValue(
  attributes: Map<string, unknown> | Record<string, unknown> | undefined,
  key: string
): string {
  if (!attributes) return '—';
  const raw =
    attributes instanceof Map ? attributes.get(key) : (attributes as Record<string, unknown>)[key];
  if (raw == null || raw === '') return '—';
  if (Array.isArray(raw)) return raw.map(String).join(', ');
  return String(raw).trim() || '—';
}

function buildTableColumns(specColumns: SpecColumn[]): PdfTableColumn[] {
  const headWidth = 28 + 120;
  const tailWidth = 52 + 56;
  const specWidth = Math.max(
    45,
    Math.floor((layout.contentWidth - headWidth - tailWidth) / Math.max(specColumns.length, 1))
  );

  const columns: PdfTableColumn[] = [
    { label: '#', width: 28, align: 'center' },
    { label: 'Product Name', width: 120, align: 'left' },
  ];

  specColumns.forEach((spec) => {
    columns.push({ label: spec.label, width: specWidth, align: 'left', key: spec.key });
  });

  columns.push(
    { label: 'Stock (pcs)', width: 52, align: 'right' },
    { label: 'Status', width: 56, align: 'center' }
  );

  const totalWidth = columns.reduce((sum, col) => sum + col.width, 0);
  if (totalWidth !== layout.contentWidth) {
    columns[columns.length - 1].width += layout.contentWidth - totalWidth;
  }
  return columns;
}

function collectSpecColumns(
  fieldDocs: Array<{ key: string; name: string; sortOrder: number }>,
  products: CategoryGroup['products']
): SpecColumn[] {
  if (fieldDocs.length > 0) {
    return fieldDocs
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((field) => ({ key: field.key, label: field.name }));
  }

  const keys = new Set<string>();
  products.forEach((product) => {
    const attrs = product.attributes;
    if (attrs instanceof Map) attrs.forEach((_value, key) => keys.add(String(key)));
    else if (attrs && typeof attrs === 'object') Object.keys(attrs).forEach((key) => keys.add(key));
  });

  return [...keys]
    .sort((a, b) => a.localeCompare(b))
    .map((key) => ({ key, label: humanizeToken(key) }));
}

async function loadCategoryGroups(): Promise<CategoryGroup[]> {
  const products = await Product.find({ status: 'active' })
    .populate('category', 'name code')
    .sort({ name: 1 })
    .lean();

  const categories = await Category.find({ isActive: { $ne: false } }).sort({ name: 1 }).lean();
  const fields = await CategoryField.find({ isActive: { $ne: false } }).sort({ sortOrder: 1 }).lean();

  const productsByCategory = new Map<string, CategoryGroup['products']>();
  for (const product of products) {
    const category = product.category as { _id?: { toString(): string } } | null;
    const categoryId = category?._id?.toString() ?? 'uncategorized';
    const list = productsByCategory.get(categoryId) ?? [];
    list.push({
      name: product.name,
      currentStock: product.currentStock ?? 0,
      reorderLevel: product.reorderLevel ?? 0,
      minimumBunch: product.minimumBunch ?? 1,
      purchasePrice: product.purchasePrice ?? 0,
      attributes: product.attributes as Map<string, unknown> | Record<string, unknown>,
    });
    productsByCategory.set(categoryId, list);
  }

  const groups: CategoryGroup[] = [];
  for (const category of categories) {
    const categoryId = category._id.toString();
    const categoryProducts = productsByCategory.get(categoryId) ?? [];
    if (categoryProducts.length === 0) continue;
    const categoryFields = fields.filter((field) => field.category.toString() === categoryId);
    groups.push({
      categoryId,
      categoryName: category.name,
      categoryCode: category.code,
      specColumns: collectSpecColumns(categoryFields, categoryProducts),
      products: categoryProducts.sort((a, b) => a.name.localeCompare(b.name)),
    });
    productsByCategory.delete(categoryId);
  }

  for (const [categoryId, categoryProducts] of productsByCategory.entries()) {
    if (categoryProducts.length === 0) continue;
    groups.push({
      categoryId,
      categoryName: 'Uncategorized',
      categoryCode: '—',
      specColumns: collectSpecColumns([], categoryProducts),
      products: categoryProducts.sort((a, b) => a.name.localeCompare(b.name)),
    });
  }

  return groups;
}

export async function generateStockReportPDF(companyInfo: Record<string, string>): Promise<Buffer> {
  const [groups, valuation] = await Promise.all([loadCategoryGroups(), getInventoryValuation()]);

  return createPdfBuffer(layout, (doc) => {
    let pageNumber = 1;
    let footerLabel = '';

    const ensureSpace = (needed: number, repeatHeader?: () => void) => {
      if (y + needed <= layout.footerY) return;
      drawPdfPageFooter(doc, layout, pageNumber, footerLabel);
      doc.addPage({ size: [layout.pageWidth, layout.pageHeight], margin: layout.margin });
      pageNumber += 1;
      repeatHeader?.();
    };

    const header = drawPdfReportHeader(
      doc,
      layout,
      companyInfo,
      'INVENTORY STOCK REPORT',
      'All quantities in pieces (pcs)'
    );
    footerLabel = `${header.companyName} — Inventory Stock Report`;
    let y = header.y;

    y = drawPdfSummaryStrip(doc, layout, y, [
      { label: 'Total Products', value: String(groups.reduce((sum, g) => sum + g.products.length, 0)) },
      { label: 'Total Units', value: formatPdfInteger(valuation.totalUnits) },
      { label: 'Purchase Value', value: formatPdfMoney(valuation.purchaseValue) },
      { label: 'Wholesale Value', value: formatPdfMoney(valuation.wholesaleValue) },
      { label: 'Retail Value', value: formatPdfMoney(valuation.retailValue) },
    ]);

    if (groups.length === 0) {
      doc.font('Helvetica').fontSize(11).fillColor(PDF_THEME.muted).text('No active products in inventory.', layout.margin, y + 20, {
        width: layout.contentWidth,
        align: 'center',
      });
      drawPdfPageFooter(doc, layout, pageNumber, footerLabel);
      return;
    }

    for (const group of groups) {
      const columns = buildTableColumns(group.specColumns);
      const headerValues = columns.map((col) => col.label);

      const drawCategoryHeader = () => {
        y = drawPdfSectionBand(
          doc,
          layout,
          y,
          `${group.categoryName} (${group.categoryCode}) — ${group.products.length} product(s)`
        );
      };

      const drawTableHeader = () => {
        y = drawPdfTableRow(doc, layout, y, columns, headerValues, { header: true, height: 24 });
      };

      ensureSpace(50);
      drawCategoryHeader();
      drawTableHeader();

      let categoryUnits = 0;

      group.products.forEach((product, index) => {
        const rowValues = [
          String(index + 1),
          product.name,
          ...group.specColumns.map((spec) => getAttributeValue(product.attributes, spec.key)),
          formatPdfInteger(product.currentStock),
          stockStatusLabel(product.currentStock, product.reorderLevel),
        ];

        const rowHeight = measurePdfRowHeight(doc, layout, columns, rowValues, layout.rowHeight);
        ensureSpace(rowHeight + 4, () => {
          y = layout.margin;
          drawCategoryHeader();
          drawTableHeader();
        });

        y = drawPdfTableRow(doc, layout, y, columns, rowValues, { height: rowHeight, wrap: true });
        categoryUnits += product.currentStock;
      });

      const stockIndex = 2 + group.specColumns.length;
      const subtotalValues = columns.map((_col, index) => {
        if (index === 1) return `${group.categoryName} Subtotal`;
        if (index === stockIndex) return formatPdfInteger(categoryUnits);
        return '';
      });

      ensureSpace(layout.rowHeight + 4, () => {
        y = layout.margin;
        drawCategoryHeader();
        drawTableHeader();
      });
      y = drawPdfTableRow(doc, layout, y, columns, subtotalValues, {
        height: layout.rowHeight,
        fill: PDF_THEME.subtotalFill,
      });
      y += 14;
    }

    ensureSpace(80);
    y = drawPdfKeyValueTable(doc, layout, y, 'Report Totals', [
      { label: 'Total Active Products', value: String(groups.reduce((sum, g) => sum + g.products.length, 0)) },
      { label: 'Total Units in Stock', value: formatPdfInteger(valuation.totalUnits) },
      { label: 'Total Purchase Value', value: formatPdfMoney(valuation.purchaseValue), bold: true },
      { label: 'Total Wholesale Value', value: formatPdfMoney(valuation.wholesaleValue) },
      { label: 'Total Retail Value', value: formatPdfMoney(valuation.retailValue) },
    ]);

    y = drawPdfClosingNote(
      doc,
      layout,
      y + 4,
      'Specification columns are taken from each product category. This is a system-generated inventory stock report.'
    );
    drawPdfPageFooter(doc, layout, pageNumber, footerLabel);
  });
}
