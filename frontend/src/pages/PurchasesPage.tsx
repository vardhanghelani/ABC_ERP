import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge, poStatusVariant } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, DataTableWrapper,
} from '@/components/ui/table'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Plus } from 'lucide-react'

export default function PurchasesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['purchases'],
    queryFn: async () => {
      const { data } = await api.get('/purchases')
      return data
    },
  })

  const purchases = data?.data || []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Purchase Orders"
        description="Manage supplier purchases and receiving"
        actions={
          <Button variant="secondary" disabled title="Create PO coming soon">
            <Plus className="h-[18px] w-[18px]" /> New PO
          </Button>
        }
      />

      <Card className="overflow-hidden">
        <DataTableWrapper loading={isLoading} empty={!isLoading && purchases.length === 0} emptyTitle="No purchase orders">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO Number</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead align="right">Total</TableHead>
                <TableHead align="right">Paid</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchases.map((p: { _id: string; poNumber: string; supplier: { name: string }; total: number; paidAmount: number; status: string; createdAt: string }) => (
                <TableRow key={p._id}>
                  <TableCell className="font-medium" mono>{p.poNumber}</TableCell>
                  <TableCell>{p.supplier?.name}</TableCell>
                  <TableCell align="right" mono>{formatCurrency(p.total)}</TableCell>
                  <TableCell align="right" mono>{formatCurrency(p.paidAmount)}</TableCell>
                  <TableCell>
                    <Badge variant={poStatusVariant(p.status)} className="normal-case">{p.status}</Badge>
                  </TableCell>
                  <TableCell>{formatDate(p.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataTableWrapper>
      </Card>
    </div>
  )
}
