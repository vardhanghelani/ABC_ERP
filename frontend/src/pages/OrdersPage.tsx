import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, DataTableWrapper,
} from '@/components/ui/table'
import { formatCurrency, formatDate } from '@/lib/utils'

export default function OrdersPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: async () => {
      const { data } = await api.get('/orders')
      return data
    },
  })

  const orders = data?.data || []

  return (
    <div className="space-y-6">
      <PageHeader title="Orders" description="Track pending, partial, and completed orders" />

      <Card className="overflow-hidden">
        <DataTableWrapper loading={isLoading} empty={!isLoading && orders.length === 0} emptyTitle="No orders found">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead align="right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o: { _id: string; orderNumber: string; customer: { name: string }; total: number; status: string; createdAt: string }) => (
                <TableRow key={o._id}>
                  <TableCell className="font-medium" mono>{o.orderNumber}</TableCell>
                  <TableCell>{o.customer?.name}</TableCell>
                  <TableCell align="right" mono>{formatCurrency(o.total)}</TableCell>
                  <TableCell>
                    <Badge variant={o.status === 'completed' ? 'success' : o.status === 'pending' ? 'warning' : 'muted'} className="normal-case">{o.status}</Badge>
                  </TableCell>
                  <TableCell>{formatDate(o.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataTableWrapper>
      </Card>
    </div>
  )
}
