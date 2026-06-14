import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, downloadAuthenticated } from '@/lib/api'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, DataTableWrapper,
} from '@/components/ui/table'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Download, Eye } from 'lucide-react'
import { toast } from 'sonner'

export default function SalesPage() {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['sales'],
    queryFn: async () => {
      const { data } = await api.get('/sales')
      return data
    },
  })

  const sales = data?.data || []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales & Invoices"
        description="View all sales transactions and invoices"
      />

      <Card className="overflow-hidden">
        <DataTableWrapper loading={isLoading} empty={!isLoading && sales.length === 0} emptyTitle="No sales recorded">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead align="right">Total</TableHead>
                <TableHead align="right">Paid</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead align="center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.map((s: {
                _id: string
                invoiceNumber: string
                customerName?: string
                total: number
                paidAmount: number
                balanceDue?: number
                status: string
                createdAt: string
              }) => (
                <TableRow
                  key={s._id}
                  className="cursor-pointer hover:bg-[var(--color-bg-subtle)]"
                  onClick={() => navigate(`/sales/${s._id}`)}
                >
                  <TableCell className="font-medium" mono>
                    <Link
                      to={`/sales/${s._id}`}
                      className="text-[var(--color-primary)] hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {s.invoiceNumber}
                    </Link>
                  </TableCell>
                  <TableCell>{s.customerName || 'Walk-in'}</TableCell>
                  <TableCell align="right" mono>{formatCurrency(s.total)}</TableCell>
                  <TableCell align="right" mono>{formatCurrency(s.paidAmount)}</TableCell>
                  <TableCell>
                    <Badge variant={s.status === 'completed' ? 'success' : 'danger'} className="normal-case">
                      {s.status}
                    </Badge>
                    {!!s.balanceDue && s.balanceDue > 0 && (
                      <span className="ml-2 text-[var(--text-xs)] text-[var(--color-warning)]">
                        Due {formatCurrency(s.balanceDue)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{formatDate(s.createdAt)}</TableCell>
                  <TableCell align="center">
                    <div className="flex items-center justify-center gap-1">
                      <Link
                        to={`/sales/${s._id}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)]"
                        aria-label="View invoice"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Eye className="h-[18px] w-[18px]" />
                      </Link>
                      <Button
                        size="sm"
                        variant="ghost"
                        iconOnly
                        onClick={(e) => {
                          e.stopPropagation()
                          downloadAuthenticated(`/sales/${s._id}/pdf`, `${s.invoiceNumber}.pdf`).catch(() =>
                            toast.error('Failed to download invoice')
                          )
                        }}
                        aria-label="Download PDF"
                      >
                        <Download className="h-[18px] w-[18px]" />
                      </Button>
                    </div>
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
