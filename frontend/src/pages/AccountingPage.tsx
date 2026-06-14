import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, fetchApi, postApi } from '@/lib/api'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/number-input'
import { Card, StatCard } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import { Tabs } from '@/components/ui/tabs-simple'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, DataTableWrapper,
} from '@/components/ui/table'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'

export default function AccountingPage() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState('payments')
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [paymentForm, setPaymentForm] = useState({
    type: 'receipt', entity: 'customer', customer: '', amount: 0, method: 'cash', notes: '',
  })

  const { data: paymentsData, isLoading: paymentsLoading } = useQuery({
    queryKey: ['payments'],
    queryFn: async () => {
      const { data } = await api.get('/payments')
      return data
    },
  })

  const { data: cashBook } = useQuery({
    queryKey: ['cash-book'],
    queryFn: () => fetchApi<{ payments: unknown[]; summary: { receipts: number; payments: number }; balance: number }>('/accounting/cash-book'),
    enabled: tab === 'cash-book',
  })

  const createPayment = useMutation({
    mutationFn: () => postApi('/payments', paymentForm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      setShowPaymentForm(false)
      toast.success('Payment recorded')
    },
  })

  const payments = paymentsData?.data || []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounting"
        description="Payments and cash book"
        actions={
          <Button onClick={() => setShowPaymentForm(true)}>
            <Plus className="h-[18px] w-[18px]" /> Record Payment
          </Button>
        }
      />

      <Tabs tabs={[
        { id: 'payments', label: 'Payments' },
        { id: 'cash-book', label: 'Cash Book' },
      ]} active={tab} onChange={setTab} />

      <Modal
        open={showPaymentForm}
        onClose={() => setShowPaymentForm(false)}
        title="Record Payment"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowPaymentForm(false)}>Cancel</Button>
            <Button onClick={() => createPayment.mutate()} loading={createPayment.isPending}>Save</Button>
          </div>
        }
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <div><Label>Type</Label><Select value={paymentForm.type} onChange={(e) => setPaymentForm({ ...paymentForm, type: e.target.value })}><option value="receipt">Receipt</option><option value="payment">Payment</option></Select></div>
          <div><Label>Amount</Label><MoneyInput value={paymentForm.amount} onChange={(v) => setPaymentForm({ ...paymentForm, amount: v })} /></div>
          <div><Label>Method</Label><Select value={paymentForm.method} onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })}><option value="cash">Cash</option><option value="upi">UPI</option><option value="bank">Bank</option></Select></div>
        </div>
      </Modal>

      {tab === 'payments' && (
        <Card className="overflow-hidden">
          <DataTableWrapper loading={paymentsLoading} empty={!paymentsLoading && payments.length === 0}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead align="right">Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p: { _id: string; paymentNumber: string; type: string; amount: number; method: string; date: string }) => (
                  <TableRow key={p._id}>
                    <TableCell mono>{p.paymentNumber}</TableCell>
                    <TableCell><Badge variant="muted" className="normal-case capitalize">{p.type}</Badge></TableCell>
                    <TableCell align="right" mono>{formatCurrency(p.amount)}</TableCell>
                    <TableCell className="capitalize">{p.method}</TableCell>
                    <TableCell>{formatDate(p.date)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataTableWrapper>
        </Card>
      )}

      {tab === 'cash-book' && cashBook && (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Receipts" value={formatCurrency(cashBook.summary.receipts)} accent="success" />
          <StatCard label="Payments" value={formatCurrency(cashBook.summary.payments)} accent="danger" />
          <StatCard label="Balance" value={formatCurrency(cashBook.balance)} accent="accent" />
        </div>
      )}
    </div>
  )
}
