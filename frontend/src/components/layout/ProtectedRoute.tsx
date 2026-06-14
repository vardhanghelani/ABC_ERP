import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Layout } from '@/components/layout/Layout'
import { PageSkeleton } from '@/components/ui/skeleton'
import { getDefaultRoute } from '@/lib/routes'

export function ProtectedRoute({ children, permission }: { children: React.ReactNode; permission?: string }) {
  const { user, isLoading, hasPermission } = useAuth()

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--color-bg-base)] p-8">
        <div className="w-full max-w-4xl"><PageSkeleton /></div>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (permission && !hasPermission(permission)) {
    return <Navigate to={getDefaultRoute(user.permissions)} replace />
  }

  return <Layout>{children}</Layout>
}
