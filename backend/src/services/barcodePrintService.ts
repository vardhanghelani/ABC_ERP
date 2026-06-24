import mongoose from 'mongoose';
import { Product, Category, DocumentCounter } from '../models';
import {
  PrintJob,
  PrintJobStatus,
  PrintJobSource,
  type LabelOutputFormat,
  type LabelTemplateId,
  type PrinterProfileId,
} from '../models/PrintJob';
import { BarcodePrintLog, BarcodePrintAction } from '../models/BarcodePrintLog';
import { ApiError } from '../utils/ApiError';
import { renderLabelOutput, renderCalibrationLabel, type LabelProductData } from './labelRendererService';

async function nextJobNumber(): Promise<string> {
  const counter = await DocumentCounter.findOneAndUpdate(
    { key: 'barcode_print_job' },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  return `BPJ-${String(counter!.seq).padStart(6, '0')}`;
}

export interface CreatePrintJobInput {
  source: PrintJobSource;
  productIds?: string[];
  categoryId?: string;
  allInventory?: boolean;
  statusFilter?: 'active' | 'all';
  template: LabelTemplateId;
  format: LabelOutputFormat;
  printerProfile: PrinterProfileId;
  copiesPerLabel: number;
  reprintLogIds?: string[];
  reprintOfJobId?: string;
  userId: mongoose.Types.ObjectId;
  userName: string;
}

async function resolveProducts(input: CreatePrintJobInput): Promise<LabelProductData[]> {
  let productQuery: Record<string, unknown> = { barcode: { $exists: true, $nin: [null, ''] } };

  if (input.statusFilter !== 'all') {
    productQuery.status = 'active';
  }

  if (input.reprintLogIds?.length) {
    const logs = await BarcodePrintLog.find({ _id: { $in: input.reprintLogIds } }).select('product barcode productName sku');
    return logs.map((log) => ({
      barcode: log.barcode,
      name: log.productName,
      sku: log.sku,
    }));
  }

  if (input.productIds?.length) {
    productQuery._id = { $in: input.productIds };
  } else if (input.categoryId) {
    productQuery.category = input.categoryId;
  } else if (!input.allInventory) {
    throw new ApiError(400, 'Specify productIds, categoryId, allInventory, or reprintLogIds');
  }

  const products = await Product.find(productQuery)
    .select('_id barcode name sku')
    .sort({ name: 1 })
    .lean();

  if (products.length === 0) {
    throw new ApiError(404, 'No products with barcodes found for this print job');
  }

  return products.map((p) => ({
    barcode: p.barcode as string,
    name: p.name,
    sku: p.sku,
  }));
}

export async function createAndProcessPrintJob(input: CreatePrintJobInput) {
  const items = await resolveProducts(input);
  const totalLabels = items.length * input.copiesPerLabel;
  const productIds =
    input.productIds ??
    (await Product.find({
      barcode: { $in: items.map((i) => i.barcode) },
    }).distinct('_id'));

  const job = await PrintJob.create({
    jobNumber: await nextJobNumber(),
    status: PrintJobStatus.QUEUED,
    source: input.source,
    productIds,
    categoryId: input.categoryId,
    template: input.template,
    format: input.format,
    printerProfile: input.printerProfile,
    copiesPerLabel: input.copiesPerLabel,
    totalLabels,
    processedLabels: 0,
    user: input.userId,
    userName: input.userName,
    reprintOfJobId: input.reprintOfJobId,
  });

  return processPrintJob(job._id.toString(), items, input);
}

export async function processPrintJob(
  jobId: string,
  prefetchedItems?: LabelProductData[],
  inputMeta?: Pick<CreatePrintJobInput, 'copiesPerLabel' | 'format' | 'printerProfile' | 'template' | 'userId' | 'userName' | 'reprintLogIds'>
) {
  const job = await PrintJob.findById(jobId);
  if (!job) throw new ApiError(404, 'Print job not found');
  if (job.status === PrintJobStatus.CANCELLED) throw new ApiError(400, 'Print job was cancelled');
  if (job.status === PrintJobStatus.COMPLETED) return job;

  job.status = PrintJobStatus.PROCESSING;
  job.startedAt = new Date();
  await job.save();

  try {
    const items =
      prefetchedItems ??
      (await Product.find({ _id: { $in: job.productIds }, barcode: { $exists: true, $nin: [null, ''] } })
        .select('barcode name sku')
        .lean()).map((p) => ({ barcode: p.barcode as string, name: p.name, sku: p.sku }));

    if (items.length === 0) throw new ApiError(404, 'No printable products in job');

    const { payload, mimeType, labelCount } = await renderLabelOutput(
      items,
      job.template,
      job.printerProfile,
      job.format,
      job.copiesPerLabel
    );

    const action =
      job.source === PrintJobSource.REPRINT ? BarcodePrintAction.REPRINT : BarcodePrintAction.PRINT;

    const productDocs = await Product.find({ barcode: { $in: items.map((i) => i.barcode) } })
      .select('_id barcode')
      .lean();
    const productByBarcode = new Map(productDocs.map((p) => [p.barcode, p._id]));

    for (const item of items) {
      await BarcodePrintLog.create({
        printJob: job._id,
        product: productByBarcode.get(item.barcode),
        barcode: item.barcode,
        productName: item.name,
        sku: item.sku,
        copies: job.copiesPerLabel,
        template: job.template,
        format: job.format,
        printerProfile: job.printerProfile,
        action,
        user: job.user,
        userName: job.userName,
        previousLogId: inputMeta?.reprintLogIds?.[0],
      });
    }

    job.status = PrintJobStatus.COMPLETED;
    job.processedLabels = labelCount;
    job.outputPayload = payload;
    job.outputMimeType = mimeType;
    job.completedAt = new Date();
    await job.save();

    return job;
  } catch (err) {
    job.status = PrintJobStatus.FAILED;
    job.errorMessage = err instanceof Error ? err.message : 'Print job failed';
    job.completedAt = new Date();
    await job.save();
    throw err;
  }
}

export async function cancelPrintJob(jobId: string) {
  const job = await PrintJob.findById(jobId);
  if (!job) throw new ApiError(404, 'Print job not found');
  if (job.status === PrintJobStatus.COMPLETED) throw new ApiError(400, 'Cannot cancel completed job');
  job.status = PrintJobStatus.CANCELLED;
  job.completedAt = new Date();
  await job.save();
  return job;
}

export async function listPrintJobs(page = 1, limit = 20, status?: PrintJobStatus) {
  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  const skip = (page - 1) * limit;
  const [jobs, total] = await Promise.all([
    PrintJob.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).select('-outputPayload'),
    PrintJob.countDocuments(filter),
  ]);
  return { jobs, total, page, limit };
}

