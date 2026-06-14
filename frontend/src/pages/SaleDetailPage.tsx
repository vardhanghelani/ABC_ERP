import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchApi, downloadAuthenticated } from '@/lib/api'
import type { Sale } from '@/types'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageSkeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, DataTableWrapper,
} from '@/components/ui/table'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ArrowLeft, Download, Receipt } from 'lucide-react'
import { toast } from 'sonner'

const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'danger' | 'muted'> = {
  completed: 'success',
  pending: 'warning',
  cancelled: 'danger',
  returned: 'muted',
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash',
  upi: 'UPI',
  bank: 'Bank Transfer',
  credit: 'Credit',
  card: 'Card',
  cheque: 'Cheque',
  credit_adjustment: 'Credit Adjustment',
}

export default function SaleDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: sale, isLoading } = useQuery({
    queryKey: ['sale', id],
    queryFn: () => fetchApi<Sale>(`/sales/${id}`),
    enabled: !!id,
  })

  if (isLoading || !sale) return <PageSkeleton />

  const statusVariant = STATUS_VARIANTS[sale.status] || 'muted'
  const customer = typeof sale.customer === 'object' ? sale.customer : null

  return (
    <div className="space-y-6">
      <PageHeader
        title={sale.invoiceNumber}
        description={`Sale invoice · ${formatDate(sale.createdAt)}`}
        breadcrumbs={[
          { label: 'Sales & Invoices', href: '/sales' },
          { label: sale.invoiceNumber },
        ]}
        badge={
          <Badge variant={statusVariant} className="normal-case capitalize">
            {sale.status}
          </Badge>
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/sales')}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <Button
              onClick={() =>
                downloadAuthenticated(`/sales/${sale._id}/pdf`, `${sale.invoiceNumber}.pdf`).catch(() =>
                  toast.error('Failed to download invoice')
                )
              }
            >
              <Download className="h-4 w-4" />
              Download PDF
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-[var(--text-xs)] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                Bill To
              </p>
              <p className="mt-1 font-medium text-[var(--color-text-primary)]">
                {customer?.name || sale.customerName || 'Walk-in Customer'}
              </p>
              {customer?.phone && (
                <p className="text-[var(--text-sm)] text-[var(--color-text-muted)]">{customer.phone}</p>
              )}
              {customer?.address && (
                <p className="text-[var(--text-sm)] text-[var(--color-text-muted)]">{customer.address}</p>
              )}
              {customer?.gstNumber && (
                <p className="text-[var(--text-sm)] text-[var(--color-text-muted)]">GST: {customer.gstNumber}</p>
              )}
            </div>
            <div>
              <p className="text-[var(--text-xs)] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                Invoice Details
              </p>
              <dl className="mt-1 space-y-1 text-[var(--text-sm)]">
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--color-text-muted)]">Invoice No</dt>
                  <dd className="font-mono font-medium">{sale.invoiceNumber}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--color-text-muted)]">Date</dt>
                  <dd>{formatDate(sale.createdAt)}</dd>
                </div>
                {sale.dueDate && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-[var(--color-text-muted)]">Due Date</dt>
                    <dd>{formatDate(sale.dueDate)}</dd>
                  </div>
                )}
                {sale.createdBy && typeof sale.createdBy === 'object' && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-[var(--color-text-muted)]">Created By</dt>
                    <dd>{(sale.createdBy as { name: string }).name}</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center gap-2">
              <Receipt className="h-4 w-4 text-[var(--color-text-muted)]" />
              <h3 className="font-semibold text-[var(--color-text-primary)]">Line Items</h3>
            </div>
            <DataTableWrapper empty={sale.items.length === 0} emptyTitle="No items">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead align="center">Qty</TableHead>
                    <TableHead align="right">Rate</TableHead>
                    <TableHead align="right">Discount</TableHead>
                    <TableHead align="right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sale.items.map((item, index) => (
                    <TableRow key={`${item.sku}-${index}`}>
                      <TableCell mono>{index + 1}</TableCell>
                      <TableCell mono className="text-[var(--color-text-muted)]">{item.sku}</TableCell>
                      <TableCell className="font-medium">{item.productName}</TableCell>
                      <TableCell align="center" mono>{item.quantity}</TableCell>
                      <TableCell align="right" mono>{formatCurrency(item.unitPrice)}</TableCell>
                      <TableCell align="right" mono>
                        {item.discount > 0 ? formatCurrency(item.discount) : '—'}
                      </TableCell>
                      <TableCell align="right" mono>{formatCurrency(item.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DataTableWrapper>
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-5 space-y-3">
            <h3 className="font-semibold text-[var(--color-text-primary)]">Summary</h3>
            <dl className="space-y-2 text-[var(--text-sm)]">
              <div className="flex justify-between">
                <dt className="text-[var(--color-text-muted)]">Subtotal</dt>
                <dd className="font-mono">{formatCurrency(sale.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--color-text-muted)]">Discount</dt>
                <dd className="font-mono">{formatCurrency(sale.discount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--color-text-muted)]">
                  Tax{sale.taxRate ? ` (${sale.taxRate}%)` : ''}
                </dt>
                <dd className="font-mono">{formatCurrency(sale.tax)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--color-text-muted)]">Round Off</dt>
                <dd className="font-mono">{formatCurrency(sale.roundOff)}</dd>
              </div>
              <div className="border-t border-[var(--color-border-soft)] pt-2 flex justify-between font-semibold">
                <dt>Grand Total</dt>
                <dd className="font-mono text-[var(--color-text-primary)]">{formatCurrency(sale.total)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--color-text-muted)]">Paid</dt>
                <dd className="font-mono text-[var(--color-success)]">{formatCurrency(sale.paidAmount)}</dd>
              </div>
              {(sale.balanceDue ?? 0) > 0 && (
                <div className="flex justify-between">
                  <dt className="text-[var(--color-text-muted)]">Balance Due</dt>
                  <dd className="font-mono text-[var(--color-warning)]">{formatCurrency(sale.balanceDue ?? 0)}</dd>
                </div>
              )}
              {(sale.changeAmount ?? 0) > 0 && (
                <div className="flex justify-between">
                  <dt className="text-[var(--color-text-muted)]">Change</dt>
                  <dd className="font-mono">{formatCurrency(sale.changeAmount ?? 0)}</dd>
                </div>
              )}
            </dl>
          </Card>

          {sale.payments.length > 0 && (
            <Card className="p-5 space-y-3">
              <h3 className="font-semibold text-[var(--color-text-primary)]">Payments</h3>
              <dl className="space-y-2 text-[var(--text-sm)]">
                {sale.payments.map((payment, index) => (
                  <div key={index} className="flex justify-between gap-2">
                    <dt className="text-[var(--color-text-muted)] capitalize">
                      {PAYMENT_LABELS[payment.method] || payment.method}
                      {payment.reference ? ` · ${payment.reference}` : ''}
                    </dt>
                    <dd className="font-mono">{formatCurrency(payment.amount)}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          )}

          {sale.notes && (
            <Card className="p-5">
              <h3 className="mb-2 font-semibold text-[var(--color-text-primary)]">Notes</h3>
              <p className="text-[var(--text-sm)] text-[var(--color-text-muted)]">{sale.notes}</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
