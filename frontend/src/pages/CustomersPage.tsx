import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api, postApi, putApi, deleteApi } from '@/lib/api'
import type { Customer } from '@/types'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { IntegerInput, MoneyInput } from '@/components/ui/number-input'
import { SearchInput } from '@/components/ui/search-input'
import { Checkbox } from '@/components/ui/checkbox'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Drawer } from '@/components/ui/modal'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, DataTableWrapper,
} from '@/components/ui/table'
import { Plus, Eye, IndianRupee, Pencil, Trash2 } from 'lucide-react'
import { formatCurrency, getAmountDue } from '@/lib/utils'
import { toast } from 'sonner'

type CustomerForm = {
  name: string
  phone: string
  whatsapp: string
  email: string
  gstNumber: string
  address: string
  city: string
  state: string
  customerType: string
  creditTermType: 'short_term' | 'long_term'
  creditLimit: number
  creditDays: number
  blockOnCreditLimit: boolean
}

const emptyForm = (): CustomerForm => ({
  name: '',
  phone: '',
  whatsapp: '',
  email: '',
  gstNumber: '',
  address: '',
  city: '',
  state: '',
  customerType: 'wholesale',
  creditTermType: 'short_term',
  creditLimit: 0,
  creditDays: 30,
  blockOnCreditLimit: false,
})

const customerToForm = (c: Customer): CustomerForm => ({
  name: c.name,
  phone: c.phone,
  whatsapp: c.whatsapp || '',
  email: c.email || '',
  gstNumber: c.gstNumber || '',
  address: c.address || '',
  city: c.city || '',
  state: c.state || '',
  customerType: c.customerType || 'wholesale',
  creditTermType: c.creditTermType === 'long_term' ? 'long_term' : 'short_term',
  creditLimit: c.creditLimit ?? 0,
  creditDays: c.creditDays ?? 30,
  blockOnCreditLimit: c.blockOnCreditLimit ?? false,
})

