import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { findProductByBarcode } from '../services/productSearchService';
import { normalizeBarcodeValue } from '../services/barcodeSequenceService';
import {
  createAndProcessPrintJob,
  createCalibrationJob,
  cancelPrintJob,
  listPrintJobs,
  listPrintLogs,
  getPrintJobWithOutput,
  resolveProductsForSelection,
  PrintJobSource,
} from '../services/barcodePrintService';
import { PrintJobStatus } from '../models/PrintJob';
import {
  listLabelTemplates,
  validateLabelSpec,
  getPrinterDiagnostics,
} from '../services/labelRendererService';
import { listPrinterProfiles } from '../services/printerProfileService';
import { paramId } from '../utils/params';

const templateEnum = z.enum(['25x15', '40x20', '50x25', '75x50']);
const formatEnum = z.enum(['pdf', 'png', 'zpl', 'tspl']);
const profileEnum = z.enum(['zebra', 'tsc', 'tvs', 'generic']);

export const createPrintJobSchema = z.object({
  source: z.enum(['single', 'batch', 'category', 'inventory', 'reprint']),
  productIds: z.array(z.string()).optional(),
  categoryId: z.string().optional(),
  allInventory: z.boolean().optional(),
  statusFilter: z.enum(['active', 'all']).optional(),
  reprintLogIds: z.array(z.string()).optional(),
  template: templateEnum.default('50x25'),
  format: formatEnum.default('pdf'),
  printerProfile: profileEnum.default('generic'),
  copiesPerLabel: z.number().int().min(1).max(99).default(1),
});

export const validateLabelSchema = z.object({
  barcode: z.string().min(1),
  name: z.string().optional(),
  sku: z.string().optional(),
  template: templateEnum.default('50x25'),
  printerProfile: profileEnum.default('generic'),
  dpi: z.number().int().optional(),
});

export const verifyScanSchema = z.object({
  barcode: z.string().min(1),
});

export const calibrationSchema = z.object({
  template: templateEnum.default('50x25'),
  printerProfile: profileEnum.default('generic'),
  format: formatEnum.default('pdf'),
});

export const getTemplates = asyncHandler(async (_req: AuthRequest, res: Response) => {
  ApiResponse.success(res, {
    templates: listLabelTemplates(),
    profiles: listPrinterProfiles(),
    formats: ['pdf', 'png', 'zpl', 'tspl'],
  });
});

export const getPrintableProducts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const products = await resolveProductsForSelection({
    categoryId: req.query.categoryId as string | undefined,
    search: req.query.search as string | undefined,
    status: (req.query.status as 'active' | 'all') || 'active',
    limit: parseInt(req.query.limit as string, 10) || 500,
  });
  ApiResponse.success(res, products);
});

export const createPrintJob = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = req.body as z.infer<typeof createPrintJobSchema>;
  let source = body.source as PrintJobSource;

  if (body.allInventory) source = PrintJobSource.INVENTORY;
  else if (body.categoryId && !body.productIds?.length) source = PrintJobSource.CATEGORY;
  else if (body.reprintLogIds?.length) source = PrintJobSource.REPRINT;
  else if ((body.productIds?.length ?? 0) > 1) source = PrintJobSource.BATCH;
  else if ((body.productIds?.length ?? 0) === 1) source = PrintJobSource.SINGLE;

  const job = await createAndProcessPrintJob({
    source,
    productIds: body.productIds,
    categoryId: body.categoryId,
    allInventory: body.allInventory,
    statusFilter: body.statusFilter,
    template: body.template,
    format: body.format,
    printerProfile: body.printerProfile,
    copiesPerLabel: body.copiesPerLabel,
    reprintLogIds: body.reprintLogIds,
    userId: req.user!._id,
    userName: req.user!.name,
  });

  ApiResponse.success(
    res,
    {
      id: job._id,
      jobNumber: job.jobNumber,
      status: job.status,
      totalLabels: job.totalLabels,
      processedLabels: job.processedLabels,
      format: job.format,
      mimeType: job.outputMimeType,
      outputPayload: job.outputPayload,
    },
    'Print job completed',
    201
  );
});

