import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { getDefaultRoute } from '@/lib/routes'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Eye, EyeOff, Gem } from 'lucide-react'
import { toast } from 'sonner'

function WarehouseIllustration() {
  return (
    <svg viewBox="0 0 400 320" className="w-full max-w-md" aria-hidden>
      <defs>
        <linearGradient id="wh-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.25)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.05)" />
        </linearGradient>
      </defs>
      <rect x="40" y="120" width="320" height="160" rx="8" fill="url(#wh-grad)" stroke="rgba(255,255,255,0.3)" strokeWidth="2" />
      <polygon points="40,120 200,60 360,120" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.3)" strokeWidth="2" />
      <rect x="80" y="160" width="60" height="80" rx="4" fill="rgba(255,255,255,0.2)" />
      <rect x="170" y="160" width="60" height="80" rx="4" fill="rgba(255,255,255,0.2)" />
      <rect x="260" y="160" width="60" height="80" rx="4" fill="rgba(255,255,255,0.2)" />
      <rect x="155" y="200" width="90" height="80" rx="4" fill="rgba(255,255,255,0.25)" />
      {[90, 180, 270].map((x, i) => (
        <g key={i}>
          <rect x={x} y={100 - i * 8} width="40" height="30" rx="3" fill="rgba(255,255,255,0.35)" />
          <rect x={x + 5} y={105 - i * 8} width="30" height="4" rx="1" fill="rgba(255,255,255,0.5)" />
        </g>
      ))}
      <circle cx="200" cy="45" r="20" fill="rgba(255,255,255,0.2)" />
      <path d="M200 30 L210 50 L190 50 Z" fill="rgba(255,255,255,0.6)" />
    </svg>
  )
}

export default function LoginPage() {
  const { login, user } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('admin@jewelleryerp.com')
  const [password, setPassword] = useState('admin123')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  if (user) {
    navigate(getDefaultRoute(user.permissions))
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const loggedInUser = await login(email, password)
      toast.success('Welcome back!')
      navigate(getDefaultRoute(loggedInUser.permissions))
    } catch {
      toast.error('Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Left panel — 55% */}
      <div
        className="hidden lg:flex lg:w-[55%] flex-col justify-between p-12 text-white"
        style={{ background: 'linear-gradient(135deg, var(--color-accent) 0%, #1e3a8a 50%, #0f172a 100%)' }}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-white/20">
            <Gem className="h-5 w-5" strokeWidth={1.75} />
          </div>
          <span className="text-[var(--text-lg)] font-semibold">Jewellery ERP</span>
        </div>

        <div className="flex flex-col items-center gap-8">
          <WarehouseIllustration />
          <div className="max-w-md text-center">
            <h2 className="text-[var(--text-2xl)] font-bold leading-tight">
              Wholesale inventory &amp; POS — unified
            </h2>
            <p className="mt-3 text-[var(--text-base)] text-white/75">
              Track raw materials, manage credit accounts, and bill at the counter — all in one place.
            </p>
          </div>
        </div>

        <p className="text-[var(--text-sm)] text-white/50">© 2026 Jewellery ERP · Raw Material Wholesale</p>
      </div>

      {/* Right panel — 45% */}
      <div className="flex w-full lg:w-[45%] flex-col items-center justify-center bg-[var(--color-bg-base)] p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-accent-light)]">
              <Gem className="h-5 w-5 text-[var(--color-accent)]" strokeWidth={1.75} />
            </div>
            <span className="text-[var(--text-lg)] font-semibold text-[var(--color-text-primary)]">Jewellery ERP</span>
          </div>

          <h1 className="text-[var(--text-xl)] font-semibold text-[var(--color-text-primary)]">Sign in</h1>
          <p className="mt-1 text-[var(--text-sm)] text-[var(--color-text-muted)]">
            Enter your credentials to access the dashboard
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full" size="lg" loading={loading}>
              Sign In
            </Button>
          </form>

          <p className="mt-6 text-center text-[var(--text-xs)] text-[var(--color-text-muted)]">
            Demo: admin@jewelleryerp.com / admin123
          </p>
        </div>
      </div>
    </div>
  )
}