export default function CustomersPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [form, setForm] = useState(emptyForm())

  const { data, isLoading } = useQuery({
    queryKey: ['customers', search],
    queryFn: async () => {
      const { data } = await api.get('/customers', { params: { search, limit: 50 } })
      return data
    },
  })

  const createCustomer = useMutation({
    mutationFn: () => postApi('/customers', form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      closeDrawer()
      toast.success('Customer created')
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err.response?.data?.message || 'Failed to create customer'),
  })

  const updateCustomer = useMutation({
    mutationFn: ({ id, data }: { id: string; data: CustomerForm }) => putApi(`/customers/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      closeDrawer()
      toast.success('Customer updated')
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err.response?.data?.message || 'Failed to update customer'),
  })

  const deactivateCustomer = useMutation({
    mutationFn: (id: string) => deleteApi(`/customers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      toast.success('Customer deactivated')
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err.response?.data?.message || 'Failed to deactivate customer'),
  })

  const customers: Customer[] = data?.data || []

  const closeDrawer = () => {
    setShowForm(false)
    setEditingCustomer(null)
    setForm(emptyForm())
  }

  const openCreate = () => {
    setEditingCustomer(null)
    setForm(emptyForm())
    setShowForm(true)
  }

  const openEdit = (customer: Customer) => {
    setEditingCustomer(customer)
    setForm(customerToForm(customer))
    setShowForm(true)
  }

  const handleSubmit = () => {
    if (editingCustomer) {
      updateCustomer.mutate({ id: editingCustomer._id, data: form })
    } else {
      createCustomer.mutate()
    }
  }

  const handleDeactivate = (customer: Customer) => {
    const due = getAmountDue(customer.outstandingAmount, customer.advanceBalance)
    const msg = due > 0
      ? `Deactivate "${customer.name}"?\n\nThey still owe ${formatCurrency(due)} (net outstanding). History is kept but they won't appear in active lists.`
      : `Deactivate "${customer.name}"?\n\nThey will be hidden from POS and active customer lists.`
    if (!window.confirm(msg)) return
    deactivateCustomer.mutate(customer._id)
  }

  const formValid = form.name.trim().length > 0 && form.phone.replace(/\D/g, '').length >= 10

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description="Manage customer profiles, credit limits, and outstanding balances"
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-[18px] w-[18px]" /> Add Customer
          </Button>
        }
      />

      <div className="max-w-md">
        <SearchInput placeholder="Search by name, phone..." value={search} onChange={setSearch} />
      </div>

      <Drawer
        open={showForm}
        onClose={closeDrawer}
        title={editingCustomer ? 'Edit Customer' : 'New Customer'}
        wide
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeDrawer}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={!formValid}
              loading={createCustomer.isPending || updateCustomer.isPending}
            >
              {editingCustomer ? 'Save Changes' : 'Save Customer'}
            </Button>
          </div>
        }
      >
        {editingCustomer && (
          <div className="mb-4 flex flex-wrap gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-soft)] bg-[var(--color-bg-sunken)] px-4 py-3 text-[var(--text-sm)]">
            <span><strong>Net outstanding:</strong> {formatCurrency(getAmountDue(editingCustomer.outstandingAmount, editingCustomer.advanceBalance))}</span>
            <span><strong>Total purchases:</strong> {formatCurrency(editingCustomer.totalPurchases)}</span>
            <span className="text-[var(--color-text-muted)]">Balances are updated by sales and payments, not here.</span>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>Mobile *</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><Label>WhatsApp</Label><Input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} /></div>
          <div><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><Label>GST Number</Label><Input value={form.gstNumber} onChange={(e) => setForm({ ...form, gstNumber: e.target.value })} /></div>
          <div><Label>City</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
          <div><Label>State</Label><Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></div>
          <div className="sm:col-span-2"><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div>
            <Label>Customer Type</Label>
            <Select value={form.customerType} onChange={(e) => setForm({ ...form, customerType: e.target.value })}>
              <option value="wholesale">Wholesale</option>
              <option value="retail">Retail</option>
              <option value="distributor">Distributor</option>
            </Select>
          </div>
          <div>
            <Label>Credit Type *</Label>
            <Select value={form.creditTermType} onChange={(e) => setForm({ ...form, creditTermType: e.target.value as 'short_term' | 'long_term' })}>
              <option value="short_term">Short Term — Invoice credit with due date</option>
              <option value="long_term">Long Term (ACC) — Running account</option>
            </Select>
          </div>
          <div><Label>Credit Limit (₹)</Label><MoneyInput value={form.creditLimit} onChange={(v) => setForm({ ...form, creditLimit: v })} /></div>
          <div>
            <Label>Credit Days</Label>
            <IntegerInput min={0} value={form.creditDays} onChange={(v) => setForm({ ...form, creditDays: v })} disabled={form.creditTermType === 'long_term'} />
          </div>
          <div className="flex items-end pb-1">
            <Checkbox
              checked={form.blockOnCreditLimit}
              onChange={(v) => setForm({ ...form, blockOnCreditLimit: v })}
              label="Block sales when credit limit exceeded"
            />
          </div>
        </div>
      </Drawer>

      <Card className="overflow-hidden">
        <DataTableWrapper loading={isLoading} empty={!isLoading && customers.length === 0} emptyTitle="No customers found" emptyAction="Add Customer" onEmptyAction={openCreate}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Credit</TableHead>
                <TableHead align="right">Limit</TableHead>
                <TableHead align="right">Net Outstanding</TableHead>
                <TableHead align="right">Available</TableHead>
                <TableHead>Status</TableHead>
                <TableHead align="center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((c) => {
                const amountDue = getAmountDue(c.outstandingAmount, c.advanceBalance)
                const available = Math.max(0, c.creditLimit - amountDue)
                return (
                  <TableRow key={c._id}>
                    <TableCell>
                      <Link to={`/customers/${c._id}`} className="font-medium text-[var(--color-accent)] hover:underline">{c.name}</Link>
                    </TableCell>
                    <TableCell mono>{c.phone}</TableCell>
                    <TableCell className="capitalize text-[var(--color-text-muted)]">{c.customerType || 'wholesale'}</TableCell>
                    <TableCell>
                      <Badge variant={c.creditTermType === 'long_term' ? 'default' : 'muted'} className="normal-case">
                        {c.creditTermType === 'long_term' ? 'ACC' : 'Short Term'}
                      </Badge>
                    </TableCell>
                    <TableCell align="right" mono>{formatCurrency(c.creditLimit)}</TableCell>
                    <TableCell align="right">
                      <Badge variant={amountDue > 0 ? 'warning' : 'success'}>{formatCurrency(amountDue)}</Badge>
                    </TableCell>
                    <TableCell align="right" mono className="text-[var(--color-text-muted)]">{formatCurrency(available)}</TableCell>
                    <TableCell><Badge variant={c.isActive ? 'success' : 'muted'}>{c.isActive ? 'Active' : 'Inactive'}</Badge></TableCell>
                    <TableCell align="center">
                      <div className="flex justify-center gap-1">
                        {amountDue > 0 && (
                          <Link to={`/collect-payment?customer=${c._id}`}>
                            <Button size="sm" variant="ghost" iconOnly title="Collect payment">
                              <IndianRupee className="h-[18px] w-[18px]" />
                            </Button>
                          </Link>
                        )}
                        <Button size="sm" variant="secondary" iconOnly title="Edit customer" onClick={() => openEdit(c)}>
                          <Pencil className="h-[18px] w-[18px]" />
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          iconOnly
                          title="Deactivate customer"
                          onClick={() => handleDeactivate(c)}
                          disabled={!c.isActive || deactivateCustomer.isPending}
                        >
                          <Trash2 className="h-[18px] w-[18px]" />
                        </Button>
                        <Link to={`/customers/${c._id}`}>
                          <Button size="sm" variant="ghost" iconOnly aria-label="View customer">
                            <Eye className="h-[18px] w-[18px]" />
                          </Button>
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </DataTableWrapper>
      </Card>
    </div>
  )
}
