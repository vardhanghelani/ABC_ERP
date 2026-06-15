import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi, putApi } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert } from '@/components/ui/alert'
import { PageSkeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { Building2, Receipt, Package, KeyRound } from 'lucide-react'
import { toast } from 'sonner'

const navItems = [
  { id: 'company', label: 'Company', icon: Building2 },
  { id: 'billing', label: 'Billing', icon: Receipt },
  { id: 'inventory', label: 'Inventory', icon: Package },
  { id: 'login', label: 'Login', icon: KeyRound },
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

const emptyCredentials = () => ({
  loginId: '',
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
})

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const { user, hasPermission, refreshUser } = useAuth()
  const [activePanel, setActivePanel] = useState('company')
  const [form, setForm] = useState<Record<string, unknown>>({})
  const [credentials, setCredentials] = useState(emptyCredentials())

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => fetchApi<Record<string, unknown>>('/settings'),
  })

  useEffect(() => {
    if (settings) setForm(settings)
  }, [settings])

  useEffect(() => {
    if (user?.loginId) {
      setCredentials((prev) => ({ ...prev, loginId: user.loginId }))
    }
  }, [user?.loginId])

  const updateSettings = useMutation({
    mutationFn: () => putApi('/settings', form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      toast.success('Settings saved')
    },
  })

  const updateCredentials = useMutation({
    mutationFn: () =>
      putApi('/auth/credentials', {
        loginId: credentials.loginId.trim().toLowerCase(),
        currentPassword: credentials.currentPassword,
        newPassword: credentials.newPassword || undefined,
        confirmPassword: credentials.confirmPassword || undefined,
      }),
    onSuccess: async () => {
      toast.success('Login ID and password updated')
      await refreshUser()
      setCredentials((prev) => ({
        ...emptyCredentials(),
        loginId: prev.loginId,
      }))
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to update login credentials')
    },
  })

  const handleSaveCredentials = () => {
    if (credentials.loginId.trim().length < 3) {
      toast.error('Login ID must be at least 3 characters')
      return
    }
    if (!/^[a-z0-9_]+$/i.test(credentials.loginId.trim())) {
      toast.error('Login ID can only contain letters, numbers, and underscore')
      return
    }
    if (!credentials.currentPassword) {
      toast.error('Enter your current password to save changes')
      return
    }
    if (credentials.newPassword && credentials.newPassword.length < 6) {
      toast.error('New password must be at least 6 characters')
      return
    }
    if (credentials.newPassword && credentials.newPassword !== credentials.confirmPassword) {
      toast.error('New password and confirmation do not match')
      return
    }
    updateCredentials.mutate()
  }

  if (isLoading && !Object.keys(form).length) return <PageSkeleton />

  const panelFields = fields.filter((f) => f.group === activePanel)
  const panelLabel = navItems.find((n) => n.id === activePanel)?.label || 'Settings'
  const canManageLogin = hasPermission('settings:manage')

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Configure company, billing, inventory, and login" />

      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="w-full shrink-0 lg:w-52">
          <nav className="space-y-1">
            {navItems.map(({ id, label, icon: Icon }) => {
              if (id === 'login' && !canManageLogin) return null
              return (
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
              )
            })}
          </nav>
        </aside>

        <Card className="min-w-0 flex-1">
          {activePanel === 'login' ? (
            <>
              <CardHeader><CardTitle>Login ID &amp; Password</CardTitle></CardHeader>
              <CardContent>
                <Alert
                  variant="info"
                  title="Change your sign-in details here"
                  description="Use a Login ID you remember (letters, numbers, underscore). Leave new password blank to keep the current password."
                  className="mb-5"
                />
                <div className="grid max-w-md gap-4">
                  <div>
                    <Label htmlFor="settings-login-id">Login ID</Label>
                    <Input
                      id="settings-login-id"
                      value={credentials.loginId}
                      onChange={(e) =>
                        setCredentials({ ...credentials, loginId: e.target.value.replace(/\s/g, '').toLowerCase() })
                      }
                      placeholder="e.g. abcadmin"
                      autoComplete="username"
                    />
                  </div>
                  <div>
                    <Label htmlFor="settings-current-password">Current password</Label>
                    <Input
                      id="settings-current-password"
                      type="password"
                      value={credentials.currentPassword}
                      onChange={(e) => setCredentials({ ...credentials, currentPassword: e.target.value })}
                      autoComplete="current-password"
                    />
                  </div>
                  <div>
                    <Label htmlFor="settings-new-password">New password (optional)</Label>
                    <Input
                      id="settings-new-password"
                      type="password"
                      value={credentials.newPassword}
                      onChange={(e) => setCredentials({ ...credentials, newPassword: e.target.value })}
                      autoComplete="new-password"
                      placeholder="Leave blank to keep current password"
                    />
                  </div>
                  <div>
                    <Label htmlFor="settings-confirm-password">Confirm new password</Label>
                    <Input
                      id="settings-confirm-password"
                      type="password"
                      value={credentials.confirmPassword}
                      onChange={(e) => setCredentials({ ...credentials, confirmPassword: e.target.value })}
                      autoComplete="new-password"
                    />
                  </div>
                </div>
                <div className="mt-6">
                  <Button onClick={handleSaveCredentials} loading={updateCredentials.isPending}>
                    Save Login Details
                  </Button>
                </div>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader><CardTitle>{panelLabel}</CardTitle></CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  {panelFields.map((field) => (
                    <div key={field.key}>
                      <Label>{field.label}</Label>
                      <Input
                        type={field.type || 'text'}
                        value={String(form[field.key] ?? settings?.[field.key] ?? '')}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            [field.key]: field.type === 'number' ? Number(e.target.value) : e.target.value,
                          })
                        }
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-6">
                  <Button onClick={() => updateSettings.mutate()} loading={updateSettings.isPending}>
                    Save Settings
                  </Button>
                </div>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
