import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, postApi } from '@/lib/api'
import type { Product } from '@/types'
import { invalidateProductQueries } from '@/lib/productQueries'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { SearchInput } from '@/components/ui/search-input'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { StockBar } from '@/components/ui/stock-bar'
import { ProductSpecBadges } from '@/components/pos/ProductSpecBadges'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, DataTableWrapper,
} from '@/components/ui/table'
import { ArrowLeft, RotateCcw } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'

export default function InactiveProductsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')

  const { data: productsData, isLoading } = useQuery({
    queryKey: ['products-inactive', search],
    queryFn: async () => {
      const { data } = await api.get('/products', { params: { search, status: 'inactive', limit: 100 } })
      return data
    },
  })

  const reactivateProduct = useMutation({
    mutationFn: (id: string) => postApi(`/products/${id}/reactivate`),
    onSuccess: () => {
      invalidateProductQueries(queryClient)
      toast.success('Product reactivated — it will appear in Products and POS again')
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err.response?.data?.message || 'Failed to reactivate product'),
  })

  const handleReactivate = (product: Product) => {
    if (!window.confirm(`Reactivate "${product.name}"?\n\nIt will be visible in Products, POS, and Stock Movements.`)) return
    reactivateProduct.mutate(product._id)
  }

  const products: Product[] = productsData?.data || []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inactive Products"
        description="Deactivated products are hidden from POS and stock movements. Reactivate when needed."
        actions={
          <Button variant="secondary" onClick={() => navigate('/products')}>
            <ArrowLeft className="h-[18px] w-[18px]" /> Active Products
          </Button>
        }
      />

      <SearchInput
        placeholder="Search inactive products by name, SKU, specs…"
        value={search}
        onChange={setSearch}
        className="max-w-md h-11"
      />

      <Card className="overflow-hidden">
        <DataTableWrapper
          loading={isLoading}
          empty={!isLoading && products.length === 0}
          emptyTitle="No inactive products"
          emptyDescription="Deactivated products will appear here."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Specs</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead align="right">Selling / pc</TableHead>
                <TableHead>Status</TableHead>
                <TableHead align="right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => (
                <TableRow key={p._id}>
                  <TableCell><Badge variant="muted">{p.sku}</Badge></TableCell>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>
                    {p.category && typeof p.category === 'object' ? p.category.name : '—'}
                  </TableCell>
                  <TableCell>
                    <ProductSpecBadges product={p} size="sm" showLabels />
                  </TableCell>
                  <TableCell>
                    <StockBar current={p.currentStock} max={p.reorderLevel * 3} />
                  </TableCell>
                  <TableCell align="right" mono>{formatCurrency(p.sellingPrice || p.wholesalePrice)}</TableCell>
                  <TableCell>
                    <Badge variant="muted">Inactive</Badge>
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleReactivate(p)}
                      loading={reactivateProduct.isPending}
                    >
                      <RotateCcw className="h-[16px] w-[16px]" /> Reactivate
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataTableWrapper>
      </Card>
    </div>
  )
}