export async function listPrintLogs(page = 1, limit = 50, barcode?: string) {
  const filter: Record<string, unknown> = {};
  if (barcode) filter.barcode = new RegExp(barcode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const skip = (page - 1) * limit;
  const [logs, total] = await Promise.all([
    BarcodePrintLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('product', 'name sku')
      .populate('printJob', 'jobNumber'),
    BarcodePrintLog.countDocuments(filter),
  ]);
  return { logs, total, page, limit };
}

export async function getPrintJobWithOutput(jobId: string) {
  const job = await PrintJob.findById(jobId);
  if (!job) throw new ApiError(404, 'Print job not found');
  return job;
}

export async function resolveProductsForSelection(filters: {
  categoryId?: string;
  search?: string;
  status?: 'active' | 'all';
  limit?: number;
}) {
  const query: Record<string, unknown> = {
    barcode: { $exists: true, $nin: [null, ''] },
  };
  if (filters.status !== 'all') query.status = 'active';
  if (filters.categoryId) query.category = filters.categoryId;

  let products = await Product.find(query)
    .populate('category', 'name code barcodePrefix')
    .select('_id name sku barcode status currentStock')
    .sort({ name: 1 })
    .limit(filters.limit ?? 500)
    .lean();

  if (filters.search?.trim()) {
    const q = filters.search.trim().toLowerCase();
    products = products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.barcode as string).toLowerCase().includes(q)
    );
  }

  return products;
}

export async function createCalibrationJob(input: {
  template: LabelTemplateId;
  format: LabelOutputFormat;
  printerProfile: PrinterProfileId;
  userId: mongoose.Types.ObjectId;
  userName: string;
}) {
  const result = await renderCalibrationLabel(input.template, input.printerProfile, input.format);

  const job = await PrintJob.create({
    jobNumber: await nextJobNumber(),
    status: PrintJobStatus.COMPLETED,
    source: PrintJobSource.CALIBRATION,
    productIds: [],
    template: input.template,
    format: input.format,
    printerProfile: input.printerProfile,
    copiesPerLabel: 1,
    totalLabels: 1,
    processedLabels: 1,
    user: input.userId,
    userName: input.userName,
    outputPayload: result.payload,
    outputMimeType: result.mimeType,
    startedAt: new Date(),
    completedAt: new Date(),
  });

  await BarcodePrintLog.create({
    printJob: job._id,
    barcode: 'ABC-000001',
    productName: 'CALIBRATION TEST',
    sku: 'CAL-SKU',
    copies: 1,
    template: input.template,
    format: input.format,
    printerProfile: input.printerProfile,
    action: BarcodePrintAction.CALIBRATION,
    user: input.userId,
    userName: input.userName,
  });

  return { job, validation: result.validation };
}

export { PrintJobSource };
