import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Layout } from '@/components/layout/Layout'
import { PageHeader } from '@/components/layout/PageHeader'
import { Tabs } from '@/components/ui/tabs-simple'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { SearchInput } from '@/components/ui/search-input'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, DataTableWrapper,
} from '@/components/ui/table'
import { useAuth } from '@/contexts/AuthContext'
import { fetchApi } from '@/lib/api'
import type { Category } from '@/types'
import {
  createPrintJob,
  fetchBarcodeTemplates,
  fetchPrintableProducts,
  fetchPrintJobs,
  fetchPrintLogs,
  verifyBarcodeScan,
  fetchPrinterDiagnostics,
  generateCalibrationLabel,
  cancelPrintJob,
  downloadPrintOutput,
  openPdfFromBase64,
  type LabelFormat,
  type LabelTemplateId,
  type PrinterProfileId,
  type PrintLogEntry,
} from '@/lib/barcodePrint'
import { normalizeScannedBarcode } from '@/lib/posBarcode'
import { toast } from 'sonner'
import {
  Printer, History, ScanLine, Settings2, ListOrdered, RefreshCw, Download,
} from 'lucide-react'

const TABS = [
  { id: 'print', label: 'Print' },
  { id: 'batch', label: 'Batch' },
  { id: 'reprint', label: 'Reprint' },
  { id: 'logs', label: 'Logs' },
  { id: 'verify', label: 'Verify' },
  { id: 'calibration', label: 'Calibrate' },
  { id: 'diagnostics', label: 'Diagnostics' },
  { id: 'queue', label: 'Queue' },
]

const defaultPrintOptions = {
  template: '50x25' as LabelTemplateId,
  format: 'pdf' as LabelFormat,
  printerProfile: 'generic' as PrinterProfileId,
  copiesPerLabel: 1,
}

function PrintOptionsForm({
  options,
  onChange,
  templates,
  profiles,
}: {
  options: typeof defaultPrintOptions
  onChange: (o: typeof defaultPrintOptions) => void
  templates: { id: string; name: string }[]
  profiles: { id: string; name: string }[]
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <Label>Label size</Label>
        <Select
          value={options.template}
          onChange={(e) => onChange({ ...options, template: e.target.value as LabelTemplateId })}
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </Select>
      </div>
      <div>
        <Label>Output format</Label>
        <Select
          value={options.format}
          onChange={(e) => onChange({ ...options, format: e.target.value as LabelFormat })}
        >
          <option value="pdf">PDF (batch sheets)</option>
          <option value="png">PNG (JSON array)</option>
          <option value="zpl">ZPL (Zebra)</option>
          <option value="tspl">TSPL (TSC / TVS)</option>
        </Select>
      </div>
      <div>
        <Label>Printer profile</Label>
        <Select
          value={options.printerProfile}
          onChange={(e) => onChange({ ...options, printerProfile: e.target.value as PrinterProfileId })}
        >
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>
      </div>
      <div>
        <Label>Copies per label</Label>
        <Input
          type="number"
          min={1}
          max={99}
          value={options.copiesPerLabel}
          onChange={(e) =>
            onChange({ ...options, copiesPerLabel: Math.max(1, Math.min(99, parseInt(e.target.value, 10) || 1)) })
          }
        />
      </div>
    </div>
  )
}

function handleJobResult(result: {
  jobNumber: string
  format: LabelFormat
  mimeType?: string
  outputPayload?: string
}) {
  if (!result.outputPayload || !result.mimeType) {
    toast.success(`Job ${result.jobNumber} completed`)
    return
  }
  const ext = result.format === 'pdf' ? 'pdf' : result.format === 'png' ? 'json' : 'txt'
  if (result.mimeType === 'application/pdf') {
    openPdfFromBase64(result.outputPayload)
  } else {
    downloadPrintOutput(result.outputPayload, result.mimeType, `${result.jobNumber}.${ext}`)
  }
  toast.success(`Job ${result.jobNumber} — ${result.format.toUpperCase()} ready`)
}

