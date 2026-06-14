import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { getDefaultRoute } from '@/lib/routes'

export function DefaultRedirect() {
  const { user } = useAuth()
  return <Navigate to={getDefaultRoute(user?.permissions)} replace />
}
