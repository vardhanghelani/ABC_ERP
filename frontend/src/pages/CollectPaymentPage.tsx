import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi, postApi } from '@/lib/api'
import type { Customer } from '@/types'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/number-input'
import { SearchInput } from '@/components/ui/search-input'
import { Card, StatCard } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert } from '@/components/ui/alert'
import { formatCurrency, formatDate, cn, getAmountDue } from '@/lib/utils'
import { IndianRupee, User, FileText, RotateCcw, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface PaymentResult {
  paymentNumber: string
  amount: number
  outstandingAmount: number
  advanceBalance: number
  netOutstanding: number
  amountDue: number
}

interface PaymentContext {
  customer: Customer
  currentOutstanding: number
  netOutstanding: number
  amountDue: number
  creditTermType?: string
  creditTermLabel?: string
  pendingInvoices: number
  pendingInvoiceList: {
    _id: string
    invoiceNumber: string
    balanceDue: number
    dueDate?: string
    daysOverdue: number
  }[]
}

const defaultForm = () => ({
  amount: 0,
  method: 'cash',
  reference: '',
  bankName: '',
  chequeNumber: '',
  upiTransactionId: '',
  notes: 'Payment collection visit — no purchase',
  date: new Date().toISOString().split('T')[0],
  isAdvance: false,
})

export default function CollectPaymentPage() {
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 200)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const customerId = selectedCustomer?._id ?? ''
  const [paymentForm, setPaymentForm] = useState(defaultForm)
  const [lastReceipt, setLastReceipt] = useState<{ number: string; amount: number } | null>(null)

  const { data: customers = [], isFetching: customersFetching } = useQuery({
    queryKey: ['customers-picker', debouncedSearch],
    queryFn: () =>
      fetchApi<Customer[]>('/customers/picker', {
        search: debouncedSearch.trim() || undefined,
        limit: 100,
      }),
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  })

  useEffect(() => {
    const preselect = searchParams.get('customer')
    if (!preselect || selectedCustomer?._id === preselect) return
    const fromList = customers.find((c) => c._id === preselect)
    if (fromList) {
      setSelectedCustomer(fromList)
      return
    }
    fetchApi<Customer>(`/customers/${preselect}`).then(setSelectedCustomer).catch(() => {})
  }, [searchParams, customers, selectedCustomer?._id])

  const { data: context, isFetching: contextFetching } = useQuery({
    queryKey: ['customer-payment-context', customerId],
    queryFn: () => fetchApi<PaymentContext>(`/customers/${customerId}/payment-context`),
    enabled: !!customerId,
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  })

  const amountDue = context?.amountDue
    ?? getAmountDue(
      context?.currentOutstanding ?? selectedCustomer?.outstandingAmount ?? 0,
      context?.customer?.advanceBalance ?? selectedCustomer?.advanceBalance ?? 0,
    )
  const displayCustomer = context?.customer ?? selectedCustomer
  const isLongTerm = (context?.creditTermType ?? selectedCustomer?.creditTermType) === 'long_term'

  const receivePayment = useMutation({
    mutationFn: () =>
      postApi<PaymentResult>(`/customers/${customerId}/receive-payment`, {
        amount: paymentForm.amount,
        method: paymentForm.method,
        reference: paymentForm.reference || undefined,
        bankName: paymentForm.bankName || undefined,
        chequeNumber: paymentForm.chequeNumber || undefined,
        upiTransactionId: paymentForm.upiTransactionId || undefined,
        notes: paymentForm.notes || undefined,
        date: paymentForm.date,
        isAdvance: paymentForm.isAdvance,
      }),
    onSuccess: (data) => {
      setLastReceipt({ number: data.paymentNumber, amount: data.amount })
      setPaymentForm(defaultForm())

      setSelectedCustomer((prev) =>
        prev
          ? { ...prev, outstandingAmount: data.outstandingAmount, advanceBalance: data.advanceBalance }
          : prev
      )

      queryClient.setQueryData<PaymentContext>(['customer-payment-context', customerId], (old) =>
        old
          ? {
              ...old,
              currentOutstanding: data.outstandingAmount,
              netOutstanding: data.netOutstanding,
              amountDue: data.amountDue,
              customer: { ...old.customer, outstandingAmount: data.outstandingAmount, advanceBalance: data.advanceBalance },
            }
          : old
      )

      queryClient.setQueryData<Customer[]>(['customers-picker', debouncedSearch], (old) =>
        old?.map((c) =>
          c._id === customerId
            ? { ...c, outstandingAmount: data.outstandingAmount, advanceBalance: data.advanceBalance }
            : c
        )
      )

      toast.success(`Payment recorded — ${data.paymentNumber}`)
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err.response?.data?.message || 'Payment failed'),
  })

  const handleCustomerChange = (customer: Customer | null) => {
    setSelectedCustomer(customer)
    setLastReceipt(null)
    setPaymentForm(defaultForm())
  }

  const handleSelectById = (id: string) => {
    if (!id) {
      handleCustomerChange(null)
      return
    }
    const customer = customers.find((c) => c._id === id)
    if (customer) handleCustomerChange(customer)
  }

  const handlePayFull = () => {
    if (amountDue > 0) {
      setPaymentForm((f) => ({ ...f, amount: amountDue, isAdvance: false }))
    }
  }

  const canSubmit = !!customerId && paymentForm.amount > 0 && !receivePayment.isPending

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Collect Payment" description="Customer visit to pay credit — no purchase required" />

      <Card className="p-5 space-y-4">
        <div>
          <Label>Select customer *</Label>
          <SearchInput placeholder="Search by name or phone..." value={search} onChange={setSearch} />
        </div>

        <Select value={customerId} onChange={(e) => handleSelectById(e.target.value)}>
          <option value="">Choose customer...</option>
          {customers.map((c) => (
            <option key={c._id} value={c._id}>
              {c.name} — {c.phone}
              {getAmountDue(c.outstandingAmount, c.advanceBalance) > 0
                ? ` (Due: ${formatCurrency(getAmountDue(c.outstandingAmount, c.advanceBalance))})`
                : ''}
            </option>
          ))}
        </Select>

        <div className="rounded-[var(--radius-md)] border border-[var(--color-border-soft)] overflow-hidden">
          {customersFetching && customers.length === 0 ? (
            <p className="flex items-center gap-2 p-4 text-[var(--text-sm)] text-[var(--color-text-muted)]">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading...
            </p>
          ) : customers.length === 0 ? (
            <p className="p-4 text-[var(--text-sm)] text-[var(--color-text-muted)]">No customers found.</p>
          ) : (
            <div className="max-h-56 overflow-y-auto divide-y divide-[var(--color-border-soft)]">
              {customers.map((c) => {
                const selected = c._id === customerId
                return (
                  <button
                    key={c._id}
                    type="button"
                    onClick={() => handleCustomerChange(c)}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-[var(--color-bg-elevated)]',
                      selected && 'bg-[var(--color-accent-light)]'
                    )}
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{c.name}</p>
                      <p className="text-[var(--text-xs)] text-[var(--color-text-muted)]">{c.phone}</p>
                    </div>
                    {getAmountDue(c.outstandingAmount, c.advanceBalance) > 0 ? (
                      <Badge variant="warning" className="normal-case tracking-normal shrink-0">
                        {formatCurrency(getAmountDue(c.outstandingAmount, c.advanceBalance))}
                      </Badge>
                    ) : (
                      <Badge variant="success" className="normal-case tracking-normal shrink-0">Clear</Badge>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </Card>

      {customerId && displayCustomer && (
        <>
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-[var(--color-accent-light)] p-3">
                  <User className="h-6 w-6 text-[var(--color-accent)]" />
                </div>
                <div>
                  <h2 className="text-[var(--text-xl)] font-bold">{displayCustomer.name}</h2>
                  <p className="text-[var(--color-text-muted)]">{displayCustomer.phone}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant={isLongTerm ? 'default' : 'muted'} className="normal-case">
                      {isLongTerm ? 'Long Term ACC' : 'Short Term Credit'}
                    </Badge>
                    {context && context.pendingInvoices > 0 && (
                      <Badge variant="muted">{context.pendingInvoices} pending</Badge>
                    )}
                  </div>
                </div>
              </div>
              <StatCard
                label="Net Outstanding"
                value={formatCurrency(amountDue)}
                accent={amountDue > 0 ? 'warning' : 'success'}
              />
            </div>
            <Link
              to={`/customers/${customerId}`}
              className="mt-4 inline-flex items-center gap-1 text-[var(--text-sm)] text-[var(--color-accent)] hover:underline"
            >
              <FileText className="h-[18px] w-[18px]" /> Full ledger
            </Link>
          </Card>

          {lastReceipt && (
            <Alert
              variant="success"
              title="Payment Recorded"
              description={`Receipt ${lastReceipt.number} — ${formatCurrency(lastReceipt.amount)}`}
            />
          )}

          <Card className="p-5">
            <h3 className="mb-4 font-semibold">Record Payment</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <Label>Amount *</Label>
                <div className="flex gap-2">
                  <MoneyInput
                    value={paymentForm.amount}
                    onChange={(v) => setPaymentForm({ ...paymentForm, amount: v })}
                  />
                  {amountDue > 0 && (
                    <Button type="button" variant="secondary" onClick={handlePayFull}>
                      Full
                    </Button>
                  )}
                </div>
              </div>
              <div>
                <Label>Mode</Label>
                <Select value={paymentForm.method} onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })}>
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="bank">Bank</option>
                  <option value="cheque">Cheque</option>
                </Select>
              </div>
              <div>
                <Label>Date</Label>
                <Input type="date" value={paymentForm.date} onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })} />
              </div>
              <div>
                <Label>Reference</Label>
                <Input
                  value={paymentForm.reference}
                  onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value, upiTransactionId: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Notes</Label>
                <Input value={paymentForm.notes} onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })} />
              </div>
              <Checkbox
                checked={paymentForm.isAdvance}
                onChange={(v) => setPaymentForm({ ...paymentForm, isAdvance: v })}
                label="Advance only (not against outstanding)"
              />
            </div>

            {paymentForm.amount > 0 && !paymentForm.isAdvance && (
              <p className="mt-3 text-[var(--text-sm)] text-[var(--color-text-muted)]">
                After payment: <strong>{formatCurrency(Math.max(0, amountDue - paymentForm.amount))}</strong> net outstanding
              </p>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              <Button size="lg" disabled={!canSubmit} loading={receivePayment.isPending} onClick={() => receivePayment.mutate()}>
                <IndianRupee className="h-[18px] w-[18px]" /> Collect {paymentForm.amount > 0 ? formatCurrency(paymentForm.amount) : 'Payment'}
              </Button>
              {lastReceipt && (
                <Button variant="secondary" onClick={() => { setLastReceipt(null); handleCustomerChange(null) }}>
                  <RotateCcw className="h-[18px] w-[18px]" /> Next
                </Button>
              )}
            </div>
          </Card>

          {context && context.pendingInvoiceList.length > 0 && (
            <Card className="p-5">
              <h3 className="mb-3 text-[var(--text-sm)] font-semibold">Pending invoices</h3>
              <div className="space-y-2">
                {context.pendingInvoiceList.map((inv) => (
                  <div key={inv._id} className="flex justify-between text-[var(--text-sm)]">
                    <span className="font-data">{inv.invoiceNumber}</span>
                    <span className="font-data">{formatCurrency(inv.balanceDue)}</span>
                    <span className="text-[var(--color-text-muted)]">{inv.dueDate ? formatDate(inv.dueDate) : 'ACC'}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {contextFetching && !context && (
            <p className="text-center text-[var(--text-xs)] text-[var(--color-text-muted)]">Loading invoice details...</p>
          )}
        </>
      )}
    </div>
  )
}