export default function BarcodeCenterPage() {
  const { hasPermission } = useAuth()
  const queryClient = useQueryClient()
  const canPrint = hasPermission('barcode:print')
  const canManage = hasPermission('barcode:manage')

  const [tab, setTab] = useState('print')
  const [printOptions, setPrintOptions] = useState(defaultPrintOptions)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [productSearch, setProductSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [selectedLogIds, setSelectedLogIds] = useState<Set<string>>(new Set())
  const [verifyInput, setVerifyInput] = useState('')
  const [verifyResult, setVerifyResult] = useState<Awaited<ReturnType<typeof verifyBarcodeScan>> | null>(null)
  const [diagProfile, setDiagProfile] = useState<PrinterProfileId>('generic')

  const { data: meta } = useQuery({
    queryKey: ['barcode-templates'],
    queryFn: fetchBarcodeTemplates,
  })

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => fetchApi<Category[]>('/categories'),
  })

  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ['barcode-printable-products', categoryFilter, productSearch],
    queryFn: () =>
      fetchPrintableProducts({
        categoryId: categoryFilter || undefined,
        search: productSearch || undefined,
        status: 'active',
      }),
  })

  const { data: jobsData, refetch: refetchJobs } = useQuery({
    queryKey: ['barcode-print-jobs'],
    queryFn: () => fetchPrintJobs(1),
    enabled: tab === 'queue',
  })

  const { data: logsData, refetch: refetchLogs } = useQuery({
    queryKey: ['barcode-print-logs'],
    queryFn: () => fetchPrintLogs(1),
    enabled: tab === 'logs' || tab === 'reprint',
  })

  const { data: diagnostics } = useQuery({
    queryKey: ['barcode-diagnostics', diagProfile],
    queryFn: () => fetchPrinterDiagnostics(diagProfile),
    enabled: tab === 'diagnostics',
  })

  const templates = meta?.templates ?? []
  const profiles = meta?.profiles ?? []

  const toggleProduct = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAllProducts = () => {
    if (selectedIds.size === products.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(products.map((p) => p._id)))
  }

  const printMutation = useMutation({
    mutationFn: createPrintJob,
    onSuccess: (result) => {
      handleJobResult(result)
      queryClient.invalidateQueries({ queryKey: ['barcode-print-jobs'] })
      queryClient.invalidateQueries({ queryKey: ['barcode-print-logs'] })
      setSelectedIds(new Set())
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err.response?.data?.message || 'Print job failed'),
  })

  const batchCategoryMutation = useMutation({
    mutationFn: (categoryId: string) =>
      createPrintJob({
        source: 'category',
        categoryId,
        ...printOptions,
      }),
    onSuccess: handleJobResult,
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err.response?.data?.message || 'Batch print failed'),
  })

  const inventoryMutation = useMutation({
    mutationFn: () =>
      createPrintJob({
        source: 'inventory',
        allInventory: true,
        statusFilter: 'active',
        ...printOptions,
      }),
    onSuccess: handleJobResult,
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err.response?.data?.message || 'Inventory print failed'),
  })

  const reprintMutation = useMutation({
    mutationFn: (logIds: string[]) =>
      createPrintJob({
        source: 'reprint',
        reprintLogIds: logIds,
        ...printOptions,
      }),
    onSuccess: (result) => {
      handleJobResult(result)
      setSelectedLogIds(new Set())
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err.response?.data?.message || 'Reprint failed'),
  })

  const calibrationMutation = useMutation({
    mutationFn: () => generateCalibrationLabel(printOptions),
    onSuccess: (result) => {
      if (result.mimeType === 'application/pdf') openPdfFromBase64(result.payload)
      else downloadPrintOutput(result.payload, result.mimeType, `calibration-${result.jobNumber}.txt`)
      toast.success(`Calibration label ${result.jobNumber} generated`)
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err.response?.data?.message || 'Calibration failed'),
  })

  const verifyMutation = useMutation({
    mutationFn: verifyBarcodeScan,
    onSuccess: setVerifyResult,
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err.response?.data?.message || 'Verification failed'),
  })

  const statusBadge = (status: string) => {
    const variant =
      status === 'completed' ? 'success' : status === 'failed' ? 'danger' : status === 'processing' ? 'warning' : 'muted'
    return <Badge variant={variant as 'success' | 'danger' | 'warning' | 'muted'}>{status}</Badge>
  }

  const logs = logsData?.logs ?? []
  const jobs = jobsData?.jobs ?? []

  const toggleLog = (id: string) => {
    setSelectedLogIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <Layout>
      <PageHeader
        title="Barcode Center"
        description="Batch printing, reprints, scan verification, and thermal printer tools"
      />

      <div className="mb-6">
        <Tabs tabs={TABS} active={tab} onChange={setTab} className="flex-wrap" />
      </div>

      {!canPrint && (
        <Card className="mb-4 border-amber-200 bg-amber-50">
          <CardContent className="py-3 text-[var(--text-sm)] text-amber-900">
            You have view-only access. Ask an admin for <strong>barcode:print</strong> permission to run print jobs.
          </CardContent>
        </Card>
      )}

      {(tab === 'print' || tab === 'batch') && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings2 className="h-4 w-4" /> Print settings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PrintOptionsForm
              options={printOptions}
              onChange={setPrintOptions}
              templates={templates}
              profiles={profiles}
            />
          </CardContent>
        </Card>
      )}

      {tab === 'print' && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Printer className="h-4 w-4" /> Multi-select products
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!canPrint || selectedIds.size === 0 || printMutation.isPending}
                loading={printMutation.isPending}
                onClick={() =>
                  printMutation.mutate({
                    source: selectedIds.size === 1 ? 'single' : 'batch',
                    productIds: [...selectedIds],
                    ...printOptions,
                  })
                }
              >
                Print selected ({selectedIds.size})
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <SearchInput
                placeholder="Search name, SKU, barcode…"
                value={productSearch}
                onChange={setProductSearch}
                className="max-w-xs"
              />
              <Select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="max-w-[200px]"
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c._id} value={c._id}>{c.name}</option>
                ))}
              </Select>
              <Checkbox
                checked={selectedIds.size === products.length && products.length > 0}
                onChange={toggleAllProducts}
                label="Select all visible"
              />
            </div>
            <DataTableWrapper>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>Barcode</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Stock</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productsLoading && (
                    <TableRow><TableCell colSpan={5}>Loading…</TableCell></TableRow>
                  )}
                  {!productsLoading && products.length === 0 && (
                    <TableRow><TableCell colSpan={5}>No printable products</TableCell></TableRow>
                  )}
                  {products.map((p) => (
                    <TableRow key={p._id}>
                      <TableCell>
                        <Checkbox checked={selectedIds.has(p._id)} onChange={() => toggleProduct(p._id)} />
                      </TableCell>
                      <TableCell className="font-data text-[var(--text-sm)]">{p.barcode}</TableCell>
                      <TableCell>{p.name}</TableCell>
                      <TableCell className="font-data text-[var(--text-sm)]">{p.sku}</TableCell>
                      <TableCell>{p.currentStock?.toLocaleString('en-IN')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DataTableWrapper>
          </CardContent>
        </Card>
      )}

      {tab === 'batch' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Print by category</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {categories.map((c) => (
                <div key={c._id} className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <p className="font-medium">{c.name}</p>
                    <p className="text-[var(--text-xs)] text-[var(--color-text-muted)]">
                      Prefix: {c.barcodePrefix || c.code.slice(0, 3)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!canPrint || batchCategoryMutation.isPending}
                    onClick={() => batchCategoryMutation.mutate(c._id)}
                  >
                    Print category
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Print all inventory</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-[var(--text-sm)] text-[var(--color-text-muted)]">
                Generates labels for every active product with a barcode ({products.length} visible in current filter).
              </p>
              <Button
                disabled={!canPrint || inventoryMutation.isPending}
                loading={inventoryMutation.isPending}
                onClick={() => inventoryMutation.mutate()}
              >
                Print all active inventory
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'reprint' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <RefreshCw className="h-4 w-4" /> Reprint from history
            </CardTitle>
            <Button
              disabled={!canPrint || selectedLogIds.size === 0 || reprintMutation.isPending}
              loading={reprintMutation.isPending}
              onClick={() => reprintMutation.mutate([...selectedLogIds])}
            >
              Reprint selected ({selectedLogIds.size})
            </Button>
          </CardHeader>
          <CardContent>
            <PrintOptionsForm
              options={printOptions}
              onChange={setPrintOptions}
              templates={templates}
              profiles={profiles}
            />
            <div className="mt-4">
              <LogsTable
                logs={logs}
                selectable
                selectedIds={selectedLogIds}
                onToggle={toggleLog}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {tab === 'logs' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4" /> Print history
            </CardTitle>
            <Button variant="secondary" size="sm" onClick={() => refetchLogs()}>
              Refresh
            </Button>
          </CardHeader>
          <CardContent>
            <LogsTable logs={logs} />
          </CardContent>
        </Card>
      )}

      {tab === 'verify' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ScanLine className="h-4 w-4" /> Scan verification
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex max-w-lg gap-2">
              <Input
                placeholder="Scan or enter barcode…"
                value={verifyInput}
                onChange={(e) => setVerifyInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && verifyInput.trim()) {
                    verifyMutation.mutate(normalizeScannedBarcode(verifyInput))
                  }
                }}
              />
              <Button
                loading={verifyMutation.isPending}
                onClick={() => verifyInput.trim() && verifyMutation.mutate(normalizeScannedBarcode(verifyInput))}
              >
                Verify
              </Button>
            </div>
            {verifyResult && (
              <div className={`rounded-md border p-4 ${verifyResult.found ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                {verifyResult.found ? (
                  <>
                    <p className="font-semibold text-green-900">Match found — scanner readable</p>
                    <p className="mt-1 font-data">{verifyResult.barcode}</p>
                    <p className="text-[var(--text-sm)]">{verifyResult.product?.name} · {verifyResult.product?.sku}</p>
                    {verifyResult.validation && !verifyResult.validation.valid && (
                      <p className="mt-2 text-[var(--text-sm)] text-amber-800">
                        Label warnings: {verifyResult.validation.warnings?.join('; ')}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-red-900">{verifyResult.message || 'No matching active product'}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'calibration' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Label calibration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-[var(--text-sm)] text-[var(--color-text-muted)]">
              Generates a test Code128 label (ABC-000001) to align printer offset, DPI, and quiet zones before bulk printing.
            </p>
            <PrintOptionsForm
              options={printOptions}
              onChange={setPrintOptions}
              templates={templates}
              profiles={profiles}
            />
            <Button
              disabled={!canPrint || calibrationMutation.isPending}
              loading={calibrationMutation.isPending}
              onClick={() => calibrationMutation.mutate()}
            >
              Generate calibration label
            </Button>
          </CardContent>
        </Card>
      )}

      {tab === 'diagnostics' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Printer diagnostics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-w-xs">
              <Label>Profile</Label>
              <Select
                value={diagProfile}
                onChange={(e) => setDiagProfile(e.target.value as PrinterProfileId)}
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </div>
            {diagnostics && (
              <>
                <p className="text-[var(--text-sm)]">
                  Recommended format: <strong>{diagnostics.recommendedFormat.toUpperCase()}</strong>
                  {' · '}{diagnostics.profile.defaultDpi} DPI
                </p>
                <ul className="space-y-2">
                  {diagnostics.checks.map((c) => (
                    <li key={c.id} className="flex items-start gap-2 rounded-md border p-3 text-[var(--text-sm)]">
                      <Badge variant="success">{c.status}</Badge>
                      <div>
                        <p className="font-medium">{c.label}</p>
                        <p className="text-[var(--color-text-muted)]">{c.detail}</p>
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="text-[var(--text-xs)] text-[var(--color-text-muted)]">{diagnostics.profile.notes}</p>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'queue' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <ListOrdered className="h-4 w-4" /> Print job queue
            </CardTitle>
            <Button variant="secondary" size="sm" onClick={() => refetchJobs()}>
              Refresh
            </Button>
          </CardHeader>
          <CardContent>
            <DataTableWrapper>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Labels</TableHead>
                    <TableHead>Format</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.length === 0 && (
                    <TableRow><TableCell colSpan={8}>No print jobs yet</TableCell></TableRow>
                  )}
                  {jobs.map((job) => (
                    <TableRow key={job._id}>
                      <TableCell className="font-data font-medium">{job.jobNumber}</TableCell>
                      <TableCell>{statusBadge(job.status)}</TableCell>
                      <TableCell>{job.source}</TableCell>
                      <TableCell>{job.processedLabels}/{job.totalLabels}</TableCell>
                      <TableCell>{job.format.toUpperCase()}</TableCell>
                      <TableCell>{job.userName}</TableCell>
                      <TableCell>{new Date(job.createdAt).toLocaleString()}</TableCell>
                      <TableCell>
                        {job.status === 'completed' && canPrint && (
                          <Button
                            variant="ghost"
                            size="sm"
                            iconOnly
                            title="Download"
                            onClick={async () => {
                              try {
                                const full = await fetchApi<{ outputPayload?: string; outputMimeType?: string; format: LabelFormat }>(
                                  `/barcode/print/jobs/${job._id}`
                                )
                                if (full.outputPayload && full.outputMimeType) {
                                  const ext = job.format === 'pdf' ? 'pdf' : 'txt'
                                  downloadPrintOutput(full.outputPayload, full.outputMimeType, `${job.jobNumber}.${ext}`)
                                }
                              } catch {
                                toast.error('Download failed')
                              }
                            }}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        )}
                        {canManage && ['queued', 'processing'].includes(job.status) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => cancelPrintJob(job._id).then(() => refetchJobs())}
                          >
                            Cancel
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DataTableWrapper>
          </CardContent>
        </Card>
      )}
    </Layout>
  )
}

function LogsTable({
  logs,
  selectable,
  selectedIds,
  onToggle,
}: {
  logs: PrintLogEntry[]
  selectable?: boolean
  selectedIds?: Set<string>
  onToggle?: (id: string) => void
}) {
  return (
    <DataTableWrapper>
      <Table>
        <TableHeader>
          <TableRow>
            {selectable && <TableHead className="w-10" />}
            <TableHead>Time</TableHead>
            <TableHead>Barcode</TableHead>
            <TableHead>Product</TableHead>
            <TableHead>Copies</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Job</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.length === 0 && (
            <TableRow><TableCell colSpan={selectable ? 7 : 6}>No print logs</TableCell></TableRow>
          )}
          {logs.map((log) => (
            <TableRow key={log._id}>
              {selectable && onToggle && selectedIds && (
                <TableCell>
                  <Checkbox checked={selectedIds.has(log._id)} onChange={() => onToggle(log._id)} />
                </TableCell>
              )}
              <TableCell className="text-[var(--text-xs)]">{new Date(log.createdAt).toLocaleString()}</TableCell>
              <TableCell className="font-data">{log.barcode}</TableCell>
              <TableCell>{log.productName}</TableCell>
              <TableCell>{log.copies}</TableCell>
              <TableCell><Badge variant="muted">{log.action}</Badge></TableCell>
              <TableCell className="font-data text-[var(--text-xs)]">{log.printJob?.jobNumber ?? '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </DataTableWrapper>
  )
}
