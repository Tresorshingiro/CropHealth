import { useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import ThemeToggle from '../theme/ThemeToggle.jsx'
import { useAuth } from './AuthContext.jsx'

/** Only a path on this site may be followed after sign-in. */
export function safeNext(next) {
  // Browsers strip tabs and newlines and read `\` as `/`, so `/\t/host` and
  // `/\host` would both leave this site. Refuse them before resolving.
  if (typeof next !== 'string' || !next.startsWith('/') || /[\u0000-\u001f\\]/.test(next)) return '/'
  try {
    const url = new URL(next, window.location.origin)
    return url.origin === window.location.origin ? `${url.pathname}${url.search}${url.hash}` : '/'
  } catch {
    return '/'
  }
}

export default function LoginPage() {
  const { user, checking, signIn } = useAuth()
  const [params] = useSearchParams()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  if (checking) {
    return (
      <div role="status" className="grid min-h-screen place-items-center text-sm text-ink-2">
        Checking your session…
      </div>
    )
  }
  if (user) return <Navigate to={safeNext(params.get('next'))} replace />

  const onSubmit = async (event) => {
    event.preventDefault()
    setError(null)
    setBusy(true)
    const result = await signIn(username, password)
    setBusy(false)
    if (!result.ok) setError(result.error)
  }

  return (
    <main className="relative grid min-h-screen place-items-center p-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <form onSubmit={onSubmit} noValidate className="panel w-full max-w-sm space-y-4 p-6">
        <div>
          <h1 className="text-xl font-semibold">Crop Health Monitoring</h1>
          <p className="mt-1 text-sm text-ink-2">Sign in with your GeoHub account.</p>
        </div>

        <div className="space-y-1">
          <label htmlFor="username" className="text-sm font-medium">Username</label>
          <input
            id="username"
            name="username"
            type="text"
            className="field"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck="false"
            disabled={busy}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="password" className="text-sm font-medium">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            className="field"
            autoComplete="current-password"
            disabled={busy}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  )
}
