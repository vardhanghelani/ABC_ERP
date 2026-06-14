import { useQuery } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import type { DashboardStats } from '@/types'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent, CardHeader, CardTitle, StatCard } from '@/components/ui/card'
import { Badge, stockStatusVariant, stockStatusLabel } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StockBar } from '@/components/ui/stock-bar'
import { PageSkeleton } from '@/components/ui/skeleton'
import { TrendingUp, ShoppingBag, Package, IndianRupee, AlertTriangle, Users } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

function calcDelta(values: number[]): number | undefined {
  if (values.length < 2) return undefined
  const prev = values[values.length - 2]
  const curr = values[values.length - 1]
  if (prev === 0) return curr > 0 ? 100 : 0
  return Math.round(((curr - prev) / prev) * 100)
}

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => fetchApi<DashboardStats>('/dashboard'),
  })

  if (isLoading) return <PageSkeleton />

  const stats = data!
  const salesDelta = calcDelta(stats.salesGraph?.map((d) => d.sales) || [])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Overview of your business today"
      />

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 sm:col-span-6 lg:col-span-3">
          <StatCard label="Today's Sales" value={formatCurrency(stats.todaySales)} delta={salesDelta} icon={TrendingUp} accent="accent" />
        </div>
        <div className="col-span-12 sm:col-span-6 lg:col-span-3">
          <StatCard label="Today's Orders" value={String(stats.todayOrders)} delta={8} icon={ShoppingBag} accent="success" />
        </div>
        <div className="col-span-12 sm:col-span-6 lg:col-span-3">
          <StatCard label="Inventory Value" value={formatCurrency(stats.inventoryValue)} delta={3} icon={Package} accent="warning" />
        </div>
        <div className="col-span-12 sm:col-span-6 lg:col-span-3">
          <StatCard label="Receivables" value={formatCurrency(stats.outstandingReceivables)} delta={-2} icon={IndianRupee} accent="danger" />
        </div>

        {stats.credit && (
          <>
            <div className="col-span-12 sm:col-span-6 lg:col-span-3">
              <StatCard label="Today's Collections" value={formatCurrency(stats.credit.todayCollections)} accent="success" />
            </div>
            <div className="col-span-12 sm:col-span-6 lg:col-span-3">
              <StatCard label="Monthly Collections" value={formatCurrency(stats.credit.monthCollections)} accent="info" />
            </div>
            <div className="col-span-12 sm:col-span-6 lg:col-span-3">
              <StatCard label="Total Payables" value={formatCurrency(stats.credit.totalPayables)} accent="warning" />
            </div>
            <div className="col-span-12 sm:col-span-6 lg:col-span-3">
              <StatCard label="Overdue Customers" value={String(stats.credit.overdueCustomers)} accent="danger" />
            </div>
          </>
        )}

        <div className="col-span-12 lg:col-span-8">
          <Card className="h-full">
            <CardHeader><CardTitle>Sales Trend (30 Days)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={stats.salesGraph}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-soft)" />
                  <XAxis dataKey="_id" tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} />
                  <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                  <Area type="monotone" dataKey="sales" stroke="var(--color-accent)" fill="var(--color-accent)" fillOpacity={0.15} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <div className="col-span-12 lg:col-span-4">
          <Card className="h-full">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Low Stock Alerts</CardTitle>
              <AlertTriangle className="h-[18px] w-[18px] text-[var(--color-warning)]" />
            </CardHeader>
            <CardContent>
              {!stats.lowStockProducts?.length ? (
                <p className="text-[var(--text-sm)] text-[var(--color-text-muted)]">All products are well stocked</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Stock</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.lowStockProducts.slice(0, 5).map((p) => (
                      <TableRow key={p._id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell>
                          <StockBar current={p.currentStock} max={p.reorderLevel * 3} />
                        </TableCell>
                        <TableCell>
                          <Badge variant={stockStatusVariant(p.currentStock, p.reorderLevel)}>
                            {stockStatusLabel(p.currentStock, p.reorderLevel)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        {stats.credit?.largestOutstanding && stats.credit.largestOutstanding.length > 0 && (
          <div className="col-span-12 lg:col-span-6">
            <Card>
              <CardHeader><CardTitle>Largest Outstanding Customers</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {stats.credit.largestOutstanding.map((c) => (
                  <div key={c._id} className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-border-soft)] p-3">
                    <span className="font-medium text-[var(--color-text-primary)]">{c.name}</span>
                    <Badge variant="warning">{formatCurrency(c.outstandingAmount)}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}

        <div className="col-span-12 lg:col-span-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Top Selling Products</CardTitle>
              <Users className="h-[18px] w-[18px] text-[var(--color-text-muted)]" />
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead align="right">Qty Sold</TableHead>
                    <TableHead align="right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.topProducts?.map((p) => (
                    <TableRow key={p._id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell align="right" mono>{p.totalQty}</TableCell>
                      <TableCell align="right" mono>{formatCurrency(p.totalRevenue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
