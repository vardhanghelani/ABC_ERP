import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, postApi } from '@/lib/api'
import type { Supplier } from '@/types'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { SearchInput } from '@/components/ui/search-input'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Drawer } from '@/components/ui/modal'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, DataTableWrapper,
} from '@/components/ui/table'
import { Plus } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'

export default function SuppliersPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', email: '', gstNumber: '', contactPerson: '' })

  const { data, isLoading } = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const { data } = await api.get('/suppliers')
      return data
    },
  })

  const createSupplier = useMutation({
    mutationFn: () => postApi('/suppliers', form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      setShowForm(false)
      setForm({ name: '', phone: '', email: '', gstNumber: '', contactPerson: '' })
      toast.success('Supplier created')
    },
  })

  const suppliers: Supplier[] = (data?.data || []).filter((s: Supplier) =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.phone.includes(search)
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suppliers"
        description="Manage supplier profiles and payables"
        actions={
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-[18px] w-[18px]" /> Add Supplier
          </Button>
        }
      />

      <div className="max-w-md">
        <SearchInput placeholder="Search suppliers..." value={search} onChange={setSearch} />
      </div>

      <Drawer
        open={showForm}
        onClose={() => setShowForm(false)}
        title="New Supplier"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={() => createSupplier.mutate()} disabled={!form.name || !form.phone} loading={createSupplier.isPending}>Save</Button>
          </div>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>Phone *</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><Label>Contact Person</Label><Input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} /></div>
          <div><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="sm:col-span-2"><Label>GST Number</Label><Input value={form.gstNumber} onChange={(e) => setForm({ ...form, gstNumber: e.target.value })} /></div>
        </div>
      </Drawer>

      <Card className="overflow-hidden">
        <DataTableWrapper loading={isLoading} empty={!isLoading && suppliers.length === 0} emptyTitle="No suppliers found" emptyAction="Add Supplier" onEmptyAction={() => setShowForm(true)}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead align="right">Outstanding</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.map((s) => (
                <TableRow key={s._id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell mono>{s.phone}</TableCell>
                  <TableCell>{s.contactPerson || '—'}</TableCell>
                  <TableCell align="right">
                    <Badge variant={s.outstandingAmount > 0 ? 'warning' : 'success'}>{formatCurrency(s.outstandingAmount)}</Badge>
                  </TableCell>
                  <TableCell><Badge variant="success">Active</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataTableWrapper>
      </Card>
    </div>
  )
}
