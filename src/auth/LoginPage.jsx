import { useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import BrandMark from '../components/BrandMark.jsx'
import ThemeToggle from '../theme/ThemeToggle.jsx'
import { useAuth } from './AuthContext.jsx'

// A public satellite view of the centre-pivot fields by Lake Nasho, from the
// same imagery service the map uses as its basemap. No token needed.
const HERO_URL =
  'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export' +
  '?bbox=30.695,-2.14,30.755,-2.07&bboxSR=4326&imageSR=3857&size=1200,1400&format=jpg&f=image'

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
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <section className="relative flex flex-col justify-center px-6 py-16 sm:px-12">
        <div className="absolute right-4 top-4">
          <ThemeToggle />
        </div>
      <form onSubmit={onSubmit} noValidate className="mx-auto w-full max-w-sm space-y-5">
        <div>
          <BrandMark className="h-11 w-11" />
          <h1 className="mt-2 font-display text-4xl font-semibold leading-[1.05] tracking-tight">
            Crop Health Monitoring
          </h1>
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-2">
            Look up any land parcel by its UPI and see how it is growing, from satellite. Sign in with your GIS
            portal account.
          </p>
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

        <button type="submit" className="btn-primary w-full rounded-xl py-2.5" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      </section>

      {/* Decorative: the page reads the same without it, so it is hidden from
          assistive technology and from small screens. */}
      <aside aria-hidden="true" className="relative hidden overflow-hidden bg-raised lg:block">
        <img src={HERO_URL} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <p className="glass absolute bottom-4 left-4 rounded-full px-4 py-1.5 text-xs text-ink-2 shadow-float">
          Irrigation circles at Nasho, Kirehe · Imagery: Esri World Imagery
        </p>
      </aside>
    </main>
  )
}
