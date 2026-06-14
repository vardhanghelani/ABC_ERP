import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { downloadAuthenticated, fetchApi } from '@/lib/api'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, StatCard } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs } from '@/components/ui/tabs-simple'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, DataTableWrapper,
} from '@/components/ui/table'
import { cn, formatCurrency } from '@/lib/utils'
import { Download, RefreshCw, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'

interface ReconciliationRow {
  id: string
  name: string
  ledgerBalance: number
  outstanding: number
  storedOutstanding: number
  advanceBalance: number
  difference: number
  status: 'in_sync' | 'out_of_sync'
}

interface ReconciliationReport {
  customers: ReconciliationRow[]
  suppliers: ReconciliationRow[]
  summary: {
    totalAccountsChecked: number
    accountsInSync: number
    accountsOutOfSync: number
    customersChecked: number
    suppliersChecked: number
    customersInSync: number
    customersOutOfSync: number
    suppliersInSync: number
    suppliersOutOfSync: number
    generatedAt: string
  }
}

export default function AccountingHealthCheckPage() {
  const [tab, setTab] = useState('customers')
  const [showIssuesOnly, setShowIssuesOnly] = useState(false)
  const [exporting, setExporting] = useState(false)

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['accounting-reconciliation'],
    queryFn: () => fetchApi<ReconciliationReport>('/accounting/reconciliation'),
    staleTime: 0,
  })

  const rows = useMemo(() => {
    const source = tab === 'customers' ? data?.customers ?? [] : data?.suppliers ?? []
    if (!showIssuesOnly) return source
    return source.filter((row) => row.status === 'out_of_sync')
  }, [data, showIssuesOnly, tab])

  const handleExport = async () => {
    try {
      setExporting(true)
      const timestamp = new Date().toISOString().slice(0, 10)
      await downloadAuthenticated('/accounting/reconciliation/export', `accounting-health-check-${timestamp}.xlsx`)
      toast.success('Health check exported to Excel')
    } catch {
      toast.error('Failed to export health check')
    } finally {
      setExporting(false)
    }
  }

  const summary = data?.summary

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounting Health Check"
        description="Compare ledger balances against invoice and payment outstanding before production deployment"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => refetch()} loading={isFetching && !isLoading}>
              <RefreshCw className="h-[18px] w-[18px]" /> Run Check
            </Button>
            <Button onClick={handleExport} loading={exporting} disabled={!data}>
              <Download className="h-[18px] w-[18px]" /> Export Excel
            </Button>
          </div>
        }
      />

      {summary && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total Accounts Checked"
            value={String(summary.totalAccountsChecked)}
            accent="accent"
          />
          <StatCard
            label="Accounts In Sync"
            value={String(summary.accountsInSync)}
            accent="success"
          />
          <StatCard
            label="Accounts Out Of Sync"
            value={String(summary.accountsOutOfSync)}
            accent={summary.accountsOutOfSync > 0 ? 'danger' : 'success'}
          />
          <StatCard
            label="Last Run"
            value={new Date(summary.generatedAt).toLocaleString()}
            accent="info"
          />
        </div>
      )}

      <Card className="border-dashed bg-[var(--color-surface-muted)]/40 p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-accent)]" />
          <div className="space-y-1 text-sm text-[var(--color-text-muted)]">
            <p>
              Outstanding is calculated from open invoice balances. Difference compares ledger balance
              against invoice outstanding minus advance balance.
            </p>
            <p>
              An account is marked out of sync when ledger, stored outstanding, or invoice totals do not agree.
            </p>
          </div>
        </div>
      </Card>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          tabs={[
            { id: 'customers', label: `Customers (${summary?.customersChecked ?? 0})` },
            { id: 'suppliers', label: `Suppliers (${summary?.suppliersChecked ?? 0})` },
          ]}
          active={tab}
          onChange={setTab}
        />
        <label className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
          <input
            type="checkbox"
            checked={showIssuesOnly}
            onChange={(e) => setShowIssuesOnly(e.target.checked)}
            className="rounded border-[var(--color-border)]"
          />
          Show out-of-sync only
        </label>
      </div>

      <Card className="overflow-hidden">
        <DataTableWrapper loading={isLoading} empty={!isLoading && rows.length === 0}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tab === 'customers' ? 'Customer Name' : 'Supplier Name'}</TableHead>
                <TableHead align="right">Ledger Balance</TableHead>
                <TableHead align="right">Outstanding</TableHead>
                <TableHead align="right">Difference</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell align="right" mono>{formatCurrency(row.ledgerBalance)}</TableCell>
                  <TableCell align="right" mono>{formatCurrency(row.outstanding)}</TableCell>
                  <TableCell
                    align="right"
                    mono
                    className={cn(row.difference !== 0 && 'text-[var(--color-danger)]')}
                  >
                    {formatCurrency(row.difference)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.status === 'in_sync' ? 'success' : 'danger'}>
                      {row.status === 'in_sync' ? 'In Sync' : 'Out Of Sync'}
                    </Badge>
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
