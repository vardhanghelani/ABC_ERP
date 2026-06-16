import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, postApi, downloadAuthenticated } from '@/lib/api'
import type { Product } from '@/types'
import { invalidateProductQueries } from '@/lib/productQueries'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { IntegerInput } from '@/components/ui/number-input'
import { Card, StatCard } from '@/components/ui/card'
import { Badge, stockStatusVariant, stockStatusLabel } from '@/components/ui/badge'
import { ProductPicker } from '@/components/products/ProductPicker'
import { ProductSpecBadges } from '@/components/pos/ProductSpecBadges'
import { StockBar } from '@/components/ui/stock-bar'
import { Drawer } from '@/components/ui/modal'
import { Tabs } from '@/components/ui/tabs-simple'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, DataTableWrapper,
} from '@/components/ui/table'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Package, ArrowDownToLine, ArrowUpFromLine, Plus, FileDown } from 'lucide-react'
import { toast } from 'sonner'

type MovementType = 'stock_in' | 'stock_out' | 'adjustment'

interface MovementForm {
  productId: string
  quantity: number
  notes: string
  type: MovementType
}

const emptyMovement = (): MovementForm => ({
  productId: '',
  quantity: 0,
  notes: '',
  type: 'stock_in',
})

export default function InventoryPage() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState('overview')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [movement, setMovement] = useState<MovementForm>(emptyMovement())
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)

  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['products-inventory'],
    queryFn: async () => {
      const { data } = await api.get('/products', { params: { status: 'active', limit: 500 } })
      return data
    },
  })

  const { data: transactionsData, isLoading: txLoading } = useQuery({
    queryKey: ['inventory-transactions'],
    queryFn: async () => {
      const { data } = await api.get('/inventory/transactions', { params: { limit: 50 } })
      return data
    },
  })

  const { data: valuation } = useQuery({
    queryKey: ['inventory-valuation'],
    queryFn: async () => {
      const { data } = await api.get('/inventory/valuation')
      return data.data as {
        purchaseValue: number
        wholesaleValue: number
        retailValue: number
        totalUnits: number
      }
    },
  })

  const stockMutation = useMutation({
    mutationFn: async (data: MovementForm) => {
      const endpoint =
        data.type === 'stock_in' ? 'stock-in' : data.type === 'stock_out' ? 'stock-out' : 'adjust'
      return postApi(`/inventory/${endpoint}`, {
        productId: data.productId,
        quantity: data.quantity,
        notes: data.notes || undefined,
      })
    },
    onSuccess: (_result, variables) => {
      invalidateProductQueries(queryClient)
      const message =
        variables.type === 'adjustment'
          ? 'Stock level updated'
          : variables.type === 'stock_in'
            ? 'Stock added'
            : 'Stock removed'
      toast.success(message)
      setMovement(emptyMovement())
      setSelectedProduct(null)
      setDrawerOpen(false)
    },
    onError: (err: { response?: { data?: { message?: string; errors?: { message: string }[] } } }) => {
      const detail = err.response?.data?.errors?.[0]?.message
      toast.error(detail || err.response?.data?.message || 'Failed to record stock movement')
    },
  })

  const handleSubmit = () => {
    if (!movement.productId) {
      toast.error('Select a product')
      return
    }

    if (movement.type === 'adjustment') {
      if (movement.quantity < 0) {
        toast.error('Stock level cannot be negative')
        return
      }
    } else if (movement.quantity < 1) {
      toast.error('Quantity must be at least 1')
      return
    }

    if (movement.type === 'stock_out' && selectedProduct && movement.quantity > selectedProduct.currentStock) {
      toast.error(`Only ${selectedProduct.currentStock} in stock — cannot remove ${movement.quantity}`)
      return
    }

    stockMutation.mutate(movement)
  }

  const handleTypeChange = (type: MovementType) => {
    setMovement((prev) => ({
      ...prev,
      type,
      quantity:
        type === 'adjustment' && selectedProduct
          ? selectedProduct.currentStock
          : type === 'adjustment'
            ? 0
            : prev.quantity < 1
              ? 1
              : prev.quantity,
    }))
  }

  const handleProductChange = (productId: string, product: Product | null) => {
    setSelectedProduct(product)
    setMovement((prev) => ({
      ...prev,
      productId,
      quantity:
        prev.type === 'adjustment' && product
          ? product.currentStock
          : prev.type === 'adjustment'
            ? 0
            : prev.quantity,
    }))
  }

  const canSubmit =
    Boolean(movement.productId) &&
    (movement.type === 'adjustment' ? movement.quantity >= 0 : movement.quantity >= 1)

  const products: Product[] = productsData?.data || []
  const transactions = transactionsData?.data || []

  const downloadStockPdf = () => {
    const dateStamp = new Date().toISOString().slice(0, 10)
    downloadAuthenticated(`/inventory/stock-report/pdf`, `stock-report-${dateStamp}.pdf`).catch(() =>
      toast.error('Failed to download stock report PDF')
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock Movements"
        description="Record stock in/out and adjustments for active products only"
        actions={
          <>
            <Button variant="secondary" onClick={downloadStockPdf} disabled={productsLoading}>
              <FileDown className="h-[18px] w-[18px]" /> Download Stock PDF
            </Button>
            <Button onClick={() => setDrawerOpen(true)}>
              <Plus className="h-[18px] w-[18px]" /> Record Movement
            </Button>
          </>
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
                  <TableHead>Specs</TableHead>
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
                    <TableCell>
                      <ProductSpecBadges product={p} size="sm" showLabels />
                    </TableCell>
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
                {transactions.map((t: {
                  _id: string
                  createdAt: string
                  type: string
                  product: { name: string; sku?: string }
                  quantity: number
                  previousStock: number
                  newStock: number
                }) => (
                  <TableRow key={t._id}>
                    <TableCell>{formatDate(t.createdAt)}</TableCell>
                    <TableCell><Badge variant="muted" className="normal-case">{t.type.replace(/_/g, ' ')}</Badge></TableCell>
                    <TableCell>
                      <span>{t.product?.name}</span>
                      {t.product?.sku && (
                        <span className="ml-2 text-[var(--text-xs)] text-[var(--color-text-muted)]">{t.product.sku}</span>
                      )}
                    </TableCell>
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
        onClose={() => {
          setDrawerOpen(false)
          setMovement(emptyMovement())
          setSelectedProduct(null)
        }}
        title="Record Stock Movement"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setDrawerOpen(false)
                setMovement(emptyMovement())
                setSelectedProduct(null)
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit}
              loading={stockMutation.isPending}
            >
              {movement.type === 'stock_in' ? (
                <ArrowDownToLine className="h-[18px] w-[18px]" />
              ) : (
                <ArrowUpFromLine className="h-[18px] w-[18px]" />
              )}
              Submit
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <Label>Movement type</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {([
                ['stock_in', 'Stock In'],
                ['stock_out', 'Stock Out'],
                ['adjustment', 'Set exact level'],
              ] as const).map(([id, label]) => (
                <Button
                  key={id}
                  type="button"
                  size="sm"
                  variant={movement.type === id ? 'primary' : 'secondary'}
                  onClick={() => handleTypeChange(id)}
                >
                  {label}
                </Button>
              ))}
            </div>
            {movement.type === 'adjustment' && (
              <p className="mt-2 text-[var(--text-xs)] text-[var(--color-text-muted)]">
                Adjustment sets the exact on-hand quantity (not a +/- delta). Use Stock In/Out for additions or removals.
              </p>
            )}
          </div>

          <ProductPicker
            value={movement.productId}
            onChange={handleProductChange}
            status="active"
          />

          <div>
            <Label>
              {movement.type === 'adjustment' ? 'New stock level (pieces)' : 'Quantity (pieces)'}
            </Label>
            <IntegerInput
              min={movement.type === 'adjustment' ? 0 : 1}
              value={movement.quantity}
              onChange={(v) => setMovement({ ...movement, quantity: v })}
            />
            {movement.type === 'stock_out' && selectedProduct && (
              <p className="mt-1 text-[var(--text-xs)] text-[var(--color-text-muted)]">
                Available: {selectedProduct.currentStock.toLocaleString('en-IN')} pcs
              </p>
            )}
            {movement.type === 'adjustment' && selectedProduct && movement.quantity !== selectedProduct.currentStock && (
              <p className="mt-1 text-[var(--text-xs)] text-[var(--color-warning)]">
                Change: {selectedProduct.currentStock.toLocaleString('en-IN')} → {movement.quantity.toLocaleString('en-IN')} pcs
              </p>
            )}
          </div>

          <div>
            <Label>Notes (optional)</Label>
            <Input
              value={movement.notes}
              onChange={(e) => setMovement({ ...movement, notes: e.target.value })}
              placeholder="Reason, reference, etc."
            />
          </div>
        </div>
      </Drawer>
    </div>
  )
}
