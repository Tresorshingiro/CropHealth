import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

/**
 * Who is signed in. The session lives in an HttpOnly cookie held by the access
 * server, so asking /api/auth/session is the only way the client can know.
 * This context never sees the password after sign-in, and never the token.
 */
const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    let active = true
    fetch('/api/auth/session', { credentials: 'same-origin' })
      .then((res) => res.json())
      .then((data) => {
        if (active) setUser(data.authenticated ? data.user : null)
      })
      .catch(() => {
        if (active) setUser(null)
      })
      .finally(() => {
        if (active) setChecking(false)
      })
    return () => {
      active = false
    }
  }, [])

  const signIn = useCallback(async (username, password) => {
    if (!String(username || '').trim() || !String(password || '')) {
      return { ok: false, error: 'Enter your username and password.' }
    }
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.authenticated) {
        return { ok: false, error: data.error || 'Invalid username or password.' }
      }
      setUser(data.user)
      return { ok: true }
    } catch {
      return { ok: false, error: 'Could not reach the server. Check your connection and try again.' }
    }
  }, [])

  const signOut = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
    } catch {
      // The cookie may survive, but this page forgets the user either way.
    } finally {
      setUser(null)
    }
  }, [])

  /** Called when a data request comes back 401: the server session is gone. */
  const expire = useCallback(() => setUser(null), [])

  const value = useMemo(
    () => ({ user, checking, signIn, signOut, expire }),
    [user, checking, signIn, signOut, expire],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside an AuthProvider')
  return ctx
}
