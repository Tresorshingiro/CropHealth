import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'

export default function AuthGate({ children }) {
  const { user, checking } = useAuth()
  const location = useLocation()

  if (checking) {
    return (
      <div role="status" className="grid min-h-screen place-items-center text-sm text-ink-2">
        Checking your session…
      </div>
    )
  }
  if (!user) {
    const next = `${location.pathname}${location.search}`
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
  }
  return children
}
