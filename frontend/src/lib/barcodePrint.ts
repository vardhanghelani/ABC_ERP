import { fetchApi, postApi, api } from '@/lib/api'
import type { ApiResponse } from '@/lib/api'

export type LabelTemplateId = '25x15' | '40x20' | '50x25' | '75x50'
export type LabelFormat = 'pdf' | 'png' | 'zpl' | 'tspl'
export type PrinterProfileId = 'zebra' | 'tsc' | 'tvs' | 'generic'

export interface LabelTemplate {
  id: LabelTemplateId
  name: string
  widthMm: number
  heightMm: number
}

export interface PrinterProfile {
  id: PrinterProfileId
  name: string
  manufacturer: string
  defaultDpi: number
  notes: string
}

export interface PrintableProduct {
  _id: string
  name: string
  sku: string
  barcode: string
  status: string
  currentStock: number
  category?: { name: string; code: string; barcodePrefix?: string }
}

export interface PrintJobResult {
  id: string
  jobNumber: string
  status: string
  totalLabels: number
  processedLabels: number
  format: LabelFormat
  mimeType?: string
  outputPayload?: string
}

export interface PrintJobSummary {
  _id: string
  jobNumber: string
  status: string
  source: string
  totalLabels: number
  processedLabels: number
  format: LabelFormat
  template: LabelTemplateId
  printerProfile: PrinterProfileId
  copiesPerLabel: number
  userName: string
  errorMessage?: string
  createdAt: string
  completedAt?: string
}

export interface PrintLogEntry {
  _id: string
  barcode: string
  productName: string
  sku: string
  copies: number
  template: LabelTemplateId
  format: LabelFormat
  printerProfile: PrinterProfileId
  action: string
  userName: string
  createdAt: string
  printJob?: { jobNumber: string }
}

export interface BarcodeTemplatesResponse {
  templates: LabelTemplate[]
  profiles: PrinterProfile[]
  formats: LabelFormat[]
}

export interface CreatePrintJobPayload {
  source: 'single' | 'batch' | 'category' | 'inventory' | 'reprint'
  productIds?: string[]
  categoryId?: string
  allInventory?: boolean
  statusFilter?: 'active' | 'all'
  reprintLogIds?: string[]
  template?: LabelTemplateId
  format?: LabelFormat
  printerProfile?: PrinterProfileId
  copiesPerLabel?: number
}

export async function fetchBarcodeTemplates() {
  return fetchApi<BarcodeTemplatesResponse>('/barcode/templates')
}

export async function fetchPrintableProducts(params?: {
  categoryId?: string
  search?: string
  status?: 'active' | 'all'
}) {
  return fetchApi<PrintableProduct[]>('/barcode/products', params)
}

export async function createPrintJob(payload: CreatePrintJobPayload) {
  return postApi<PrintJobResult>('/barcode/print/jobs', payload)
}

export async function fetchPrintJobs(page = 1, status?: string) {
  const { data } = await api.get<ApiResponse<PrintJobSummary[]>>('/barcode/print/jobs', {
    params: { page, limit: 20, status },
  })
  return { jobs: data.data, pagination: data.pagination }
}

export async function fetchPrintLogs(page = 1, barcode?: string) {
  const { data } = await api.get<ApiResponse<PrintLogEntry[]>>('/barcode/print/logs', {
    params: { page, limit: 50, barcode },
  })
  return { logs: data.data, pagination: data.pagination }
}

export async function verifyBarcodeScan(barcode: string) {
  return postApi<{
    found: boolean
    barcode: string
    message?: string
    product?: PrintableProduct
    scannerReadable?: boolean
    validation?: { valid: boolean; warnings: string[]; errors: string[] }
  }>('/barcode/print/verify', { barcode })
}

export async function fetchPrinterDiagnostics(profile: PrinterProfileId) {
  return fetchApi<{
    profile: PrinterProfile & { dotsPerMm: number }
    recommendedFormat: LabelFormat
    checks: { id: string; label: string; status: string; detail: string }[]
  }>('/barcode/print/diagnostics', { profile })
}

export async function generateCalibrationLabel(payload: {
  template?: LabelTemplateId
  format?: LabelFormat
  printerProfile?: PrinterProfileId
}) {
  return postApi<{
    payload: string
    mimeType: string
    validation: { valid: boolean; warnings: string[]; errors: string[] }
    jobNumber: string
    jobId: string
  }>('/barcode/print/calibration', payload)
}

export async function cancelPrintJob(jobId: string) {
  return postApi(`/barcode/print/jobs/${jobId}/cancel`)
}

export function downloadPrintOutput(
  payload: string,
  mimeType: string,
  filename: string
) {
  if (mimeType === 'text/plain') {
    const blob = new Blob([payload], { type: 'text/plain;charset=utf-8' })
    triggerDownload(blob, filename)
    return
  }
  if (mimeType === 'application/json') {
    const blob = new Blob([payload], { type: 'application/json' })
    triggerDownload(blob, `${filename}.json`)
    return
  }
  const binary = atob(payload)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const blob = new Blob([bytes], { type: mimeType })
  triggerDownload(blob, filename)
}

export function openPdfFromBase64(base64: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export async function downloadJobFile(jobId: string, jobNumber: string, format: LabelFormat) {
  const response = await api.get(`/barcode/print/jobs/${jobId}/download`, { responseType: 'blob' })
  const ext = format === 'pdf' ? 'pdf' : format === 'png' ? 'json' : 'txt'
  triggerDownload(response.data as Blob, `${jobNumber}.${ext}`)
}
