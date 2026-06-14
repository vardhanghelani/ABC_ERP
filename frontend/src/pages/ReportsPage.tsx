import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent, CardHeader, CardTitle, StatCard } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn, formatCurrency } from '@/lib/utils'
import { BarChart3, TrendingUp, Package } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

const COLORS = ['var(--color-accent)', 'var(--color-success)', 'var(--color-warning)', 'var(--color-danger)', 'var(--color-info)']

const categories = [
  { id: 'sales', label: 'Sales', icon: TrendingUp, description: 'Revenue and order analytics' },
  { id: 'profit', label: 'Profit', icon: BarChart3, description: 'Margin and cost analysis' },
  { id: 'stock', label: 'Stock', icon: Package, description: 'Inventory movement reports' },
]

export default function ReportsPage() {
  const [tab, setTab] = useState('sales')
  const [period, setPeriod] = useState('month')

  const { data: salesReport, isLoading: salesLoading } = useQuery({
    queryKey: ['report-sales', period],
    queryFn: () => fetchApi<{ summary: { totalSales: number; totalOrders: number }; dailySales: { _id: string; total: number }[]; categorySales: { _id: string; total: number }[] }>(`/reports/sales`, { period }),
    enabled: tab === 'sales',
  })

  const { data: profitReport, isLoading: profitLoading } = useQuery({
    queryKey: ['report-profit', period],
    queryFn: () => fetchApi<{ revenue: number; cost: number; grossProfit: number; profitMargin: number }>(`/reports/profit`, { period }),
    enabled: tab === 'profit',
  })

  const { data: stockReport, isLoading: stockLoading } = useQuery({
    queryKey: ['report-stock'],
    queryFn: () => fetchApi<{ fastMoving: { name: string; totalSold: number }[] }>('/reports/stock'),
    enabled: tab === 'stock',
  })

  const isLoading = (tab === 'sales' && salesLoading) || (tab === 'profit' && profitLoading) || (tab === 'stock' && stockLoading)

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Sales, profit, and inventory analytics" />

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Sidebar */}
        <aside className="w-full shrink-0 lg:w-56">
          <nav className="space-y-1">
            {categories.map(({ id, label, icon: Icon, description }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  'flex w-full items-start gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-left transition-colors',
                  tab === id
                    ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)]'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)]'
                )}
              >
                <Icon className="mt-0.5 h-[18px] w-[18px] shrink-0" />
                <div>
                  <p className="text-[var(--text-sm)] font-medium">{label}</p>
                  <p className="text-[var(--text-xs)] text-[var(--color-text-muted)]">{description}</p>
                </div>
              </button>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <div className="min-w-0 flex-1 space-y-4">
          {tab !== 'stock' && (
            <div className="flex flex-wrap gap-2">
              {['today', 'week', 'month', 'year'].map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant={period === p ? 'primary' : 'secondary'}
                  onClick={() => setPeriod(p)}
                  className="capitalize"
                >
                  {p}
                </Button>
              ))}
            </div>
          )}

          {isLoading && (
            <div className="flex h-48 items-center justify-center text-[var(--color-text-muted)]">Loading report...</div>
          )}

          {tab === 'sales' && salesReport && !salesLoading && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <StatCard label="Total Sales" value={formatCurrency(salesReport.summary?.totalSales || 0)} accent="accent" />
                <StatCard label="Total Orders" value={String(salesReport.summary?.totalOrders || 0)} accent="success" />
              </div>
              <Card>
                <CardHeader><CardTitle>Daily Sales</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={salesReport.dailySales}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-soft)" />
                      <XAxis dataKey="_id" tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} />
                      <YAxis tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} />
                      <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                      <Bar dataKey="total" fill="var(--color-accent)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Category Wise Sales</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={salesReport.categorySales} dataKey="total" nameKey="_id" cx="50%" cy="50%" outerRadius={80} label>
                        {salesReport.categorySales?.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}

          {tab === 'profit' && profitReport && !profitLoading && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Revenue" value={formatCurrency(profitReport.revenue)} accent="accent" />
              <StatCard label="Cost" value={formatCurrency(profitReport.cost)} accent="warning" />
              <StatCard label="Gross Profit" value={formatCurrency(profitReport.grossProfit)} accent="success" />
              <StatCard label="Margin" value={`${profitReport.profitMargin.toFixed(1)}%`} accent="info" />
            </div>
          )}

          {tab === 'stock' && stockReport && !stockLoading && (
            <Card>
              <CardHeader><CardTitle>Fast Moving Products (90 days)</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {stockReport.fastMoving?.map((p, i) => (
                  <div key={i} className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-border-soft)] p-3">
                    <span className="font-medium text-[var(--color-text-primary)]">{p.name}</span>
                    <span className="text-[var(--text-sm)] text-[var(--color-text-muted)]">{p.totalSold} sold</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
