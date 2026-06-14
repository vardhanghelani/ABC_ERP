import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { fetchApi } from '@/lib/api'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, StatCard } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs } from '@/components/ui/tabs-simple'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, DataTableWrapper,
} from '@/components/ui/table'
import { formatCurrency } from '@/lib/utils'
import { IndianRupee, AlertTriangle, Users, TrendingDown } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

export default function CreditPage() {
  const [tab, setTab] = useState('outstanding')

  const { data: outstanding, isLoading } = useQuery({
    queryKey: ['report-outstanding'],
    queryFn: () => fetchApi<{
      totalReceivables: number; totalOverdue: number;
      customerWise: { _id: string; name: string; phone: string; outstandingAmount: number; advanceBalance?: number; netOutstanding: number; creditLimit: number; riskCategory: string }[];
      invoiceWise: { invoiceNumber: string; balanceDue: number; daysOverdue: number; customer: { name: string } }[];
    }>('/reports/outstanding'),
  })

  const { data: aging } = useQuery({
    queryKey: ['report-aging'],
    queryFn: () => fetchApi<{ buckets: { label: string; amount: number; count: number }[]; customers: unknown[] }>('/reports/aging'),
    enabled: tab === 'aging',
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Credit Management"
        description="Receivables, aging analysis, and outstanding reports"
        actions={
          <Link to="/collect-payment">
            <Button><IndianRupee className="h-[18px] w-[18px]" /> Collect Payment</Button>
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Receivables (Net)" value={formatCurrency(outstanding?.totalReceivables || 0)} icon={IndianRupee} accent="accent" />
        <StatCard label="Total Overdue" value={formatCurrency(outstanding?.totalOverdue || 0)} icon={AlertTriangle} accent="warning" />
        <StatCard label="Customers with Dues" value={String(outstanding?.customerWise?.length || 0)} icon={Users} accent="info" />
        <StatCard label="Overdue Invoices" value={String(outstanding?.invoiceWise?.filter((i) => i.daysOverdue > 0).length || 0)} icon={TrendingDown} accent="danger" />
      </div>

      <Tabs tabs={[
        { id: 'outstanding', label: 'Customer Net Outstanding' },
        { id: 'invoices', label: 'Invoice Wise' },
        { id: 'aging', label: 'Aging Report' },
      ]} active={tab} onChange={setTab} />

      {tab === 'outstanding' && (
        <Card className="overflow-hidden">
          <DataTableWrapper loading={isLoading} empty={!isLoading && !outstanding?.customerWise?.length}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead align="right">Net Outstanding</TableHead>
                  <TableHead align="right">Credit Limit</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outstanding?.customerWise?.map((c) => {
                  const netDue = c.netOutstanding ?? Math.max(0, c.outstandingAmount - (c.advanceBalance ?? 0))
                  return (
                  <TableRow key={c._id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell mono>{c.phone}</TableCell>
                    <TableCell align="right" mono className="font-semibold">{formatCurrency(netDue)}</TableCell>
                    <TableCell align="right" mono>{formatCurrency(c.creditLimit)}</TableCell>
                    <TableCell>
                      <Badge variant={c.creditLimit > 0 && netDue / c.creditLimit >= 0.8 ? 'warning' : 'muted'}>
                        {c.creditLimit > 0 ? `${((netDue / c.creditLimit) * 100).toFixed(0)}%` : '—'}
                      </Badge>
                    </TableCell>
                    <TableCell><Badge variant="muted" className="normal-case capitalize">{c.riskCategory?.replace('_', ' ')}</Badge></TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Link to={`/collect-payment?customer=${c._id}`} className="text-[var(--text-sm)] font-medium text-[var(--color-accent)] hover:underline">Collect</Link>
                        <Link to={`/customers/${c._id}`} className="text-[var(--text-sm)] text-[var(--color-info)] hover:underline">View</Link>
                      </div>
                    </TableCell>
                  </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </DataTableWrapper>
        </Card>
      )}

      {tab === 'invoices' && (
        <Card className="overflow-hidden">
          <DataTableWrapper empty={!outstanding?.invoiceWise?.length}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead align="right">Balance Due</TableHead>
                  <TableHead>Days Overdue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outstanding?.invoiceWise?.map((inv, i) => (
                  <TableRow key={i}>
                    <TableCell mono className="font-medium">{inv.invoiceNumber}</TableCell>
                    <TableCell>{inv.customer?.name}</TableCell>
                    <TableCell align="right" mono className="font-semibold">{formatCurrency(inv.balanceDue)}</TableCell>
                    <TableCell>
                      {inv.daysOverdue > 0 ? <Badge variant="danger">{inv.daysOverdue} days</Badge> : <Badge variant="success">Current</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataTableWrapper>
        </Card>
      )}

      {tab === 'aging' && aging && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-5">
            <h3 className="mb-4 font-semibold">Aging Buckets</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={aging.buckets}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-soft)" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} />
                <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                <Bar dataKey="amount" fill="var(--color-accent)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card className="p-5 space-y-3">
            <h3 className="font-semibold">Summary</h3>
            {aging.buckets.map((b) => (
              <div key={b.label} className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-border-soft)] p-3">
                <span className="font-medium">{b.label}</span>
                <span className="font-data font-bold">{formatCurrency(b.amount)}</span>
              </div>
            ))}
          </Card>
        </div>
      )}
    </div>
  )
}