export const getPrintJobs = asyncHandler(async (req: AuthRequest, res: Response) => {
  const page = parseInt(req.query.page as string, 10) || 1;
  const limit = parseInt(req.query.limit as string, 10) || 20;
  const status = req.query.status as PrintJobStatus | undefined;
  const result = await listPrintJobs(page, limit, status);
  ApiResponse.paginated(res, result.jobs, { page, limit, total: result.total });
});

export const getPrintJob = asyncHandler(async (req: AuthRequest, res: Response) => {
  const job = await getPrintJobWithOutput(paramId(req.params.id));
  ApiResponse.success(res, job);
});

export const cancelJob = asyncHandler(async (req: AuthRequest, res: Response) => {
  const job = await cancelPrintJob(paramId(req.params.id));
  ApiResponse.success(res, job, 'Print job cancelled');
});

export const getPrintLogs = asyncHandler(async (req: AuthRequest, res: Response) => {
  const page = parseInt(req.query.page as string, 10) || 1;
  const limit = parseInt(req.query.limit as string, 10) || 50;
  const barcode = req.query.barcode as string | undefined;
  const result = await listPrintLogs(page, limit, barcode);
  ApiResponse.paginated(res, result.logs, { page, limit, total: result.total });
});

export const verifyScan = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { barcode } = req.body as z.infer<typeof verifyScanSchema>;
  const normalized = normalizeBarcodeValue(barcode);
  const product = await findProductByBarcode(normalized);

  if (!product) {
    return ApiResponse.success(res, {
      found: false,
      barcode: normalized,
      message: 'No active product matches this barcode',
    });
  }

  const validation = validateLabelSpec(
    {
      barcode: product.barcode ?? normalized,
      name: product.name ?? 'Product',
      sku: product.sku ?? '',
    },
    '50x25',
    'generic'
  );

  ApiResponse.success(res, {
    found: true,
    barcode: normalized,
    product,
    scannerReadable: validation.scannerReadable,
    validation,
  });
});

export const validateLabel = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = req.body as z.infer<typeof validateLabelSchema>;
  const result = validateLabelSpec(
    {
      barcode: normalizeBarcodeValue(body.barcode),
      name: body.name ?? 'Product',
      sku: body.sku ?? '',
    },
    body.template,
    body.printerProfile,
    body.dpi
  );
  ApiResponse.success(res, result);
});

export const getCalibrationLabel = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = req.body as z.infer<typeof calibrationSchema>;
  const { job, validation } = await createCalibrationJob({
    template: body.template,
    format: body.format,
    printerProfile: body.printerProfile,
    userId: req.user!._id,
    userName: req.user!.name,
  });

  ApiResponse.success(res, {
    payload: job.outputPayload,
    mimeType: job.outputMimeType,
    validation,
    jobNumber: job.jobNumber,
    jobId: job._id,
  });
});

export const getDiagnostics = asyncHandler(async (req: AuthRequest, res: Response) => {
  const profile = (req.query.profile as 'zebra' | 'tsc' | 'tvs' | 'generic') || 'generic';
  ApiResponse.success(res, getPrinterDiagnostics(profile));
});

export const downloadJobOutput = asyncHandler(async (req: AuthRequest, res: Response) => {
  const job = await getPrintJobWithOutput(paramId(req.params.id));
  if (!job.outputPayload) throw new ApiError(404, 'No output available for this job');

  const ext =
    job.format === 'pdf' ? 'pdf' : job.format === 'png' ? 'json' : 'txt';
  const filename = `${job.jobNumber}.${ext}`;

  if (job.outputMimeType === 'application/pdf') {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(Buffer.from(job.outputPayload, 'base64'));
  }
  if (job.outputMimeType === 'text/plain') {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(job.outputPayload);
  }
  if (job.outputMimeType === 'application/json') {
    res.setHeader('Content-Type', 'application/json');
    return res.json(JSON.parse(job.outputPayload));
  }

  res.setHeader('Content-Type', job.outputMimeType || 'application/octet-stream');
  res.send(Buffer.from(job.outputPayload, 'base64'));
});
