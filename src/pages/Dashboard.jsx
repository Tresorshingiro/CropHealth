import { useAuth } from '../auth/AuthContext.jsx'
import ThemeToggle from '../theme/ThemeToggle.jsx'

export default function Dashboard() {
  const { user, signOut } = useAuth()
  return (
    <div className="min-h-screen">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3">
        <h1 className="text-lg font-semibold">Crop Health Monitoring</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-ink-2">{user?.fullName || user?.username}</span>
          <ThemeToggle />
          <button type="button" className="btn-ghost" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>
    </div>
  )
}
