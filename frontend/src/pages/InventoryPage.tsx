import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, fetchApi, postApi } from '@/lib/api'
import type { Product } from '@/types'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { IntegerInput } from '@/components/ui/number-input'
import { Card, StatCard } from '@/components/ui/card'
import { Badge, stockStatusVariant, stockStatusLabel } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { StockBar } from '@/components/ui/stock-bar'
import { Drawer } from '@/components/ui/modal'
import { Tabs } from '@/components/ui/tabs-simple'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, DataTableWrapper,
} from '@/components/ui/table'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Package, ArrowDownToLine, ArrowUpFromLine, Plus } from 'lucide-react'
import { toast } from 'sonner'

export default function InventoryPage() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState('overview')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [movement, setMovement] = useState({ productId: '', quantity: 0, notes: '', type: 'stock_in' })

  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['products-inventory'],
    queryFn: async () => {
      const { data } = await api.get('/products', { params: { limit: 100 } })
      return data
    },
  })

  const { data: transactionsData, isLoading: txLoading } = useQuery({
    queryKey: ['inventory-transactions'],
    queryFn: async () => {
      const { data } = await api.get('/inventory/transactions', { params: { limit: 30 } })
      return data
    },
  })

  const { data: valuation } = useQuery({
    queryKey: ['inventory-valuation'],
    queryFn: () => fetchApi<{ purchaseValue: number; wholesaleValue: number; retailValue: number; totalUnits: number }>('/inventory/valuation'),
  })

  const stockMutation = useMutation({
    mutationFn: (data: typeof movement) => {
      const endpoint = data.type === 'stock_in' ? 'stock-in' : data.type === 'stock_out' ? 'stock-out' : 'adjust'
      return postApi(`/inventory/${endpoint}`, { productId: data.productId, quantity: data.quantity, notes: data.notes })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products-inventory'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-transactions'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-valuation'] })
      setMovement({ productId: '', quantity: 0, notes: '', type: 'stock_in' })
      setDrawerOpen(false)
      toast.success('Stock updated')
    },
    onError: (err: { response?: { data?: { message?: string; errors?: { message: string }[] } } }) => {
      const detail = err.response?.data?.errors?.[0]?.message
      toast.error(detail || err.response?.data?.message || 'Failed to record stock movement')
    },
  })

  const products: Product[] = productsData?.data || []
  const transactions = transactionsData?.data || []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock Movements"
        description="Stock movements, history, and valuation"
        actions={
          <Button onClick={() => setDrawerOpen(true)}>
            <Plus className="h-[18px] w-[18px]" /> Record Movement
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Units" value={String(valuation?.totalUnits || 0)} icon={Package} accent="accent" />
        <StatCard label="Purchase Value" value={formatCurrency(valuation?.purchaseValue || 0)} accent="info" />
        <StatCard label="Wholesale Value" value={formatCurrency(valuation?.wholesaleValue || 0)} accent="warning" />
        <StatCard label="Retail Value" value={formatCurrency(valuation?.retailValue || 0)} accent="success" />
      </div>

      <Tabs tabs={[
        { id: 'overview', label: 'Stock Overview' },
        { id: 'history', label: 'Movement History' },
      ]} active={tab} onChange={setTab} />

      {tab === 'overview' && (
        <Card className="overflow-hidden">
          <DataTableWrapper loading={productsLoading} empty={!productsLoading && products.length === 0}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead align="right">Reorder</TableHead>
                  <TableHead align="right">Value</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => (
                  <TableRow key={p._id}>
                    <TableCell><Badge variant="muted">{p.sku}</Badge></TableCell>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell><StockBar current={p.currentStock} max={p.reorderLevel * 3} /></TableCell>
                    <TableCell align="right" mono>{p.reorderLevel}</TableCell>
                    <TableCell align="right" mono>{formatCurrency(p.currentStock * p.purchasePrice)}</TableCell>
                    <TableCell>
                      <Badge variant={stockStatusVariant(p.currentStock, p.reorderLevel)}>
                        {stockStatusLabel(p.currentStock, p.reorderLevel)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataTableWrapper>
        </Card>
      )}

      {tab === 'history' && (
        <Card className="overflow-hidden">
          <DataTableWrapper loading={txLoading} empty={!txLoading && transactions.length === 0} emptyTitle="No movements yet">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead align="right">Qty</TableHead>
                  <TableHead align="right">Before</TableHead>
                  <TableHead align="right">After</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((t: { _id: string; createdAt: string; type: string; product: { name: string }; quantity: number; previousStock: number; newStock: number }) => (
                  <TableRow key={t._id}>
                    <TableCell>{formatDate(t.createdAt)}</TableCell>
                    <TableCell><Badge variant="muted" className="normal-case">{t.type.replace(/_/g, ' ')}</Badge></TableCell>
                    <TableCell>{t.product?.name}</TableCell>
                    <TableCell align="right" mono>{t.quantity}</TableCell>
                    <TableCell align="right" mono>{t.previousStock}</TableCell>
                    <TableCell align="right" mono>{t.newStock}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataTableWrapper>
        </Card>
      )}

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Record Stock Movement"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDrawerOpen(false)}>Cancel</Button>
            <Button
              onClick={() => stockMutation.mutate(movement)}
              disabled={!movement.productId || !movement.quantity}
              loading={stockMutation.isPending}
            >
              {movement.type === 'stock_in' ? <ArrowDownToLine className="h-[18px] w-[18px]" /> : <ArrowUpFromLine className="h-[18px] w-[18px]" />}
              Submit
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <Label>Type</Label>
            <Select value={movement.type} onChange={(e) => setMovement({ ...movement, type: e.target.value })}>
              <option value="stock_in">Stock In</option>
              <option value="stock_out">Stock Out</option>
              <option value="adjustment">Adjustment</option>
            </Select>
          </div>
          <div>
            <Label>Product</Label>
            <Select value={movement.productId} onChange={(e) => setMovement({ ...movement, productId: e.target.value })}>
              <option value="">Select Product</option>
              {products.map((p) => <option key={p._id} value={p._id}>{p.name} ({p.currentStock})</option>)}
            </Select>
          </div>
          <div><Label>Quantity</Label><IntegerInput min={1} value={movement.quantity} onChange={(v) => setMovement({ ...movement, quantity: Math.max(1, v) })} /></div>
          <div><Label>Notes</Label><Input value={movement.notes} onChange={(e) => setMovement({ ...movement, notes: e.target.value })} /></div>
        </div>
      </Drawer>
    </div>
  )
}
