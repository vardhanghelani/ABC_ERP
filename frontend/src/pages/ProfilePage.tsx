import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Toggle } from '@/components/ui/checkbox'
import { Alert } from '@/components/ui/alert'
import { cn } from '@/lib/utils'
import { User, Lock, Settings2, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'

const PREFS_KEY = 'erp_user_preferences'

type Preferences = {
  compactTables: boolean
  emailNotifications: boolean
  soundAlerts: boolean
}

const defaultPrefs: Preferences = {
  compactTables: false,
  emailNotifications: true,
  soundAlerts: false,
}

const sections = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'password', label: 'Password', icon: Lock },
  { id: 'preferences', label: 'Preferences', icon: Settings2 },
]

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
}

export default function ProfilePage() {
  const { user } = useAuth()
  const [section, setSection] = useState('profile')
  const [prefs, setPrefs] = useState<Preferences>(defaultPrefs)
  const [passwordForm, setPasswordForm] = useState({ current: '', next: '', confirm: '' })
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNext, setShowNext] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(PREFS_KEY)
      if (stored) setPrefs({ ...defaultPrefs, ...JSON.parse(stored) })
    } catch { /* ignore */ }
  }, [])

  const savePrefs = (next: Preferences) => {
    setPrefs(next)
    localStorage.setItem(PREFS_KEY, JSON.stringify(next))
    toast.success('Preferences saved')
  }

  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault()
    if (passwordForm.next.length < 6) {
      toast.error('New password must be at least 6 characters')
      return
    }
    if (passwordForm.next !== passwordForm.confirm) {
      toast.error('Passwords do not match')
      return
    }
    toast.info('Password change requires administrator setup — contact your admin to reset your password.')
    setPasswordForm({ current: '', next: '', confirm: '' })
  }

  if (!user) return null

  return (
    <div className="space-y-6">
      <PageHeader title="My Account" description="Manage your profile, password, and preferences" />

      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="w-full shrink-0 lg:w-52">
          <nav className="space-y-1">
            {sections.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setSection(id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-[var(--radius-md)] px-3 py-2 text-[var(--text-sm)] font-medium transition-colors',
                  section === id
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

        <div className="min-w-0 flex-1">
          {section === 'profile' && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-5">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--color-accent-light)] text-[var(--text-2xl)] font-bold text-[var(--color-accent)]">
                    {getInitials(user.name)}
                  </div>
                  <div>
                    <h2 className="text-[var(--text-lg)] font-semibold text-[var(--color-text-primary)]">{user.name}</h2>
                    <p className="text-[var(--text-sm)] text-[var(--color-text-muted)]">{user.email}</p>
                    <p className="mt-1 capitalize text-[var(--text-sm)] text-[var(--color-text-secondary)]">{user.role.replace('_', ' ')}</p>
                    {user.phone && <p className="text-[var(--text-sm)] text-[var(--color-text-muted)]">{user.phone}</p>}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {section === 'password' && (
            <Card>
              <CardHeader><CardTitle>Change Password</CardTitle></CardHeader>
              <CardContent>
                <Alert variant="info" title="Self-service password change" description="Password resets are managed by your administrator. Use this form to validate a new password before requesting a reset." className="mb-5" />
                <form onSubmit={handlePasswordChange} className="max-w-md space-y-4">
                  <div>
                    <Label htmlFor="current">Current Password</Label>
                    <div className="relative">
                      <Input id="current" type={showCurrent ? 'text' : 'password'} value={passwordForm.current} onChange={(e) => setPasswordForm({ ...passwordForm, current: e.target.value })} className="pr-10" />
                      <button type="button" onClick={() => setShowCurrent(!showCurrent)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]">
                        {showCurrent ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="next">New Password</Label>
                    <div className="relative">
                      <Input id="next" type={showNext ? 'text' : 'password'} value={passwordForm.next} onChange={(e) => setPasswordForm({ ...passwordForm, next: e.target.value })} className="pr-10" />
                      <button type="button" onClick={() => setShowNext(!showNext)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]">
                        {showNext ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="confirm">Confirm New Password</Label>
                    <Input id="confirm" type="password" value={passwordForm.confirm} onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })} />
                  </div>
                  <Button type="submit">Update Password</Button>
                </form>
              </CardContent>
            </Card>
          )}

          {section === 'preferences' && (
            <Card>
              <CardHeader><CardTitle>Preferences</CardTitle></CardHeader>
              <CardContent className="space-y-5">
                <Toggle checked={prefs.compactTables} onChange={(v) => savePrefs({ ...prefs, compactTables: v })} label="Compact table rows" />
                <Toggle checked={prefs.emailNotifications} onChange={(v) => savePrefs({ ...prefs, emailNotifications: v })} label="Email notifications for low stock" />
                <Toggle checked={prefs.soundAlerts} onChange={(v) => savePrefs({ ...prefs, soundAlerts: v })} label="Sound alerts at POS" />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
