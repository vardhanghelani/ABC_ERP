import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi, putApi } from '@/lib/api'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageSkeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { Building2, Receipt, Package } from 'lucide-react'
import { toast } from 'sonner'

const navItems = [
  { id: 'company', label: 'Company', icon: Building2 },
  { id: 'billing', label: 'Billing', icon: Receipt },
  { id: 'inventory', label: 'Inventory', icon: Package },
]

const fields = [
  { key: 'company_name', label: 'Company Name', group: 'company' },
  { key: 'company_address', label: 'Address', group: 'company' },
  { key: 'company_phone', label: 'Phone', group: 'company' },
  { key: 'company_gst', label: 'GST Number', group: 'company' },
  { key: 'tax_rate', label: 'Default Tax Rate (%)', group: 'billing', type: 'number' },
  { key: 'invoice_prefix', label: 'Invoice Prefix', group: 'billing' },
  { key: 'currency', label: 'Currency', group: 'billing' },
  { key: 'barcode_prefix', label: 'Barcode Prefix', group: 'inventory' },
]

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const [activePanel, setActivePanel] = useState('company')
  const [form, setForm] = useState<Record<string, unknown>>({})

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => fetchApi<Record<string, unknown>>('/settings'),
  })

  useEffect(() => {
    if (settings) setForm(settings)
  }, [settings])

  const updateSettings = useMutation({
    mutationFn: () => putApi('/settings', form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      toast.success('Settings saved')
    },
  })

  if (isLoading && !Object.keys(form).length) return <PageSkeleton />

  const panelFields = fields.filter((f) => f.group === activePanel)
  const panelLabel = navItems.find((n) => n.id === activePanel)?.label || 'Settings'

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Configure company and system settings" />

      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="w-full shrink-0 lg:w-52">
          <nav className="space-y-1">
            {navItems.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActivePanel(id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-[var(--radius-md)] px-3 py-2 text-[var(--text-sm)] font-medium transition-colors',
                  activePanel === id
                    ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)]'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)]'
                )}
              >
                <Icon className="h-[18px] w-[18px]" />
                {label}
              </button>
            ))}
          </nav>
        </aside>

        <Card className="min-w-0 flex-1">
          <CardHeader><CardTitle>{panelLabel}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              {panelFields.map((field) => (
                <div key={field.key}>
                  <Label>{field.label}</Label>
                  <Input
                    type={field.type || 'text'}
                    value={String(form[field.key] ?? settings?.[field.key] ?? '')}
                    onChange={(e) => setForm({ ...form, [field.key]: field.type === 'number' ? Number(e.target.value) : e.target.value })}
                  />
                </div>
              ))}
            </div>
            <div className="mt-6">
              <Button onClick={() => updateSettings.mutate()} loading={updateSettings.isPending}>Save Settings</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
