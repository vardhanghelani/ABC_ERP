import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi, postApi, api, downloadAuthenticated } from '@/lib/api'
import type { CustomerSummary, LedgerEntry } from '@/types'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/number-input'
import { Card, StatCard } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert } from '@/components/ui/alert'
import { Drawer } from '@/components/ui/modal'
import { Tabs } from '@/components/ui/tabs-simple'
import { PageSkeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, DataTableWrapper,
} from '@/components/ui/table'
import { formatCurrency, formatDate, formatDateTime, getAmountDue } from '@/lib/utils'
import {
  IndianRupee, Download, MessageCircle, AlertTriangle,
  CreditCard, TrendingUp, Shield,
} from 'lucide-react'
import { toast } from 'sonner'

const RISK_VARIANTS: Record<string, 'success' | 'warning' | 'danger' | 'muted'> = {
  low: 'success', medium: 'warning', high: 'danger', very_high: 'danger',
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState('ledger')
  const [showPayment, setShowPayment] = useState(false)
  const [paymentForm, setPaymentForm] = useState({
    amount: 0, method: 'cash', reference: '', bankName: '', chequeNumber: '',
    upiTransactionId: '', notes: '', date: new Date().toISOString().split('T')[0], isAdvance: false,
  })

  const { data: summary, isLoading } = useQuery({
    queryKey: ['customer-summary', id],
    queryFn: () => fetchApi<CustomerSummary>(`/customers/${id}/summary`),
    enabled: !!id,
  })

  const { data: ledgerData, isLoading: ledgerLoading } = useQuery({
    queryKey: ['customer-ledger', id],
    queryFn: async () => {
      const { data } = await api.get(`/customers/${id}/ledger`, { params: { limit: 500, sort: 'asc' } })
      return data
    },
    enabled: !!id && tab === 'ledger',
  })

  const receivePayment = useMutation({
    mutationFn: () => postApi(`/customers/${id}/receive-payment`, paymentForm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-summary', id] })
      queryClient.invalidateQueries({ queryKey: ['customer-ledger', id] })
      setShowPayment(false)
      toast.success('Payment recorded successfully')
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err.response?.data?.message || 'Payment failed'),
  })

  const sendWhatsApp = async () => {
    const data = await fetchApi<{ whatsappUrl: string }>(`/customers/${id}/statement/whatsapp`)
    window.open(data.whatsappUrl, '_blank')
  }

  if (isLoading || !summary) return <PageSkeleton />

  const { customer } = summary
  const ledger: LedgerEntry[] = ledgerData?.data || []
  const riskVariant = RISK_VARIANTS[summary.riskCategory || 'low'] || 'muted'
  const amountDue = summary.amountDue ?? getAmountDue(summary.currentOutstanding, summary.advanceBalance)
  const lastLedgerBalance = ledger.length > 0 ? ledger[ledger.length - 1].runningBalance : 0

  return (
    <div className="space-y-6">
      <PageHeader
        title={customer.name}
        description={`${customer.phone}${customer.gstNumber ? ` · GST: ${customer.gstNumber}` : ''}`}
        breadcrumbs={[
          { label: 'Customers', href: '/customers' },
          { label: customer.name },
        ]}
        badge={
          <>
            <Badge variant={riskVariant} className="normal-case capitalize">
              <Shield className="h-3 w-3 mr-1" />{summary.riskCategory?.replace('_', ' ') || 'low'} risk
            </Badge>
            {summary.creditTermType === 'long_term' && (
              <Badge variant="default" className="normal-case">Long Term ACC</Badge>
            )}
          </>
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => downloadAuthenticated(`/customers/${id}/statement/pdf`, `statement-${id}.pdf`).catch(() => toast.error('Failed to download statement'))}>
              <Download className="h-[18px] w-[18px]" /> PDF Statement
            </Button>
            <Button variant="secondary" onClick={sendWhatsApp}>
              <MessageCircle className="h-[18px] w-[18px]" /> WhatsApp
            </Button>
            <Button onClick={() => setShowPayment(true)}>
              <IndianRupee className="h-[18px] w-[18px]" /> Receive Payment
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Net Outstanding"
          value={formatCurrency(amountDue)}
          icon={IndianRupee}
          accent={amountDue > 0 ? 'warning' : 'success'}
          hint="What the customer actually owes today (unpaid invoices minus advance on account)."
        />
        <StatCard label="Overdue" value={formatCurrency(summary.overdueAmount)} icon={AlertTriangle} accent={summary.overdueAmount > 0 ? 'danger' : 'success'} />
        <StatCard label="Available Credit" value={formatCurrency(summary.availableCredit)} icon={CreditCard} accent="info" />
        <StatCard label="Credit Used" value={`${summary.creditUsagePercent.toFixed(0)}%`} icon={TrendingUp} accent={summary.creditUsagePercent >= 80 ? 'warning' : 'accent'} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: 'Total Purchases', value: formatCurrency(summary.totalPurchases) },
          { label: 'Total Payments', value: formatCurrency(summary.totalPayments) },
          { label: 'Pending Invoices', value: String(summary.pendingInvoices) },
          { label: 'Credit Limit', value: formatCurrency(summary.creditLimit) },
          { label: 'Credit Type', value: summary.creditTermLabel || (summary.creditTermType === 'long_term' ? 'Long Term (ACC)' : 'Short Term') },
        ].map(({ label, value }) => (
          <Card key={label} className="p-4">
            <p className="text-[var(--text-xs)] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">{label}</p>
            <p className="mt-1 text-[var(--text-lg)] font-semibold text-[var(--color-text-primary)]">{value}</p>
          </Card>
        ))}
      </div>

      {summary.creditTermType === 'long_term' && (
        <Alert variant="info" title="Long Term Credit (ACC)" description="Running account ledger like a bank passbook. Every sale appears as debit, every payment as credit." />
      )}

      {summary.creditUsagePercent >= 80 && (
        <Alert variant="warning" title="High credit usage" description={`Credit usage at ${summary.creditUsagePercent.toFixed(0)}% of limit (${formatCurrency(summary.creditLimit)}). Consider collecting payment before further credit sales.`} />
      )}

      <Tabs tabs={[
        { id: 'ledger', label: 'Ledger' },
        { id: 'invoices', label: 'Pending Invoices' },
      ]} active={tab} onChange={setTab} />

      {tab === 'ledger' && (
        <Card className="overflow-hidden">
          <div className="border-b border-[var(--color-border-soft)] px-4 py-3 text-[var(--text-sm)] text-[var(--color-text-secondary)]">
            Entries shown in the order they were recorded. Debits (invoices) increase balance owed; credits (payments) reduce it.
            Closing balance = net outstanding ({formatCurrency(amountDue)}).
          </div>
          <DataTableWrapper loading={ledgerLoading} empty={!ledgerLoading && ledger.length === 0} emptyTitle="No ledger entries yet">
            <div className="max-h-[500px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead align="right">Debit</TableHead>
                    <TableHead align="right">Credit</TableHead>
                    <TableHead align="right">Balance</TableHead>
                    <TableHead>Remarks</TableHead>
                    <TableHead>By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledger.map((entry) => (
                    <TableRow key={entry._id}>
                      <TableCell>
                        <div>{formatDate(entry.createdAt || entry.date)}</div>
                        {entry.createdAt && (
                          <div className="text-[var(--text-xs)] text-[var(--color-text-muted)]">{formatDateTime(entry.createdAt)}</div>
                        )}
                      </TableCell>
                      <TableCell mono className="text-[var(--text-xs)]">{entry.referenceNumber}</TableCell>
                      <TableCell><Badge variant="muted" className="normal-case capitalize">{entry.transactionType.replace(/_/g, ' ')}</Badge></TableCell>
                      <TableCell align="right" mono className="text-[var(--color-danger)]">{entry.debit > 0 ? formatCurrency(entry.debit) : '—'}</TableCell>
                      <TableCell align="right" mono className="text-[var(--color-success)]">{entry.credit > 0 ? formatCurrency(entry.credit) : '—'}</TableCell>
                      <TableCell align="right" mono className="font-semibold">{formatCurrency(entry.runningBalance)}</TableCell>
                      <TableCell className="max-w-[150px] truncate text-[var(--text-xs)] text-[var(--color-text-muted)]">{entry.remarks || '—'}</TableCell>
                      <TableCell className="text-[var(--text-xs)]">{entry.createdByName}</TableCell>
                    </TableRow>
                  ))}
                  {ledger.length > 0 && (
                    <TableRow className="bg-[var(--color-surface-muted)]/60 font-semibold">
                      <TableCell colSpan={5} align="right">Closing balance (net outstanding)</TableCell>
                      <TableCell align="right" mono>{formatCurrency(lastLedgerBalance)}</TableCell>
                      <TableCell colSpan={2} className="text-[var(--text-xs)] text-[var(--color-text-muted)]">
                        Should match {formatCurrency(amountDue)}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </DataTableWrapper>
        </Card>
      )}

      {tab === 'invoices' && (
        <Card className="overflow-hidden">
          <DataTableWrapper empty={summary.pendingInvoiceList.length === 0} emptyTitle="No pending invoices">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead align="right">Total</TableHead>
                  <TableHead align="right">Balance Due</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Overdue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.pendingInvoiceList.map((inv) => (
                  <TableRow key={inv._id}>
                    <TableCell className="font-medium" mono>{inv.invoiceNumber}</TableCell>
                    <TableCell align="right" mono>{formatCurrency(inv.total)}</TableCell>
                    <TableCell align="right" mono className="font-semibold">{formatCurrency(inv.balanceDue)}</TableCell>
                    <TableCell>{inv.dueDate ? formatDate(inv.dueDate) : '—'}</TableCell>
                    <TableCell>
                      {inv.daysOverdue > 0 ? (
                        <Badge variant="danger">{inv.daysOverdue} days</Badge>
                      ) : (
                        <Badge variant="success">Current</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataTableWrapper>
        </Card>
      )}

      <Drawer
        open={showPayment}
        onClose={() => setShowPayment(false)}
        title="Receive Payment"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowPayment(false)}>Cancel</Button>
            <Button onClick={() => receivePayment.mutate()} disabled={!paymentForm.amount} loading={receivePayment.isPending}>Record Payment</Button>
          </div>
        }
      >
        <p className="mb-4 text-[var(--text-sm)] text-[var(--color-text-muted)]">
          Net outstanding: <strong>{formatCurrency(amountDue)}</strong>. Payment applies to invoices first; any extra is stored as advance.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Amount *</Label>
            <div className="flex gap-2">
              <MoneyInput value={paymentForm.amount} onChange={(v) => setPaymentForm({ ...paymentForm, amount: v })} />
              {amountDue > 0 && (
                <Button type="button" variant="secondary" onClick={() => setPaymentForm({ ...paymentForm, amount: amountDue, isAdvance: false })}>
                  Full
                </Button>
              )}
            </div>
          </div>
          <div>
            <Label>Payment Mode</Label>
            <Select value={paymentForm.method} onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })}>
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="bank">Bank Transfer</option>
              <option value="cheque">Cheque</option>
              <option value="credit_adjustment">Credit Adjustment</option>
            </Select>
          </div>
          <div><Label>Payment Date</Label><Input type="date" value={paymentForm.date} onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })} /></div>
          <div><Label>Reference / UPI ID</Label><Input value={paymentForm.upiTransactionId || paymentForm.reference} onChange={(e) => setPaymentForm({ ...paymentForm, upiTransactionId: e.target.value, reference: e.target.value })} /></div>
          <div><Label>Bank Name</Label><Input value={paymentForm.bankName} onChange={(e) => setPaymentForm({ ...paymentForm, bankName: e.target.value })} /></div>
          <div><Label>Cheque Number</Label><Input value={paymentForm.chequeNumber} onChange={(e) => setPaymentForm({ ...paymentForm, chequeNumber: e.target.value })} /></div>
          <div className="sm:col-span-2"><Label>Notes</Label><Input value={paymentForm.notes} onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })} /></div>
          <Checkbox checked={paymentForm.isAdvance} onChange={(v) => setPaymentForm({ ...paymentForm, isAdvance: v })} label="Record as advance payment" />
        </div>
      </Drawer>
    </div>
  )
}
