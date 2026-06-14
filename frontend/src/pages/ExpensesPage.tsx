import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, postApi, deleteApi } from '@/lib/api'
import type { Expense } from '@/types'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, StatCard } from '@/components/ui/card'
import { Drawer } from '@/components/ui/modal'
import {
  ImportantSection,
  importantInputClass,
  importantLabelClass,
} from '@/components/ui/important-field'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, DataTableWrapper,
} from '@/components/ui/table'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'

const emptyForm = () => ({ reason: '', amount: 0 })

export default function ExpensesPage() {
  const queryClient = useQueryClient()
  const { hasPermission } = useAuth()
  const canManage = hasPermission('accounting:manage')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm())

  const { data, isLoading } = useQuery({
    queryKey: ['expenses'],
    queryFn: async () => {
      const { data } = await api.get('/expenses', { params: { limit: 200 } })
      return data
    },
  })

  const createExpense = useMutation({
    mutationFn: () => postApi('/expenses', form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      setShowForm(false)
      setForm(emptyForm())
      toast.success('Expense recorded')
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err.response?.data?.message || 'Failed to record expense'),
  })

  const removeExpense = useMutation({
    mutationFn: (id: string) => deleteApi(`/expenses/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      toast.success('Expense removed')
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err.response?.data?.message || 'Failed to delete expense'),
  })

  const expenses: Expense[] = data?.data || []
  const totalAmount = expenses.reduce((sum, e) => sum + (e.amount || 0), 0)

  const handleDelete = (expense: Expense) => {
    if (!window.confirm(`Delete expense "${expense.reason}" (${formatCurrency(expense.amount)})?`)) return
    removeExpense.mutate(expense._id)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Business Expenses"
        description="Record day-to-day costs — parcel fees, transport, packing, and other expenses"
        actions={
          canManage ? (
            <Button onClick={() => setShowForm(true)}>
              <Plus className="h-[18px] w-[18px]" /> Add Expense
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Total Recorded" value={formatCurrency(totalAmount)} accent="danger" />
        <StatCard label="Entries" value={String(expenses.length)} accent="accent" />
      </div>

      <Drawer
        open={showForm}
        onClose={() => {
          setShowForm(false)
          setForm(emptyForm())
        }}
        title="Add Expense"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setShowForm(false)
                setForm(emptyForm())
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => createExpense.mutate()}
              disabled={!form.reason.trim() || form.amount <= 0}
              loading={createExpense.isPending}
            >
              Save Expense
            </Button>
          </div>
        }
      >
        <ImportantSection
          title="Expense Details"
          description="Only reason and amount are needed — e.g. Parcel charges, courier, packing material."
        >
          <div className="grid gap-4">
            <div>
              <label className={importantLabelClass}>Reason *</label>
              <Input
                className={importantInputClass}
                placeholder="e.g. Parcel fees, transport, packing"
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                autoFocus
              />
            </div>
            <div>
              <label className={importantLabelClass}>Amount (Rs.) *</label>
              <Input
                type="number"
                min={0.01}
                step="any"
                className={importantInputClass}
                placeholder="Enter amount spent"
                value={form.amount || ''}
                onChange={(e) => setForm({ ...form, amount: Number(e.target.value) || 0 })}
              />
            </div>
          </div>
        </ImportantSection>
      </Drawer>

      <Card className="overflow-hidden">
        <DataTableWrapper
          loading={isLoading}
          empty={!isLoading && expenses.length === 0}
          emptyTitle="No expenses recorded yet"
          emptyAction={canManage ? 'Add Expense' : undefined}
          onEmptyAction={canManage ? () => setShowForm(true) : undefined}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead align="right">Amount</TableHead>
                <TableHead>Recorded By</TableHead>
                {canManage && <TableHead align="right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.map((expense) => (
                <TableRow key={expense._id}>
                  <TableCell>{formatDate(expense.createdAt)}</TableCell>
                  <TableCell className="font-medium">{expense.reason}</TableCell>
                  <TableCell align="right" mono>{formatCurrency(expense.amount)}</TableCell>
                  <TableCell>
                    {typeof expense.createdBy === 'object' && expense.createdBy?.name
                      ? expense.createdBy.name
                      : '—'}
                  </TableCell>
                  {canManage && (
                    <TableCell align="right">
                      <Button
                        size="sm"
                        variant="danger"
                        iconOnly
                        title="Delete expense"
                        onClick={() => handleDelete(expense)}
                        disabled={removeExpense.isPending}
                      >
                        <Trash2 className="h-[18px] w-[18px]" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataTableWrapper>
      </Card>
    </div>
  )
}
