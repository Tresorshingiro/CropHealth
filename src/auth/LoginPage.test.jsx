import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '../theme/ThemeContext.jsx'
import { AuthProvider } from './AuthContext.jsx'
import AuthGate from './AuthGate.jsx'
import LoginPage, { safeNext } from './LoginPage.jsx'

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })

const USER = { username: 'tresor', fullName: 'Tresor S', email: 'tresor@example.rw' }
const signedOut = () => json({ authenticated: false })
const accepted = () => json({ authenticated: true, user: USER })

function mockFetch({ session = signedOut, login = accepted } = {}) {
  const fn = vi.fn(async (url) => {
    if (url === '/api/auth/session') return session()
    if (url === '/api/auth/login') return login()
    throw new Error(`unexpected request to ${url}`)
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

function Home() {
  const { pathname, search } = useLocation()
  return <p>{`home: ${pathname}${search}`}</p>
}

function renderApp(initial) {
  return render(
    <ThemeProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={[initial]}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<AuthGate><Home /></AuthGate>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </ThemeProvider>,
  )
}

async function signIn(username = 'tresor', password = 'secret') {
  await userEvent.type(await screen.findByLabelText('Username'), username)
  await userEvent.type(screen.getByLabelText('Password'), password)
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('safeNext', () => {
  it('keeps a path on this site', () => {
    expect(safeNext('/?upi=5/05/10/02/1939')).toBe('/?upi=5/05/10/02/1939')
    expect(safeNext('/')).toBe('/')
  })

  it('keeps the path, query and hash of a link on this site', () => {
    expect(safeNext('/?upi=5/05/10/02/1939#chart')).toBe('/?upi=5/05/10/02/1939#chart')
  })

  it.each([
    '//evil.example/x',
    'https://evil.example',
    '/\\evil.example',
    '/\t/evil.example',
    '/\n/evil.example',
    '/ok\\path',
    'javascript:alert(1)',
    '',
    null,
    undefined,
  ])(
    'replaces %s with the home page',
    (value) => {
      expect(safeNext(value)).toBe('/')
    },
  )
})

describe('sign-in page', () => {
  it('shows the message from the portal when sign-in is rejected', async () => {
    mockFetch({ login: () => json({ error: 'Too many invalid logins. Please try again later.' }, 401) })
    renderApp('/login')
    await signIn()
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many invalid logins. Please try again later.')
  })

  it('asks for both fields without contacting the server', async () => {
    const fetchMock = mockFetch()
    renderApp('/login')
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter your GeoHub username and password.')
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/auth/login')).toBe(false)
  })

  it('sends a signed-in visitor to the home page', async () => {
    mockFetch({ session: () => json({ authenticated: true, user: USER }) })
    renderApp('/login')
    expect(await screen.findByText('home: /')).toBeInTheDocument()
  })

  it('does not follow a next link that points to another site', async () => {
    mockFetch()
    renderApp(`/login?next=${encodeURIComponent('//evil.example/x')}`)
    await signIn()
    expect(await screen.findByText('home: /')).toBeInTheDocument()
  })

  it('has a theme toggle', async () => {
    mockFetch()
    renderApp('/login')
    expect(await screen.findByRole('button', { name: /Switch to (dark|light) theme/ })).toBeInTheDocument()
  })
})

describe('route protection', () => {
  it('sends a signed-out visitor to sign in, then back to the parcel they asked for', async () => {
    mockFetch()
    renderApp('/?upi=5/05/10/02/1939')
    await signIn()
    expect(await screen.findByText('home: /?upi=5/05/10/02/1939')).toBeInTheDocument()
  })
})
