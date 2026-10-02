# Crop Health Monitoring UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in user types a land parcel's UPI and sees its crop health analysis (map, NDVI/NDMI/NDRE cards, 14-month chart, analysed-parcels table) read live from the GIS team's GeoHub services, in a light or dark theme.

**Architecture:** A React single-page app talks only to its own origin. A small Node access server (mounted inside Vite in development, standalone in production) signs the user in to GeoHub, keeps the portal token in a signed HttpOnly cookie, and proxies read-only queries to one feature service. Sentinel-2 imagery is public and loaded by the browser directly.

**Tech Stack:** React 19, Vite 8, Tailwind CSS 3, React Router 7, Recharts 3, ArcGIS Maps SDK for JavaScript (`@arcgis/core` 5.1), Vitest 5 with Testing Library, Node 24 (no server framework).

**Spec:** `docs/superpowers/specs/2026-10-02-crop-health-ui-design.md`

## Global Constraints

- The shell is PowerShell on Windows. Do not use `VAR=x cmd` or `mkdir -p` in scripts or commands.
- JavaScript with JSX, ES modules (`"type": "module"`). No TypeScript.
- The app computes no indices and no interpretation. It shows what the services return.
- Do not build: status badge, season, narrative, trend line, crop-cycle count, running a new analysis, drawing a field, "This year vs last year", "Imagery by date".
- Server settings (`PORTAL_URL`, `SERVER_URL`, `SESSION_SECRET`, `PORTAL_CLIENT_ID`, `PORTAL_CLIENT_SECRET`) are never prefixed `VITE_` and never reach the browser. The portal token never reaches the browser.
- The proxy forwards `GET` only, and only under `/rest/services/Hosted/RW_CropHealth_V2_View/FeatureServer`.
- UPI pattern: `^\d/\d{2}/\d{2}/\d{2}/\d+$`, applied after removing all whitespace. Format message, verbatim: `Enter a UPI in the form 5/05/10/02/1939`.
- Not-found message, verbatim: `This parcel has not been analysed yet.`
- Empty-chart message, verbatim: `No clear observations yet`.
- Browser storage keys: `crophealth-theme` (`light` or `dark`), `crophealth-history` (JSON array of at most 20 UPIs).
- Session cookie name: `crophealth_session`.
- Index colours (validated with the dataviz palette validator for both surfaces): NDVI `#1baf7a` light / `#199e70` dark; NDMI `#2a78d6` light / `#3987e5` dark; NDRE `#eb6834` light / `#d95926` dark. Text never wears these colours; they appear as lines and swatches.
- A missing or non-numeric value is shown as `–` (en dash). Never render `NaN`, `null`, `undefined` or `Invalid Date`.
- Dates are shown as `25 Sep 2026` (UTC, three-letter month).
- Commit after every task.

## Review Focus

1. **Switching parcels quickly:** if an earlier parcel's response arrives after a later one was selected, the page must keep showing the later parcel. Test in Task 12.
2. **Browser storage that is blocked or holds garbage** (private mode, a hand-edited value): theme and history must fall back to defaults and never crash. Tests in Task 2 and Task 5.
3. **Rows with empty values** (a parcel with a null index, an observation with one index missing, a null date): shown as `–`, never `NaN` or `Invalid Date`. Tests in Task 1, Task 6, Task 8 and Task 9.
4. **Path tricks against the proxy** (`..` segments, a look-alike service name, a client-supplied `token`): must not reach any other GeoHub resource or override the session token. Tests in Task 4.
5. **A `next` link that points off-site** on the sign-in page: after sign-in the user must land on this app's home, not the other site. Test in Task 7.

## File Structure

```
index.html                         theme-before-paint script, root element
package.json  vite.config.js  vitest.config.js  tailwind.config.js  postcss.config.js
.env.example  README.md
server/
  access-server.js                 config, session cookie, auth routes, service proxy
  access-server.test.js
  vite-plugin.js                   mounts the middleware in vite dev/preview
  index.js                         production server: middleware + dist/
src/
  main.jsx  App.jsx  index.css
  test/setup.js
  theme/ThemeContext.jsx  ThemeToggle.jsx  palette.js  theme.test.jsx
  lib/format.js  upi.js  history.js  (+ .test.js each)
  api/arcgis.js  cropHealth.js  cropHealth.test.js
  auth/AuthContext.jsx  AuthGate.jsx  LoginPage.jsx  LoginPage.test.jsx
  components/
    IndexCard.jsx  ParcelSummary.jsx  IndexGuideDialog.jsx  ParcelSummary.test.jsx
    IndexChart.jsx  IndexChart.test.jsx
    UpiSearch.jsx  UpiSearch.test.jsx
    ParcelsTable.jsx  ParcelsTable.test.jsx
    ParcelMap.jsx
  pages/Dashboard.jsx  Dashboard.test.jsx
```

---

### Task 1: Project scaffold, theme tokens and formatters

**Files:**
- Create: `package.json`, `index.html`, `vite.config.js`, `vitest.config.js`, `tailwind.config.js`, `postcss.config.js`
- Create: `src/main.jsx`, `src/App.jsx`, `src/index.css`, `src/test/setup.js`
- Create: `src/lib/format.js`
- Test: `src/lib/format.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `formatIndex(value: number|null) → string` (two decimals, `–` when not a finite number, never `-0.00`)
  - `formatDate(ms: number|null) → string` (`25 Sep 2026`, `–` when not a finite number)
  - `formatMonth(ms: number) → string` (`Sep 2026`)
  - `formatHectares(m2: number|null) → string` (`1.85 ha`, `–` when not a finite number)
  - Tailwind colour tokens: `page`, `surface`, `raised`, `line`, `ink`, `ink-2`, `muted`, `accent`, `accent-ink`, `danger`
  - CSS component classes: `.panel`, `.btn-primary`, `.btn-ghost`, `.field`
  - Test setup that clears `localStorage`, the `dark` class, stubbed globals and spies after every test

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "crop-health",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "start": "node server/index.js"
  },
  "dependencies": {
    "@arcgis/core": "^5.1.26",
    "react": "^19.3.0",
    "react-dom": "^19.3.0",
    "react-is": "^19.0.0",
    "react-router-dom": "^7.18.4",
    "recharts": "^3.10.1"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^7.0.1",
    "@testing-library/react": "^16.3.3",
    "@testing-library/user-event": "^14.6.7",
    "@vitejs/plugin-react": "^6.1.1",
    "autoprefixer": "^10.6.1",
    "jsdom": "^30.1.1",
    "postcss": "^8.5.28",
    "tailwindcss": "^3.4.19",
    "vite": "^8.3.2",
    "vitest": "^5.0.3"
  }
}
```

- [ ] **Step 2: Install**

Run: `npm install`
Expected: finishes without `ERESOLVE` errors and creates `node_modules` and `package-lock.json`. `@arcgis/core` is large; allow several minutes.

- [ ] **Step 3: Create the config files**

`vite.config.js`:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
```

`vitest.config.js`:

```js
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'client',
          environment: 'jsdom',
          include: ['src/**/*.test.{js,jsx}'],
          setupFiles: ['./src/test/setup.js'],
        },
      },
    ],
  },
})
```

`postcss.config.js`:

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

`tailwind.config.js`:

```js
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        page: token('page'),
        surface: token('surface'),
        raised: token('raised'),
        line: token('line'),
        ink: token('ink'),
        'ink-2': token('ink-2'),
        muted: token('muted'),
        accent: token('accent'),
        'accent-ink': token('accent-ink'),
        danger: token('danger'),
      },
    },
  },
  plugins: [],
}
```

- [ ] **Step 4: Create `index.html`**

The inline script sets the theme class before the first paint, so the page never flashes the wrong theme.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Crop Health Monitoring</title>
    <script>
      ;(function () {
        try {
          var stored = localStorage.getItem('crophealth-theme')
          var dark =
            stored === 'dark' ||
            (stored !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)
          document.documentElement.classList.toggle('dark', dark)
        } catch (e) {
          /* storage blocked: the light default stays */
        }
      })()
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `src/index.css`**

Values are RGB triplets so Tailwind can apply opacity.

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color-scheme: light;
  --page: 249 249 247;
  --surface: 252 252 251;
  --raised: 240 239 236;
  --line: 225 224 217;
  --ink: 11 11 11;
  --ink-2: 82 81 78;
  --muted: 137 135 129;
  --accent: 15 122 77;
  --accent-ink: 255 255 255;
  --danger: 208 59 59;
}

.dark {
  color-scheme: dark;
  --page: 13 13 13;
  --surface: 26 26 25;
  --raised: 44 44 42;
  --line: 56 56 53;
  --ink: 255 255 255;
  --ink-2: 195 194 183;
  --muted: 137 135 129;
  --accent: 52 211 153;
  --accent-ink: 11 11 11;
  --danger: 230 103 103;
}

body {
  @apply bg-page text-ink antialiased;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
}

@layer components {
  .panel {
    @apply rounded-xl border border-line bg-surface;
  }
  .btn-primary {
    @apply inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60;
  }
  .btn-ghost {
    @apply inline-flex items-center justify-center rounded-md border border-line px-3 py-1.5 text-sm text-ink-2 transition hover:bg-raised hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent;
  }
  .field {
    @apply w-full rounded-md border border-line bg-page px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none;
  }
}
```

- [ ] **Step 6: Create `src/main.jsx`, `src/App.jsx` and `src/test/setup.js`**

`src/main.jsx`:

```jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

`src/App.jsx`:

```jsx
export default function App() {
  return (
    <main className="grid min-h-screen place-items-center">
      <h1 className="text-2xl font-semibold">Crop Health Monitoring</h1>
    </main>
  )
}
```

`src/test/setup.js`:

```js
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// jsdom has no layout engine, so these browser APIs are missing.
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })
}
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.localStorage.clear()
  document.documentElement.classList.remove('dark')
})
```

- [ ] **Step 7: Write the failing formatter tests**

`src/lib/format.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { formatDate, formatHectares, formatIndex, formatMonth } from './format.js'

describe('formatIndex', () => {
  it('rounds to two decimals', () => {
    expect(formatIndex(0.1394)).toBe('0.14')
    expect(formatIndex(-0.2968)).toBe('-0.30')
    expect(formatIndex(0.0684)).toBe('0.07')
  })

  it('never shows a negative zero', () => {
    expect(formatIndex(-0.004)).toBe('0.00')
  })

  it('shows a dash for anything that is not a finite number', () => {
    for (const value of [null, undefined, NaN, Infinity, '0.5', {}]) {
      expect(formatIndex(value)).toBe('–')
    }
  })
})

describe('formatDate', () => {
  it('formats an epoch value as day, short month, year in UTC', () => {
    expect(formatDate(1790294400000)).toBe('25 Sep 2026')
    expect(formatDate(1754265600000)).toBe('4 Aug 2025')
  })

  it('shows a dash for a missing date', () => {
    expect(formatDate(null)).toBe('–')
    expect(formatDate(undefined)).toBe('–')
    expect(formatDate(NaN)).toBe('–')
  })
})

describe('formatMonth', () => {
  it('formats month and year', () => {
    expect(formatMonth(1790294400000)).toBe('Sep 2026')
  })
})

describe('formatHectares', () => {
  it('converts square metres to hectares', () => {
    expect(formatHectares(18477.8)).toBe('1.85 ha')
  })

  it('shows a dash for a missing area', () => {
    expect(formatHectares(null)).toBe('–')
  })
})
```

- [ ] **Step 8: Run the tests and confirm they fail**

Run: `npx vitest run src/lib/format.test.js`
Expected: FAIL, cannot resolve `./format.js`.

- [ ] **Step 9: Implement `src/lib/format.js`**

Month names are spelled out here because `Intl` returns `Sept` for en-GB on recent Node versions.

```js
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DASH = '–'

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value)

export function formatIndex(value) {
  if (!isNumber(value)) return DASH
  const text = value.toFixed(2)
  return text === '-0.00' ? '0.00' : text
}

export function formatDate(ms) {
  if (!isNumber(ms)) return DASH
  const d = new Date(ms)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

export function formatMonth(ms) {
  if (!isNumber(ms)) return DASH
  const d = new Date(ms)
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

export function formatHectares(m2) {
  if (!isNumber(m2)) return DASH
  return `${(m2 / 10000).toFixed(2)} ha`
}
```

- [ ] **Step 10: Run the tests and the build**

Run: `npm test`
Expected: PASS, 8 tests.

Run: `npm run build`
Expected: `dist/` is created with no errors.

- [ ] **Step 11: Commit**

```
git add -A
git commit -m "Scaffold Vite, Tailwind theme tokens, Vitest and formatters"
```

---

### Task 2: Light and dark theme

**Files:**
- Create: `src/theme/ThemeContext.jsx`, `src/theme/ThemeToggle.jsx`, `src/theme/palette.js`
- Modify: `src/main.jsx`
- Test: `src/theme/theme.test.jsx`

**Interfaces:**
- Consumes: Tailwind tokens and `.btn-ghost` from Task 1.
- Produces:
  - `<ThemeProvider>` and `useTheme() → { theme: 'light'|'dark', toggle: () => void }`
  - `<ThemeToggle />`: a button whose accessible name is `Switch to dark theme` or `Switch to light theme`
  - `SERIES`: `[{ key: 'ndvi', code: 'NDVI', hint: 'green cover' }, { key: 'ndmi', code: 'NDMI', hint: 'water' }, { key: 'ndre', code: 'NDRE', hint: 'chlorophyll' }]`
  - `CHART_COLORS[theme]`: `{ ndvi, ndmi, ndre, surface, ink, ink2, text, grid, axis }` (hex strings)

- [ ] **Step 1: Write the failing tests**

`src/theme/theme.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from './ThemeContext.jsx'
import ThemeToggle from './ThemeToggle.jsx'

function systemPrefersDark(matches) {
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    matches,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }))
}

function renderToggle() {
  return render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  )
}

const isDark = () => document.documentElement.classList.contains('dark')

describe('theme', () => {
  it('follows the system setting when nothing is stored', () => {
    systemPrefersDark(true)
    renderToggle()
    expect(isDark()).toBe(true)
    expect(screen.getByRole('button', { name: 'Switch to light theme' })).toBeInTheDocument()
  })

  it('starts light when the system prefers light', () => {
    systemPrefersDark(false)
    renderToggle()
    expect(isDark()).toBe(false)
    expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeInTheDocument()
  })

  it('switches and remembers the choice', async () => {
    systemPrefersDark(false)
    renderToggle()
    await userEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }))
    expect(isDark()).toBe(true)
    expect(window.localStorage.getItem('crophealth-theme')).toBe('dark')
    await userEvent.click(screen.getByRole('button', { name: 'Switch to light theme' }))
    expect(isDark()).toBe(false)
    expect(window.localStorage.getItem('crophealth-theme')).toBe('light')
  })

  it('lets a stored choice win over the system setting', () => {
    window.localStorage.setItem('crophealth-theme', 'light')
    systemPrefersDark(true)
    renderToggle()
    expect(isDark()).toBe(false)
  })

  it('ignores a stored value that is not a theme', () => {
    window.localStorage.setItem('crophealth-theme', 'purple')
    systemPrefersDark(true)
    renderToggle()
    expect(isDark()).toBe(true)
  })

  it('still works when browser storage is blocked', async () => {
    systemPrefersDark(false)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    renderToggle()
    await userEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }))
    expect(isDark()).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run src/theme/theme.test.jsx`
Expected: FAIL, cannot resolve `./ThemeContext.jsx`.

- [ ] **Step 3: Implement the theme files**

`src/theme/ThemeContext.jsx`:

```jsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'crophealth-theme'
const ThemeContext = createContext(null)

function storedTheme() {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

function systemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => storedTheme() || systemTheme())

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  const toggle = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark'
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Storage blocked: the choice lasts for this page only.
    }
    setTheme(next)
  }, [theme])

  const value = useMemo(() => ({ theme, toggle }), [theme, toggle])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside a ThemeProvider')
  return ctx
}
```

`src/theme/ThemeToggle.jsx`:

```jsx
import { useTheme } from './ThemeContext.jsx'

export default function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <button type="button" className="btn-ghost" onClick={toggle} aria-label={`Switch to ${next} theme`}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {theme === 'dark' ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        ) : (
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        )}
      </svg>
    </button>
  )
}
```

`src/theme/palette.js`:

```js
// The chart library takes colours as values, not CSS variables, so the index
// colours and chart chrome live here, keyed by theme. Both sets pass the
// dataviz palette validator against their surface (all pairs, CVD included).
export const SERIES = [
  { key: 'ndvi', code: 'NDVI', hint: 'green cover' },
  { key: 'ndmi', code: 'NDMI', hint: 'water' },
  { key: 'ndre', code: 'NDRE', hint: 'chlorophyll' },
]

export const CHART_COLORS = {
  light: {
    ndvi: '#1baf7a',
    ndmi: '#2a78d6',
    ndre: '#eb6834',
    surface: '#fcfcfb',
    ink: '#0b0b0b',
    ink2: '#52514e',
    text: '#898781',
    grid: '#e1e0d9',
    axis: '#c3c2b7',
  },
  dark: {
    ndvi: '#199e70',
    ndmi: '#3987e5',
    ndre: '#d95926',
    surface: '#1a1a19',
    ink: '#ffffff',
    ink2: '#c3c2b7',
    text: '#898781',
    grid: '#2c2c2a',
    axis: '#383835',
  },
}
```

- [ ] **Step 4: Wrap the app in the provider**

Replace `src/main.jsx` with:

```jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { ThemeProvider } from './theme/ThemeContext.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
)
```

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: PASS, all theme and formatter tests.

- [ ] **Step 6: Commit**

```
git add -A
git commit -m "Add light and dark theme with stored preference"
```

---

### Task 3: Access server: sign-in, session, sign-out

**Files:**
- Create: `server/access-server.js`
- Modify: `vitest.config.js`
- Test: `server/access-server.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `readConfig(env = process.env) → { portalUrl, serverUrl, production, sessionSecret, clientId, clientSecret }`. Throws `SESSION_SECRET must be set to a real value in production` when `NODE_ENV` is `production` and the secret is missing or is `change-this-in-production`.
  - `createAccessMiddleware(config, fetchImpl = globalThis.fetch) → (req, res, next?) => Promise<void>`, a Node/connect middleware.
  - `PROXY_BASE = '/api/gh/server'`, `ALLOWED_PREFIX = '/rest/services/Hosted/RW_CropHealth_V2_View/FeatureServer'`
  - Routes: `POST /api/auth/login` (body `{ username, password }` → 200 `{ authenticated: true, user: { username, fullName, email } }`, 400 for missing fields, 401 with `{ error }` for rejected credentials, 502 when the portal is unreachable), `GET /api/auth/session` → `{ authenticated, user? }`, `POST /api/auth/logout` → `{ authenticated: false }`. Any other `/api/*` path → 404 JSON.

- [ ] **Step 1: Add the server test project**

In `vitest.config.js`, add a second entry to `test.projects`, after the `client` entry:

```js
      {
        extends: true,
        test: {
          name: 'server',
          environment: 'node',
          include: ['server/**/*.test.js'],
        },
      },
```

- [ ] **Step 2: Write the failing tests**

The tests run the middleware in a real HTTP server and replace only the outgoing portal calls with a fake.

`server/access-server.test.js`:

```js
import http from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { createAccessMiddleware, readConfig } from './access-server.js'

const config = readConfig({ PORTAL_URL: 'https://portal.test/portal', SESSION_SECRET: 'test-secret' })

const jsonResponse = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })

/** A fake GeoHub portal: one good password, everything else rejected. */
function portal(url, init = {}) {
  if (url.endsWith('/sharing/rest/generateToken')) {
    const body = new URLSearchParams(init.body)
    if (body.get('password') === 'right') {
      return jsonResponse({ token: 'TOK', expires: Date.now() + 3600_000 })
    }
    if (body.get('password') === 'expired') {
      return jsonResponse({ token: 'OLD', expires: Date.now() - 1000 })
    }
    return jsonResponse({
      error: { code: 400, message: 'Unable to generate token.', details: ['Invalid username or password.'] },
    })
  }
  if (url.endsWith('/sharing/rest/community/self')) {
    return jsonResponse({ username: 'tresor', fullName: 'Tresor S', email: 'tresor@example.rw' })
  }
  return jsonResponse({ error: { code: 404, message: 'Not found' } }, 404)
}

let server

async function start(upstream = portal) {
  const calls = []
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init })
    return upstream(String(url), init)
  }
  const middleware = createAccessMiddleware(config, fetchImpl)
  server = http.createServer((req, res) => middleware(req, res))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { base: `http://127.0.0.1:${server.address().port}`, calls }
}

afterEach(async () => {
  if (!server) return
  server.closeAllConnections()
  await new Promise((resolve) => server.close(resolve))
  server = null
})

const login = (base, username, password) =>
  fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })

const cookieOf = (res) => (res.headers.get('set-cookie') || '').split(';')[0]

describe('readConfig', () => {
  it('derives the server URL from the portal URL', () => {
    expect(config.serverUrl).toBe('https://portal.test/server')
  })

  it('refuses to run in production without a real session secret', () => {
    expect(() => readConfig({ NODE_ENV: 'production' })).toThrow(/SESSION_SECRET/)
    expect(() =>
      readConfig({ NODE_ENV: 'production', SESSION_SECRET: 'change-this-in-production' }),
    ).toThrow(/SESSION_SECRET/)
  })
})

describe('sign-in', () => {
  it('signs in, sets an HttpOnly cookie and returns the user without the token', async () => {
    const { base, calls } = await start()
    const res = await login(base, ' tresor ', 'right')
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(JSON.parse(text)).toEqual({
      authenticated: true,
      user: { username: 'tresor', fullName: 'Tresor S', email: 'tresor@example.rw' },
    })
    expect(text).not.toContain('TOK')
    const setCookie = res.headers.get('set-cookie')
    expect(setCookie).toMatch(/^crophealth_session=/)
    expect(setCookie).toMatch(/HttpOnly/)
    expect(setCookie).toMatch(/SameSite=Lax/)

    const tokenCall = calls.find((c) => c.url.endsWith('/generateToken'))
    const body = new URLSearchParams(tokenCall.init.body)
    expect(body.get('username')).toBe('tresor')
    expect(body.get('client')).toBe('referer')
    expect(body.get('referer')).toBe(base)
  })

  it('returns the portal message when the credentials are rejected', async () => {
    const { base } = await start()
    const res = await login(base, 'tresor', 'wrong')
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Invalid username or password.' })
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('asks for both fields without calling the portal', async () => {
    const { base, calls } = await start()
    const res = await login(base, '', '')
    expect(res.status).toBe(400)
    expect(calls).toHaveLength(0)
  })

  it('rejects a body that is not JSON', async () => {
    const { base } = await start()
    const res = await fetch(`${base}/api/auth/login`, { method: 'POST', body: 'not json' })
    expect(res.status).toBe(400)
  })

  it('reports an unreachable portal as 502', async () => {
    const { base } = await start(() => {
      throw new Error('ECONNREFUSED')
    })
    const res = await login(base, 'tresor', 'right')
    expect(res.status).toBe(502)
  })
})

describe('session', () => {
  it('reports the signed-in user', async () => {
    const { base } = await start()
    const cookie = cookieOf(await login(base, 'tresor', 'right'))
    const res = await fetch(`${base}/api/auth/session`, { headers: { cookie } })
    expect(await res.json()).toEqual({
      authenticated: true,
      user: { username: 'tresor', fullName: 'Tresor S', email: 'tresor@example.rw' },
    })
  })

  it('is unauthenticated with no cookie', async () => {
    const { base } = await start()
    const res = await fetch(`${base}/api/auth/session`)
    expect(await res.json()).toEqual({ authenticated: false })
  })

  it('rejects a cookie whose content was changed', async () => {
    const { base } = await start()
    const cookie = cookieOf(await login(base, 'tresor', 'right'))
    const [name, value] = cookie.split('=')
    const forgedBody = Buffer.from(JSON.stringify({ token: 'x', username: 'admin' })).toString('base64url')
    const forged = `${name}=${forgedBody}.${value.split('.')[1]}`
    const res = await fetch(`${base}/api/auth/session`, { headers: { cookie: forged } })
    expect(await res.json()).toEqual({ authenticated: false })
  })

  it('treats an expired token as signed out', async () => {
    const { base } = await start()
    const cookie = cookieOf(await login(base, 'tresor', 'expired'))
    const res = await fetch(`${base}/api/auth/session`, { headers: { cookie } })
    expect(await res.json()).toEqual({ authenticated: false })
  })

  it('clears the cookie on sign-out', async () => {
    const { base } = await start()
    const res = await fetch(`${base}/api/auth/logout`, { method: 'POST' })
    expect(await res.json()).toEqual({ authenticated: false })
    expect(res.headers.get('set-cookie')).toMatch(/crophealth_session=;.*Max-Age=0/)
  })

  it('answers unknown API paths with 404 JSON', async () => {
    const { base } = await start()
    const res = await fetch(`${base}/api/nope`)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Not found.' })
  })
})
```

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `npx vitest run server/access-server.test.js`
Expected: FAIL, cannot resolve `./access-server.js`.

- [ ] **Step 4: Implement `server/access-server.js`**

```js
/**
 * Access server for the Crop Health app.
 *
 * The GeoHub services are private, so the browser cannot call them directly.
 * This middleware signs the user in to the portal, keeps the portal token in a
 * signed HttpOnly cookie, and (see the proxy route) forwards read-only queries
 * to one feature service with that token attached. The browser never sees the
 * token.
 */
import crypto from 'node:crypto'

export const PROXY_BASE = '/api/gh/server'
export const ALLOWED_PREFIX = '/rest/services/Hosted/RW_CropHealth_V2_View/FeatureServer'

const COOKIE = 'crophealth_session'
const DEV_SECRET = 'crophealth-dev-secret'
const PLACEHOLDER_SECRET = 'change-this-in-production'

export function readConfig(env = process.env) {
  const portalUrl = (env.PORTAL_URL || 'https://gh.space.gov.rw/portal').replace(/\/$/, '')
  const serverUrl = (env.SERVER_URL || portalUrl.replace(/\/portal$/, '/server')).replace(/\/$/, '')
  const production = env.NODE_ENV === 'production'
  const secret = env.SESSION_SECRET || ''
  if (production && (!secret || secret === PLACEHOLDER_SECRET)) {
    throw new Error('SESSION_SECRET must be set to a real value in production')
  }
  return {
    portalUrl,
    serverUrl,
    production,
    sessionSecret: secret && secret !== PLACEHOLDER_SECRET ? secret : DEV_SECRET,
    clientId: env.PORTAL_CLIENT_ID || '',
    clientSecret: env.PORTAL_CLIENT_SECRET || '',
  }
}

function sendJson(res, status, data) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(data))
}

function parseCookies(header = '') {
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const i = part.indexOf('=')
        return i === -1 ? [part, ''] : [part.slice(0, i), part.slice(i + 1)]
      }),
  )
}

async function readJsonBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 64 * 1024) throw new Error('Request body too large')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

/**
 * The origin this request arrived on. The portal token is bound to it as a
 * referer at sign-in, so the proxy must present the same value later.
 */
function requestOrigin(req) {
  const proto = req.headers['x-forwarded-proto'] || (req.socket?.encrypted ? 'https' : 'http')
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost'
  return `${proto}://${host}`
}

class PortalUnreachable extends Error {}

export function createAccessMiddleware(config, fetchImpl = globalThis.fetch) {
  const hmac = (body) => crypto.createHmac('sha256', config.sessionSecret).update(body).digest('base64url')

  function sign(payload) {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
    return `${body}.${hmac(body)}`
  }

  function unsign(value) {
    if (!value || !value.includes('.')) return null
    const [body, sig] = value.split('.')
    const given = Buffer.from(sig || '')
    const expected = Buffer.from(hmac(body))
    // Length check first: timingSafeEqual throws on mismatched lengths.
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null
    try {
      const data = JSON.parse(Buffer.from(body, 'base64url').toString())
      if (!data.expiresAt || Date.now() > data.expiresAt) return null
      return data
    } catch {
      return null
    }
  }

  const readSession = (req) => unsign(parseCookies(req.headers.cookie)[COOKIE])

  function cookieHeader(req, value, maxAgeSec) {
    const flags = ['HttpOnly', 'Path=/', 'SameSite=Lax', `Max-Age=${maxAgeSec}`]
    const host = String(req.headers.host || '').split(':')[0]
    const local = host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
    // Browsers drop Secure cookies on an untrusted local certificate, and
    // localhost is already a secure context, so the flag is skipped there.
    if (config.production && !local) flags.push('Secure')
    return `${COOKIE}=${value}; ${flags.join('; ')}`
  }

  const clearSession = (req, res) => res.setHeader('Set-Cookie', cookieHeader(req, '', 0))

  async function portalPost(path, params, origin) {
    let res
    try {
      res = await fetchImpl(`${config.portalUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', referer: origin },
        body: new URLSearchParams({ ...params, f: 'json' }),
      })
    } catch {
      throw new PortalUnreachable()
    }
    return res.json().catch(() => ({}))
  }

  /** Exchange GeoHub credentials for a portal token. Server-side only. */
  async function generatePortalToken(username, password, origin) {
    // Preferred when the GIS team has registered this app on the portal.
    if (config.clientId && config.clientSecret) {
      const data = await portalPost(
        '/sharing/rest/oauth2/token',
        {
          grant_type: 'password',
          client_id: config.clientId,
          client_secret: config.clientSecret,
          username,
          password,
        },
        origin,
      )
      const token = data.access_token || data.token
      if (token) return { token, expiresAt: Date.now() + Number(data.expires_in || 1800) * 1000 }
    }

    const data = await portalPost(
      '/sharing/rest/generateToken',
      { username, password, client: 'referer', referer: origin, expiration: '480' },
      origin,
    )
    if (!data?.token) {
      // The useful part is in `details`, e.g. "Too many invalid logins."
      const err = data?.error || {}
      const detail = Array.isArray(err.details) ? err.details.filter(Boolean).join(' ') : ''
      const failure = new Error(detail || err.message || 'Invalid username or password.')
      failure.rejected = true
      throw failure
    }
    return { token: data.token, expiresAt: Number(data.expires) || Date.now() + 480 * 60 * 1000 }
  }

  async function hydrateUser(token, origin, fallbackUsername) {
    try {
      const d = await portalPost('/sharing/rest/community/self', { token }, origin)
      const username = d.username || fallbackUsername
      return { username, fullName: d.fullName || username, email: d.email || '' }
    } catch {
      return { username: fallbackUsername, fullName: fallbackUsername, email: '' }
    }
  }

  async function login(req, res) {
    let body
    try {
      body = await readJsonBody(req)
    } catch {
      return sendJson(res, 400, { error: 'Enter your GeoHub username and password.' })
    }
    const username = String(body?.username || '').trim()
    const password = String(body?.password || '')
    if (!username || !password) {
      return sendJson(res, 400, { error: 'Enter your GeoHub username and password.' })
    }
    const origin = requestOrigin(req)
    try {
      const { token, expiresAt } = await generatePortalToken(username, password, origin)
      const user = await hydrateUser(token, origin, username)
      const maxAge = Math.max(60, Math.floor((expiresAt - Date.now()) / 1000))
      res.setHeader('Set-Cookie', cookieHeader(req, sign({ token, ...user, expiresAt }), maxAge))
      return sendJson(res, 200, { authenticated: true, user })
    } catch (err) {
      if (err instanceof PortalUnreachable) {
        return sendJson(res, 502, { error: 'Could not reach GeoHub. Try again in a moment.' })
      }
      if (err.rejected) return sendJson(res, 401, { error: err.message })
      throw err
    }
  }

  return async function accessMiddleware(req, res, next) {
    const url = new URL(req.url, 'http://localhost')
    const { pathname } = url

    try {
      if (pathname === '/api/auth/login') {
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed.' })
        return await login(req, res)
      }

      if (pathname === '/api/auth/session' && req.method === 'GET') {
        const s = readSession(req)
        if (!s?.token) return sendJson(res, 200, { authenticated: false })
        return sendJson(res, 200, {
          authenticated: true,
          user: { username: s.username, fullName: s.fullName, email: s.email },
        })
      }

      if (pathname === '/api/auth/logout' && req.method === 'POST') {
        clearSession(req, res)
        return sendJson(res, 200, { authenticated: false })
      }

      if (pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'Not found.' })
    } catch {
      return sendJson(res, 500, { error: 'Something went wrong on the server.' })
    }

    if (typeof next === 'function') return next()
    res.statusCode = 404
    res.end('Not found')
  }
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run server/access-server.test.js`
Expected: PASS, 13 tests.

- [ ] **Step 6: Commit**

```
git add -A
git commit -m "Add access server sign-in, session and sign-out"
```

---

### Task 4: Access server: service proxy, Vite plugin, production server

**Files:**
- Modify: `server/access-server.js`, `server/access-server.test.js`, `vite.config.js`
- Create: `server/vite-plugin.js`, `server/index.js`, `.env.example`, `README.md`

**Interfaces:**
- Consumes: `createAccessMiddleware`, `readConfig`, `PROXY_BASE`, `ALLOWED_PREFIX`, and the internal `readSession`, `clearSession`, `requestOrigin`, `sendJson` from Task 3.
- Produces:
  - `GET /api/gh/server/rest/services/Hosted/RW_CropHealth_V2_View/FeatureServer/**`: forwards to `${config.serverUrl}` + the same path with the session token. Responses: 401 `{ error }` with no session or when ArcGIS answers error code 498/499 (cookie cleared), 404 outside the service, 405 for non-GET, 502 when GeoHub is unreachable, otherwise the upstream status and body.
  - `accessServerPlugin(env) → VitePlugin`
  - `npm start` serves `dist/` plus the middleware on `PORT` (default 4173).

- [ ] **Step 1: Write the failing proxy tests**

Append to `server/access-server.test.js`:

```js
describe('service proxy', () => {
  const SERVICE = '/api/gh/server/rest/services/Hosted/RW_CropHealth_V2_View/FeatureServer'

  /** Sign in against the fake portal, with `service` answering feature-service calls. */
  async function signedIn(service) {
    const ctx = await start((url, init) =>
      url.startsWith('https://portal.test/server/') ? service(url, init) : portal(url, init),
    )
    const cookie = cookieOf(await login(ctx.base, 'tresor', 'right'))
    const serviceCalls = () => ctx.calls.filter((c) => c.url.startsWith('https://portal.test/server/'))
    return { ...ctx, cookie, serviceCalls }
  }

  /** fetch() normalises `..` before sending, so raw paths need http.request. */
  function rawGet(base, path, cookie) {
    return new Promise((resolve, reject) => {
      const { hostname, port } = new URL(base)
      const req = http.request({ hostname, port, path, method: 'GET', headers: { cookie } }, (res) => {
        let body = ''
        res.on('data', (chunk) => (body += chunk))
        res.on('end', () => resolve({ status: res.statusCode, body }))
      })
      req.on('error', reject)
      req.end()
    })
  }

  it('forwards a query with the session token and the bound referer', async () => {
    const { base, cookie, serviceCalls } = await signedIn(() => jsonResponse({ features: [{ attributes: { upi: 'x' } }] }))
    const res = await fetch(`${base}${SERVICE}/0/query?where=1%3D1&f=json&token=EVIL`, { headers: { cookie } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ features: [{ attributes: { upi: 'x' } }] })

    const [call] = serviceCalls()
    const sent = new URL(call.url)
    expect(sent.pathname).toBe('/server/rest/services/Hosted/RW_CropHealth_V2_View/FeatureServer/0/query')
    expect(sent.searchParams.get('where')).toBe('1=1')
    expect(sent.searchParams.getAll('token')).toEqual(['TOK'])
    expect(call.init.headers.referer).toBe(base)
  })

  it('refuses a request with no session and does not call GeoHub', async () => {
    const { base, serviceCalls } = await signedIn(() => jsonResponse({}))
    const res = await fetch(`${base}${SERVICE}/0/query?f=json`)
    expect(res.status).toBe(401)
    expect(serviceCalls()).toHaveLength(0)
  })

  it('returns 404 for any other service', async () => {
    const { base, cookie, serviceCalls } = await signedIn(() => jsonResponse({}))
    const paths = [
      '/api/gh/server/rest/services/Hosted/Other/FeatureServer/0/query',
      '/api/gh/server/rest/services/Hosted/RW_CropHealth_V2_ViewX/FeatureServer/0/query',
      '/api/gh/server/rest/services/Hosted/RW_CropHealth_V2_View/FeatureServerX/0',
      '/api/gh/server/admin',
      '/api/gh/server',
    ]
    for (const path of paths) {
      const res = await fetch(`${base}${path}`, { headers: { cookie } })
      expect(res.status, path).toBe(404)
    }
    expect(serviceCalls()).toHaveLength(0)
  })

  it('returns 404 when dot segments try to leave the service', async () => {
    const { base, cookie, serviceCalls } = await signedIn(() => jsonResponse({}))
    const paths = [
      `${SERVICE}/../../Other/FeatureServer/0/query`,
      `${SERVICE}/%2e%2e/%2e%2e/Other/FeatureServer/0/query`,
      `${SERVICE}/0/../../../../../../portal/sharing/rest/portals/self`,
    ]
    for (const path of paths) {
      const res = await rawGet(base, path, cookie)
      expect(res.status, path).toBe(404)
    }
    expect(serviceCalls()).toHaveLength(0)
  })

  it('refuses methods other than GET', async () => {
    const { base, cookie, serviceCalls } = await signedIn(() => jsonResponse({}))
    const res = await fetch(`${base}${SERVICE}/0/applyEdits`, { method: 'POST', headers: { cookie }, body: 'f=json' })
    expect(res.status).toBe(405)
    expect(serviceCalls()).toHaveLength(0)
  })

  it('turns an ArcGIS invalid-token answer into 401 and clears the cookie', async () => {
    for (const code of [498, 499]) {
      const { base, cookie } = await signedIn(() => jsonResponse({ error: { code, message: 'Invalid token.' } }))
      const res = await fetch(`${base}${SERVICE}/0/query?f=json`, { headers: { cookie } })
      expect(res.status).toBe(401)
      expect(res.headers.get('set-cookie')).toMatch(/crophealth_session=;.*Max-Age=0/)
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
      server = null
    }
  })

  it('passes other ArcGIS errors through unchanged', async () => {
    const { base, cookie } = await signedIn(() => jsonResponse({ error: { code: 400, message: 'Invalid query' } }))
    const res = await fetch(`${base}${SERVICE}/0/query?f=json`, { headers: { cookie } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ error: { code: 400, message: 'Invalid query' } })
  })

  it('reports an unreachable GeoHub as 502', async () => {
    const { base, cookie } = await signedIn(() => {
      throw new Error('ECONNRESET')
    })
    const res = await fetch(`${base}${SERVICE}/0/query?f=json`, { headers: { cookie } })
    expect(res.status).toBe(502)
  })
})
```

- [ ] **Step 2: Run the tests and confirm the new ones fail**

Run: `npx vitest run server/access-server.test.js`
Expected: the `service proxy` tests FAIL (the forwarding test gets 404 where it expects 200); the Task 3 tests still pass.

- [ ] **Step 3: Add the proxy to `server/access-server.js`**

Inside `createAccessMiddleware`, add this function after `login`:

```js
  async function proxy(req, res, url) {
    // url.pathname is already normalised by the URL parser, so `..` and
    // `%2e%2e` segments have been resolved before this check.
    const rest = url.pathname.slice(PROXY_BASE.length)
    if (rest !== ALLOWED_PREFIX && !rest.startsWith(`${ALLOWED_PREFIX}/`)) {
      return sendJson(res, 404, { error: 'Not found.' })
    }
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed.' })

    const session = readSession(req)
    if (!session?.token) return sendJson(res, 401, { error: 'Sign in to continue.' })

    const target = new URL(`${config.serverUrl}${rest}`)
    // The session's token is the only one that counts.
    url.searchParams.forEach((value, key) => {
      if (key !== 'token') target.searchParams.append(key, value)
    })
    target.searchParams.set('token', session.token)

    let upstream
    let text
    try {
      upstream = await fetchImpl(target, {
        headers: { accept: 'application/json', referer: requestOrigin(req) },
        redirect: 'manual',
      })
      text = await upstream.text()
    } catch {
      return sendJson(res, 502, { error: 'Could not reach GeoHub. Try again in a moment.' })
    }

    // ArcGIS reports a dead token as HTTP 200 with the failure in the body.
    let code = null
    try {
      code = JSON.parse(text)?.error?.code ?? null
    } catch {
      // Not JSON: pass it through as it is.
    }
    if (code === 498 || code === 499) {
      clearSession(req, res)
      return sendJson(res, 401, { error: 'Your session has expired. Sign in again.' })
    }

    res.statusCode = upstream.status
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.end(text)
  }
```

In `accessMiddleware`, add the route immediately before the line `if (pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'Not found.' })`:

```js
      if (pathname === PROXY_BASE || pathname.startsWith(`${PROXY_BASE}/`)) {
        return await proxy(req, res, url)
      }
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run server/access-server.test.js`
Expected: PASS, 21 tests.

- [ ] **Step 5: Create `server/vite-plugin.js` and wire it into Vite**

`server/vite-plugin.js`:

```js
import { createAccessMiddleware, readConfig } from './access-server.js'

/**
 * Mounts the access server inside Vite for `npm run dev` and `npm run preview`.
 * Production uses server/index.js, which mounts the same middleware.
 */
export function accessServerPlugin(env) {
  // Built only when a server starts, so `vite build` never needs the secrets.
  // A Vite-hosted server is a local tool: NODE_ENV is pinned so `vite preview`
  // runs without a production SESSION_SECRET. Real production is server/index.js.
  const mount = (server) => {
    server.middlewares.use(createAccessMiddleware(readConfig({ ...env, NODE_ENV: 'development' })))
  }
  return {
    name: 'crophealth-access-server',
    configureServer: mount,
    configurePreviewServer: mount,
  }
}
```

Replace `vite.config.js` with:

```js
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { accessServerPlugin } from './server/vite-plugin.js'

export default defineConfig(({ mode }) => {
  // '' loads every key in .env, not only VITE_ ones. They stay on the server:
  // nothing here is passed to `define`.
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), accessServerPlugin(env)],
  }
})
```

- [ ] **Step 6: Create `server/index.js`**

```js
/**
 * Production server: serves the built dist/ and mounts the access server in
 * front of it. A static host alone cannot run this app, because sign-in and
 * the GeoHub proxy are routes on this process.
 *
 * Run:  npm run build, then npm start
 */
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAccessMiddleware, readConfig } from './access-server.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'dist')

/** Vite loads .env in development; this process has to do it itself. */
function loadEnvFile() {
  const file = path.join(ROOT, '.env')
  if (!fs.existsSync(file)) return
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    const value = line.slice(eq + 1).trim().replace(/^(['"])(.*)\1$/, '$2')
    if (!(key in process.env)) process.env[key] = value
  }
}
loadEnvFile()
// `npm start` is the production entry on every platform, Windows included.
process.env.NODE_ENV ||= 'production'

if (!fs.existsSync(DIST)) {
  console.error(`No build found at ${DIST}. Run "npm run build" first.`)
  process.exit(1)
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
}

function serveStatic(req, res) {
  const url = new URL(req.url, 'http://localhost')
  let rel
  try {
    rel = decodeURIComponent(url.pathname)
  } catch {
    res.statusCode = 400
    return res.end('Bad request')
  }
  const filePath = path.resolve(DIST, `.${rel}`)
  if (filePath !== DIST && !filePath.startsWith(DIST + path.sep)) {
    res.statusCode = 403
    return res.end('Forbidden')
  }
  // Client-side routes (/login, /?upi=...) fall back to index.html.
  const isFile = fs.existsSync(filePath) && fs.statSync(filePath).isFile()
  const target = isFile ? filePath : path.join(DIST, 'index.html')
  res.setHeader('Content-Type', TYPES[path.extname(target)] || 'application/octet-stream')
  // Only Vite's hashed output is safe to cache forever.
  const hashed = target.startsWith(path.join(DIST, 'assets') + path.sep)
  res.setHeader('Cache-Control', hashed ? 'public, max-age=31536000, immutable' : 'no-cache')
  fs.createReadStream(target).pipe(res)
}

const middleware = createAccessMiddleware(readConfig())
const PORT = Number(process.env.PORT || 4173)

const server = http.createServer((req, res) => middleware(req, res, () => serveStatic(req, res)))

server.on('error', (err) => {
  console.error(
    err.code === 'EADDRINUSE'
      ? `Port ${PORT} is already in use. Set PORT to another value.`
      : `Server failed to start: ${err.message}`,
  )
  process.exit(1)
})

server.listen(PORT, () => {
  console.log(`Crop Health listening on http://localhost:${PORT}`)
})
```

- [ ] **Step 7: Create `.env.example` and `README.md`**

`.env.example`:

```
# Server-side only. Never prefix these with VITE_.
PORTAL_URL=https://gh.space.gov.rw/portal
# Optional. Defaults to PORTAL_URL with /portal replaced by /server.
SERVER_URL=

# Signs the session cookie. Required in production.
# Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
SESSION_SECRET=change-this-in-production

# Optional. If the GIS team registers this app on GeoHub, sign-in uses the
# OAuth password grant; without them it uses generateToken.
PORTAL_CLIENT_ID=
PORTAL_CLIENT_SECRET=

# Optional. Port for `npm start`. Defaults to 4173.
PORT=
```

`README.md`:

````markdown
# Crop Health Monitoring

A web app for looking up a land parcel by UPI and viewing its crop health
analysis (NDVI, NDMI, NDRE) from the GIS team's GeoHub services.

## Run it

```
npm install
npm run dev
```

Open http://localhost:5173 and sign in with a GeoHub account that can see the
`RW_CropHealth_V2_View` layer. No `.env` file is needed for development.

## Test

```
npm test
```

## Production

```
copy .env.example .env     # then set SESSION_SECRET to a real value
npm run build
npm start
```

`npm start` runs `server/index.js`, which serves `dist/` and the API routes on
one port. It speaks plain HTTP: put it behind an HTTPS reverse proxy that sets
`X-Forwarded-Proto` and `X-Forwarded-Host`, so the session cookie is marked
Secure and the portal token is bound to the public address.

The app cannot be hosted as static files only. Sign-in (`/api/auth/*`) and the
GeoHub proxy (`/api/gh/server/*`) are routes on the Node process.

## How access works

1. The sign-in form posts the GeoHub username and password to this server.
2. The server exchanges them for a portal token and stores it in a signed,
   HttpOnly cookie. The browser never sees the token.
3. Data requests go to `/api/gh/server/...`. The server adds the token and
   forwards them to GeoHub. Only `GET` requests to the
   `RW_CropHealth_V2_View` feature service are forwarded.

Sentinel-2 imagery is public and loaded by the browser directly.
````

- [ ] **Step 8: Check the dev server serves the API**

Run: `npm run dev` (leave it running), then in a second terminal:

```
(Invoke-WebRequest http://localhost:5173/api/auth/session -UseBasicParsing).Content
```

Expected: `{"authenticated":false}`

```
try { Invoke-WebRequest "http://localhost:5173/api/gh/server/rest/services/Hosted/RW_CropHealth_V2_View/FeatureServer/0/query?f=json" -UseBasicParsing } catch { $_.Exception.Response.StatusCode.value__ }
```

Expected: `401`

Stop the dev server.

- [ ] **Step 9: Run all tests and commit**

Run: `npm test`
Expected: PASS.

```
git add -A
git commit -m "Add GeoHub service proxy, Vite plugin and production server"
```

---

### Task 5: UPI validation and search history

**Files:**
- Create: `src/lib/upi.js`, `src/lib/history.js`
- Test: `src/lib/upi.test.js`, `src/lib/history.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `UPI_FORMAT_MESSAGE = 'Enter a UPI in the form 5/05/10/02/1939'`
  - `parseUpi(input: unknown) → string | null`: the UPI with all whitespace removed, or `null` when it does not match the pattern.
  - `readHistory() → string[]` (most recent first, at most 20, only valid UPIs)
  - `addToHistory(upi: string) → string[]` (the new list; moves an existing entry to the front)

- [ ] **Step 1: Write the failing tests**

`src/lib/upi.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { parseUpi } from './upi.js'

describe('parseUpi', () => {
  it('accepts a well-formed UPI', () => {
    expect(parseUpi('5/05/10/02/1939')).toBe('5/05/10/02/1939')
    expect(parseUpi('1/01/01/01/7')).toBe('1/01/01/01/7')
  })

  it('removes surrounding and inner whitespace', () => {
    expect(parseUpi('  5/05/10/02/1939\n')).toBe('5/05/10/02/1939')
    expect(parseUpi('5 / 05 / 10 / 02 / 1939')).toBe('5/05/10/02/1939')
    expect(parseUpi('5/05/10/02/1939\t')).toBe('5/05/10/02/1939')
  })

  it('rejects anything else', () => {
    const bad = [
      '',
      '   ',
      '5/5/10/02/1939',
      '5/05/10/02',
      '5/05/10/02/',
      '55/05/10/02/1939',
      '5-05-10-02-1939',
      '5/05/10/02/19a9',
      "5/05/10/02/1939' OR '1'='1",
      '5/05/10/02/1939;--',
      null,
      undefined,
      42,
    ]
    for (const value of bad) expect(parseUpi(value), String(value)).toBeNull()
  })
})
```

`src/lib/history.test.js`:

```js
import { describe, expect, it, vi } from 'vitest'
import { addToHistory, readHistory } from './history.js'

const upi = (n) => `5/05/10/02/${n}`

describe('history', () => {
  it('starts empty', () => {
    expect(readHistory()).toEqual([])
  })

  it('puts the newest UPI first', () => {
    addToHistory(upi(1))
    expect(addToHistory(upi(2))).toEqual([upi(2), upi(1)])
    expect(readHistory()).toEqual([upi(2), upi(1)])
  })

  it('moves a repeated UPI to the front without duplicating it', () => {
    addToHistory(upi(1))
    addToHistory(upi(2))
    expect(addToHistory(upi(1))).toEqual([upi(1), upi(2)])
  })

  it('keeps at most 20 entries', () => {
    for (let n = 1; n <= 25; n += 1) addToHistory(upi(n))
    const list = readHistory()
    expect(list).toHaveLength(20)
    expect(list[0]).toBe(upi(25))
    expect(list[19]).toBe(upi(6))
  })

  it('returns an empty list when the stored value is not valid JSON', () => {
    window.localStorage.setItem('crophealth-history', '{not json')
    expect(readHistory()).toEqual([])
  })

  it('drops stored entries that are not valid UPIs', () => {
    window.localStorage.setItem('crophealth-history', JSON.stringify([upi(1), 7, null, '<b>x</b>', upi(2)]))
    expect(readHistory()).toEqual([upi(1), upi(2)])
  })

  it('returns an empty list when the stored value is not an array', () => {
    window.localStorage.setItem('crophealth-history', JSON.stringify({ a: 1 }))
    expect(readHistory()).toEqual([])
  })

  it('does not throw when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(readHistory()).toEqual([])
    expect(addToHistory(upi(1))).toEqual([upi(1)])
  })
})
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run src/lib/upi.test.js src/lib/history.test.js`
Expected: FAIL, cannot resolve `./upi.js` and `./history.js`.

- [ ] **Step 3: Implement**

`src/lib/upi.js`:

```js
// province / district / sector / cell / parcel number, e.g. 5/05/10/02/1939
const UPI_PATTERN = /^\d\/\d{2}\/\d{2}\/\d{2}\/\d+$/

export const UPI_FORMAT_MESSAGE = 'Enter a UPI in the form 5/05/10/02/1939'

/**
 * The cleaned UPI, or null when the input is not one. Everything that reaches
 * a query passes through here, so only digits and slashes ever do.
 */
export function parseUpi(input) {
  if (typeof input !== 'string') return null
  const upi = input.replace(/\s+/g, '')
  return UPI_PATTERN.test(upi) ? upi : null
}
```

`src/lib/history.js`:

```js
import { parseUpi } from './upi.js'

const STORAGE_KEY = 'crophealth-history'
const LIMIT = 20

export function readHistory() {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]')
    if (!Array.isArray(value)) return []
    return value.filter((item) => typeof item === 'string' && parseUpi(item) === item).slice(0, LIMIT)
  } catch {
    return []
  }
}

export function addToHistory(upi) {
  const next = [upi, ...readHistory().filter((item) => item !== upi)].slice(0, LIMIT)
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage blocked: history lasts for this page only.
  }
  return next
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/upi.test.js src/lib/history.test.js`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```
git add -A
git commit -m "Add UPI validation and search history"
```

---

### Task 6: Data layer

**Files:**
- Create: `src/api/arcgis.js`, `src/api/cropHealth.js`
- Test: `src/api/cropHealth.test.js`

**Interfaces:**
- Consumes: `parseUpi` from Task 5; the proxy route from Task 4.
- Produces:
  - Error classes `SessionExpiredError`, `PortalError`, `NetworkError` (all extend `Error`, each with a user-readable `message`). A cancelled request rejects with the browser's `AbortError`, unchanged.
  - `getParcel(upi, { signal }?) → Promise<Parcel | null>`
  - `getObservations(upi, { signal }?) → Promise<Observation[]>` (ascending by date)
  - `listParcels({ signal }?) → Promise<{ parcels: ParcelRow[], truncated: boolean }>`
  - `getIndexGuide() → Promise<GuideEntry[]>` (cached after the first success), `resetIndexGuideCache()`
  - Shapes (numbers are `number | null`, strings are `string | null`):
    - `Parcel`: `{ upi, province, district, sector, cell, village, areaM2, reliability, latestDate, ndvi, ndmi, ndre, ndviLevel, ndmiLevel, ndreLevel, headline, usableDates, lastRefreshed, rings }` where `rings` is `number[][][] | null` in WGS84
    - `Observation`: `{ date: number, ndvi, ndmi, ndre, clearShare }`
    - `ParcelRow`: `{ upi, district, ndviLevel, latestDate, rings }`
    - `GuideEntry`: `{ code, name, meaning, howToRead, thresholds, caveats, formula, bands, reference }`

- [ ] **Step 1: Write the failing tests**

`src/api/cropHealth.test.js`:

```js
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NetworkError, PortalError, SessionExpiredError } from './arcgis.js'
import { getIndexGuide, getObservations, getParcel, listParcels, resetIndexGuideCache } from './cropHealth.js'

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })

let fetchMock
const sentUrl = (i = 0) => new URL(fetchMock.mock.calls[i][0], 'http://localhost')

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  resetIndexGuideCache()
})

const PARCEL_FEATURE = {
  attributes: {
    upi: '5/05/10/02/1939',
    province: 'Eastern',
    district: 'Kirehe',
    sector: 'Nasho',
    cell: 'Kagese',
    village: 'Kagese Ii',
    area_m2: 18477.8,
    reliability: 'good',
    latest_date: 1790294400000,
    ndvi: 0.1394,
    ndmi: -0.2968,
    ndre: 0.0684,
    ndvi_level: 'bare ground',
    ndmi_level: 'very dry',
    ndre_level: 'very little chlorophyll',
    headline: 'On 25 Sep 2026: NDVI 0.14 (bare ground).',
    usable_dates: 87,
    last_refreshed: 1790778688448,
    status: null,
  },
  geometry: { rings: [[[30.7, -2.3], [30.71, -2.3], [30.71, -2.29], [30.7, -2.3]]] },
}

describe('getParcel', () => {
  it('queries the parcel layer by UPI and maps the record', async () => {
    fetchMock.mockResolvedValue(json({ features: [PARCEL_FEATURE] }))
    const parcel = await getParcel('5/05/10/02/1939')

    const url = sentUrl()
    expect(url.pathname).toBe('/api/gh/server/rest/services/Hosted/RW_CropHealth_V2_View/FeatureServer/0/query')
    expect(url.searchParams.get('where')).toBe("upi = '5/05/10/02/1939'")
    expect(url.searchParams.get('returnGeometry')).toBe('true')
    expect(url.searchParams.get('outSR')).toBe('4326')
    expect(url.searchParams.get('f')).toBe('json')

    expect(parcel).toEqual({
      upi: '5/05/10/02/1939',
      province: 'Eastern',
      district: 'Kirehe',
      sector: 'Nasho',
      cell: 'Kagese',
      village: 'Kagese Ii',
      areaM2: 18477.8,
      reliability: 'good',
      latestDate: 1790294400000,
      ndvi: 0.1394,
      ndmi: -0.2968,
      ndre: 0.0684,
      ndviLevel: 'bare ground',
      ndmiLevel: 'very dry',
      ndreLevel: 'very little chlorophyll',
      headline: 'On 25 Sep 2026: NDVI 0.14 (bare ground).',
      usableDates: 87,
      lastRefreshed: 1790778688448,
      rings: [[[30.7, -2.3], [30.71, -2.3], [30.71, -2.29], [30.7, -2.3]]],
    })
  })

  it('returns null when the layer has no such parcel', async () => {
    fetchMock.mockResolvedValue(json({ features: [] }))
    expect(await getParcel('5/05/10/02/1')).toBeNull()
  })

  it('sends nothing for text that is not a UPI', async () => {
    expect(await getParcel("5/05/10/02/1' OR '1'='1")).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('maps missing or non-numeric values to null', async () => {
    fetchMock.mockResolvedValue(
      json({ features: [{ attributes: { upi: '5/05/10/02/1939', ndvi: null, ndmi: 'n/a', latest_date: null, district: '' } }] }),
    )
    const parcel = await getParcel('5/05/10/02/1939')
    expect(parcel.ndvi).toBeNull()
    expect(parcel.ndmi).toBeNull()
    expect(parcel.ndre).toBeNull()
    expect(parcel.latestDate).toBeNull()
    expect(parcel.district).toBeNull()
    expect(parcel.rings).toBeNull()
  })

  it('passes the abort signal to fetch', async () => {
    fetchMock.mockResolvedValue(json({ features: [] }))
    const controller = new AbortController()
    await getParcel('5/05/10/02/1939', { signal: controller.signal })
    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal)
  })
})

describe('getObservations', () => {
  it('returns rows in date order and drops rows with no date', async () => {
    fetchMock.mockResolvedValue(
      json({
        features: [
          { attributes: { obs_date: 1755993600000, ndvi: 0.4959, ndmi: -0.0734, ndre: 0.284, clear_share: 1 } },
          { attributes: { obs_date: null, ndvi: 0.1, ndmi: 0.1, ndre: 0.1, clear_share: 1 } },
          { attributes: { obs_date: 1754265600000, ndvi: 0.3931, ndmi: -0.0896, ndre: null, clear_share: 0.8 } },
        ],
      }),
    )
    const rows = await getObservations('5/02/06/06/1702')
    expect(sentUrl().pathname).toMatch(/\/FeatureServer\/1\/query$/)
    expect(sentUrl().searchParams.get('where')).toBe("upi = '5/02/06/06/1702'")
    expect(rows).toEqual([
      { date: 1754265600000, ndvi: 0.3931, ndmi: -0.0896, ndre: null, clearShare: 0.8 },
      { date: 1755993600000, ndvi: 0.4959, ndmi: -0.0734, ndre: 0.284, clearShare: 1 },
    ])
  })

  it('returns an empty list for text that is not a UPI', async () => {
    expect(await getObservations('nope')).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('listParcels', () => {
  const row = (n) => ({
    attributes: { upi: `5/05/10/02/${n}`, district: 'Kirehe', ndvi_level: 'bare ground', latest_date: 1790294400000 },
    geometry: { rings: [[[30, -2], [30.1, -2], [30, -2.1], [30, -2]]] },
  })

  it('follows paging until the layer has no more rows', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ features: [row(1)], exceededTransferLimit: true }))
      .mockResolvedValueOnce(json({ features: [row(2)] }))
    const result = await listParcels()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(sentUrl(0).searchParams.get('resultOffset')).toBe('0')
    expect(sentUrl(1).searchParams.get('resultOffset')).toBe('1000')
    expect(result.truncated).toBe(false)
    expect(result.parcels.map((p) => p.upi)).toEqual(['5/05/10/02/1', '5/05/10/02/2'])
    expect(result.parcels[0]).toEqual({
      upi: '5/05/10/02/1',
      district: 'Kirehe',
      ndviLevel: 'bare ground',
      latestDate: 1790294400000,
      rings: [[[30, -2], [30.1, -2], [30, -2.1], [30, -2]]],
    })
  })

  it('stops after five pages and says the list is incomplete', async () => {
    fetchMock.mockImplementation(async () => json({ features: [row(1)], exceededTransferLimit: true }))
    const result = await listParcels()
    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect(result.truncated).toBe(true)
  })

  it('skips rows with no UPI', async () => {
    fetchMock.mockResolvedValue(json({ features: [row(1), { attributes: { upi: null } }] }))
    expect((await listParcels()).parcels).toHaveLength(1)
  })
})

describe('getIndexGuide', () => {
  const guide = {
    features: [
      {
        attributes: {
          code: 'NDVI',
          name: 'Normalized Difference Vegetation Index',
          meaning: 'How much green leaf is on the ground.',
          how_to_read: 'Rises as a crop covers the soil.',
          thresholds: 'below 0.20 bare',
          caveats: 'Small parcels include their surroundings.',
          formula: '(B8 - B4) / (B8 + B4)',
          bands: 'B8 near infrared, B4 red',
          reference: 'Rouse et al. 1974',
          sort_order: 1,
        },
      },
    ],
  }

  it('maps the guide table and asks only once', async () => {
    fetchMock.mockImplementation(async () => json(guide))
    const first = await getIndexGuide()
    const second = await getIndexGuide()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(sentUrl().pathname).toMatch(/\/FeatureServer\/2\/query$/)
    expect(second).toBe(first)
    expect(first[0]).toEqual({
      code: 'NDVI',
      name: 'Normalized Difference Vegetation Index',
      meaning: 'How much green leaf is on the ground.',
      howToRead: 'Rises as a crop covers the soil.',
      thresholds: 'below 0.20 bare',
      caveats: 'Small parcels include their surroundings.',
      formula: '(B8 - B4) / (B8 + B4)',
      bands: 'B8 near infrared, B4 red',
      reference: 'Rouse et al. 1974',
    })
  })

  it('asks again after a failure', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockImplementation(async () => json(guide))
    await expect(getIndexGuide()).rejects.toBeInstanceOf(NetworkError)
    expect(await getIndexGuide()).toHaveLength(1)
  })
})

describe('errors', () => {
  it('raises SessionExpiredError on 401', async () => {
    fetchMock.mockResolvedValue(json({ error: 'Your session has expired. Sign in again.' }, 401))
    await expect(getParcel('5/05/10/02/1939')).rejects.toBeInstanceOf(SessionExpiredError)
  })

  it('raises PortalError with the ArcGIS message', async () => {
    fetchMock.mockResolvedValue(json({ error: { code: 400, message: 'Invalid query' } }))
    await expect(getParcel('5/05/10/02/1939')).rejects.toThrow('Invalid query')
    fetchMock.mockResolvedValue(json({ error: { code: 400, message: 'Invalid query' } }))
    await expect(getParcel('5/05/10/02/1939')).rejects.toBeInstanceOf(PortalError)
  })

  it('raises PortalError with the proxy message', async () => {
    fetchMock.mockResolvedValue(json({ error: 'Could not reach GeoHub. Try again in a moment.' }, 502))
    await expect(getParcel('5/05/10/02/1939')).rejects.toThrow('Could not reach GeoHub. Try again in a moment.')
  })

  it('raises PortalError when the answer is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }))
    await expect(getParcel('5/05/10/02/1939')).rejects.toBeInstanceOf(PortalError)
  })

  it('raises NetworkError when the request cannot be sent', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(getParcel('5/05/10/02/1939')).rejects.toBeInstanceOf(NetworkError)
  })

  it('lets a cancelled request reject as AbortError', async () => {
    fetchMock.mockRejectedValue(new DOMException('Aborted', 'AbortError'))
    await expect(getParcel('5/05/10/02/1939')).rejects.toMatchObject({ name: 'AbortError' })
  })
})
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run src/api/cropHealth.test.js`
Expected: FAIL, cannot resolve `./arcgis.js`.

- [ ] **Step 3: Implement `src/api/arcgis.js`**

```js
// Requests go to this app's own origin; the access server adds the portal
// token and forwards them to GeoHub.
export const SERVICE_URL = '/api/gh/server/rest/services/Hosted/RW_CropHealth_V2_View/FeatureServer'

const PAGE_SIZE = 1000

export class SessionExpiredError extends Error {
  constructor(message = 'Your session has expired. Sign in again.') {
    super(message)
    this.name = 'SessionExpiredError'
  }
}

export class PortalError extends Error {
  constructor(message = 'GeoHub could not answer the request.') {
    super(message)
    this.name = 'PortalError'
  }
}

export class NetworkError extends Error {
  constructor(message = 'Could not reach the server. Check your connection and try again.') {
    super(message)
    this.name = 'NetworkError'
  }
}

/** One query against a layer or table of the crop health service. */
export async function queryLayer(layerId, params, { signal } = {}) {
  const search = new URLSearchParams({ f: 'json', ...params })
  let res
  try {
    res = await fetch(`${SERVICE_URL}/${layerId}/query?${search}`, { credentials: 'same-origin', signal })
  } catch (err) {
    if (err?.name === 'AbortError') throw err
    throw new NetworkError()
  }
  if (res.status === 401) throw new SessionExpiredError()

  let data
  try {
    data = await res.json()
  } catch {
    throw new PortalError('GeoHub returned an unreadable response.')
  }
  // ArcGIS sends { error: { message } }; the access server sends { error: '...' }.
  const error = data?.error
  if (error || !res.ok) {
    const message = typeof error === 'string' ? error : error?.message
    throw new PortalError(message || `GeoHub request failed (${res.status}).`)
  }
  return data
}

/** Every page of a query, up to maxPages. `truncated` says rows were left out. */
export async function queryAll(layerId, params, { signal, maxPages = 5 } = {}) {
  const features = []
  for (let page = 0; page < maxPages; page += 1) {
    const data = await queryLayer(
      layerId,
      { ...params, resultOffset: String(page * PAGE_SIZE), resultRecordCount: String(PAGE_SIZE) },
      { signal },
    )
    features.push(...(data.features || []))
    if (!data.exceededTransferLimit) return { features, truncated: false }
  }
  return { features, truncated: true }
}
```

- [ ] **Step 4: Implement `src/api/cropHealth.js`**

```js
import { parseUpi } from '../lib/upi.js'
import { queryAll, queryLayer } from './arcgis.js'

const PARCELS = 0
const OBSERVATIONS = 1
const INDEX_GUIDE = 2

const PARCEL_FIELDS = [
  'upi', 'province', 'district', 'sector', 'cell', 'village', 'area_m2', 'reliability',
  'latest_date', 'ndvi', 'ndmi', 'ndre', 'ndvi_level', 'ndmi_level', 'ndre_level',
  'headline', 'usable_dates', 'last_refreshed',
].join(',')

const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null)
const text = (value) => (typeof value === 'string' && value.trim() !== '' ? value : null)
const rings = (geometry) => (Array.isArray(geometry?.rings) && geometry.rings.length ? geometry.rings : null)

// parseUpi only lets digits and slashes through, so the value is safe to
// place in a where clause.
const whereUpi = (upi) => `upi = '${upi}'`

function toParcel({ attributes: a = {}, geometry }) {
  return {
    upi: text(a.upi),
    province: text(a.province),
    district: text(a.district),
    sector: text(a.sector),
    cell: text(a.cell),
    village: text(a.village),
    areaM2: num(a.area_m2),
    reliability: text(a.reliability),
    latestDate: num(a.latest_date),
    ndvi: num(a.ndvi),
    ndmi: num(a.ndmi),
    ndre: num(a.ndre),
    ndviLevel: text(a.ndvi_level),
    ndmiLevel: text(a.ndmi_level),
    ndreLevel: text(a.ndre_level),
    headline: text(a.headline),
    usableDates: num(a.usable_dates),
    lastRefreshed: num(a.last_refreshed),
    rings: rings(geometry),
  }
}

export async function getParcel(input, options) {
  const upi = parseUpi(input)
  if (!upi) return null
  const data = await queryLayer(
    PARCELS,
    { where: whereUpi(upi), outFields: PARCEL_FIELDS, returnGeometry: 'true', outSR: '4326', resultRecordCount: '1' },
    options,
  )
  const feature = data.features?.[0]
  return feature ? toParcel(feature) : null
}

export async function getObservations(input, options) {
  const upi = parseUpi(input)
  if (!upi) return []
  const { features } = await queryAll(
    OBSERVATIONS,
    {
      where: whereUpi(upi),
      outFields: 'obs_date,ndvi,ndmi,ndre,clear_share',
      orderByFields: 'obs_date ASC',
      returnGeometry: 'false',
    },
    options,
  )
  return features
    .map(({ attributes: a = {} }) => ({
      date: num(a.obs_date),
      ndvi: num(a.ndvi),
      ndmi: num(a.ndmi),
      ndre: num(a.ndre),
      clearShare: num(a.clear_share),
    }))
    .filter((row) => row.date !== null)
    .sort((a, b) => a.date - b.date)
}

export async function listParcels(options) {
  const { features, truncated } = await queryAll(
    PARCELS,
    {
      where: '1=1',
      outFields: 'upi,district,ndvi_level,latest_date',
      orderByFields: 'objectid ASC',
      returnGeometry: 'true',
      outSR: '4326',
    },
    options,
  )
  const parcels = features
    .map(({ attributes: a = {}, geometry }) => ({
      upi: text(a.upi),
      district: text(a.district),
      ndviLevel: text(a.ndvi_level),
      latestDate: num(a.latest_date),
      rings: rings(geometry),
    }))
    .filter((parcel) => parcel.upi !== null)
  return { parcels, truncated }
}

let guidePromise = null

/** The three index explanations. Fetched once; a failure is not cached. */
export function getIndexGuide() {
  if (!guidePromise) {
    guidePromise = queryLayer(INDEX_GUIDE, {
      where: '1=1',
      outFields: '*',
      orderByFields: 'sort_order ASC',
      returnGeometry: 'false',
    })
      .then((data) =>
        (data.features || []).map(({ attributes: a = {} }) => ({
          code: text(a.code),
          name: text(a.name),
          meaning: text(a.meaning),
          howToRead: text(a.how_to_read),
          thresholds: text(a.thresholds),
          caveats: text(a.caveats),
          formula: text(a.formula),
          bands: text(a.bands),
          reference: text(a.reference),
        })),
      )
      .catch((err) => {
        guidePromise = null
        throw err
      })
  }
  return guidePromise
}

export function resetIndexGuideCache() {
  guidePromise = null
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/api/cropHealth.test.js`
Expected: PASS, 18 tests.

- [ ] **Step 6: Commit**

```
git add -A
git commit -m "Add crop health data layer over the GeoHub proxy"
```

---

### Task 7: Sign-in page and route protection

**Files:**
- Create: `src/auth/AuthContext.jsx`, `src/auth/AuthGate.jsx`, `src/auth/LoginPage.jsx`, `src/pages/Dashboard.jsx` (temporary shell, replaced in Task 12)
- Modify: `src/App.jsx`, `src/main.jsx`
- Test: `src/auth/LoginPage.test.jsx`

**Interfaces:**
- Consumes: the auth routes from Task 3; `ThemeToggle` from Task 2.
- Produces:
  - `<AuthProvider>` and `useAuth() → { user: { username, fullName, email } | null, checking: boolean, signIn(username, password) → Promise<{ ok: true } | { ok: false, error: string }>, signOut() → Promise<void>, expire() → void }`. `signIn`, `signOut` and `expire` keep the same identity across renders.
  - `<AuthGate>`: renders its children for a signed-in user; otherwise redirects to `/login?next=<path and query>`.
  - `safeNext(next) → string`: `next` when it is a path on this site, otherwise `/`.
  - Routes: `/login`, `/` (protected), anything else redirects to `/`.

- [ ] **Step 1: Write the failing tests**

`src/auth/LoginPage.test.jsx`:

```jsx
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

  it.each(['//evil.example/x', 'https://evil.example', '/\\evil.example', 'javascript:alert(1)', '', null, undefined])(
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
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run src/auth/LoginPage.test.jsx`
Expected: FAIL, cannot resolve `./AuthContext.jsx`.

- [ ] **Step 3: Implement `src/auth/AuthContext.jsx`**

```jsx
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
      return { ok: false, error: 'Enter your GeoHub username and password.' }
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
```

- [ ] **Step 4: Implement `src/auth/AuthGate.jsx` and `src/auth/LoginPage.jsx`**

`src/auth/AuthGate.jsx`:

```jsx
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
```

`src/auth/LoginPage.jsx`:

```jsx
import { useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import ThemeToggle from '../theme/ThemeToggle.jsx'
import { useAuth } from './AuthContext.jsx'

/** Only a path on this site may be followed after sign-in. */
export function safeNext(next) {
  return typeof next === 'string' && /^\/(?![/\\])/.test(next) ? next : '/'
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
```

- [ ] **Step 5: Add the temporary dashboard shell and the routes**

`src/pages/Dashboard.jsx` (Task 12 replaces this file):

```jsx
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
```

Replace `src/App.jsx` with:

```jsx
import { Navigate, Route, Routes } from 'react-router-dom'
import AuthGate from './auth/AuthGate.jsx'
import LoginPage from './auth/LoginPage.jsx'
import Dashboard from './pages/Dashboard.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <AuthGate>
            <Dashboard />
          </AuthGate>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
```

Replace `src/main.jsx` with:

```jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './auth/AuthContext.jsx'
import { ThemeProvider } from './theme/ThemeContext.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
)
```

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: PASS. `LoginPage.test.jsx` contributes 14 tests (1 + 7 parameterised in `safeNext`, 5 for the page, 1 for route protection).

- [ ] **Step 7: Check sign-in against the real portal**

Run: `npm run dev` and open http://localhost:5173.
Expected: the sign-in page appears at `/login?next=%2F`, in the system's theme, and the toggle switches it.

This step needs a GeoHub account. Ask the user to sign in, and confirm with them:
- a wrong password shows the portal's message under the form;
- the right password lands on the page with their name and a Sign out button;
- reloading the page keeps them signed in;
- Sign out returns to the sign-in page.

If sign-in fails with a correct password, check the dev server's terminal and the response of `POST /api/auth/login` in the browser's network panel before changing code. Stop the dev server afterwards.

- [ ] **Step 8: Commit**

```
git add -A
git commit -m "Add sign-in page, session context and route protection"
```

---

### Task 8: Parcel summary, index cards and index guide

**Files:**
- Create: `src/components/IndexCard.jsx`, `src/components/ParcelSummary.jsx`, `src/components/IndexGuideDialog.jsx`
- Test: `src/components/ParcelSummary.test.jsx`

**Interfaces:**
- Consumes: `Parcel` and `GuideEntry` shapes from Task 6; `formatIndex`, `formatDate`, `formatHectares` from Task 1; `SERIES`, `CHART_COLORS`, `useTheme` from Task 2.
- Produces:
  - `<ParcelSummary status parcel error onRetry onOpenGuide />` where `status` is `'idle' | 'loading' | 'not-found' | 'error' | 'ready'`, `parcel` is a `Parcel` (required when `ready`), `onRetry()` and `onOpenGuide(code: 'NDVI'|'NDMI'|'NDRE')`.
  - `<IndexCard code hint value level color onInfo />`
  - `<IndexGuideDialog code entries error onClose />` where `entries` is `GuideEntry[] | null` (null while loading) and `error` is `string | null`.

- [ ] **Step 1: Write the failing tests**

`src/components/ParcelSummary.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '../theme/ThemeContext.jsx'
import IndexGuideDialog from './IndexGuideDialog.jsx'
import ParcelSummary from './ParcelSummary.jsx'

const PARCEL = {
  upi: '5/05/10/02/1939',
  province: 'Eastern',
  district: 'Kirehe',
  sector: 'Nasho',
  cell: 'Kagese',
  village: 'Kagese Ii',
  areaM2: 18477.8,
  reliability: 'good',
  latestDate: 1790294400000,
  ndvi: 0.1394,
  ndmi: -0.2968,
  ndre: 0.0684,
  ndviLevel: 'bare ground',
  ndmiLevel: 'very dry',
  ndreLevel: 'very little chlorophyll',
  headline: 'On 25 Sep 2026: NDVI 0.14 (bare ground), NDMI -0.30 (very dry), NDRE 0.07 (very little chlorophyll).',
  usableDates: 87,
  lastRefreshed: 1790778688448,
  rings: null,
}

const noop = () => {}

function renderSummary(props) {
  return render(
    <ThemeProvider>
      <ParcelSummary onRetry={noop} onOpenGuide={noop} parcel={null} error={null} {...props} />
    </ThemeProvider>,
  )
}

describe('ParcelSummary', () => {
  it('shows the parcel, its location, the three indices and the facts', () => {
    renderSummary({ status: 'ready', parcel: PARCEL })
    expect(screen.getByRole('heading', { name: '5/05/10/02/1939 · Kirehe' })).toBeInTheDocument()
    expect(screen.getByText('Nasho · Kagese · Kagese Ii')).toBeInTheDocument()
    expect(screen.getByTestId('NDVI-value')).toHaveTextContent('0.14')
    expect(screen.getByTestId('NDVI-level')).toHaveTextContent('bare ground')
    expect(screen.getByTestId('NDMI-value')).toHaveTextContent('-0.30')
    expect(screen.getByTestId('NDMI-level')).toHaveTextContent('very dry')
    expect(screen.getByTestId('NDRE-value')).toHaveTextContent('0.07')
    expect(screen.getByTestId('NDRE-level')).toHaveTextContent('very little chlorophyll')
    expect(screen.getByText('25 Sep 2026')).toBeInTheDocument()
    expect(screen.getByText('1.85 ha')).toBeInTheDocument()
    expect(screen.getByText('good')).toBeInTheDocument()
    expect(screen.getByText('87')).toBeInTheDocument()
    expect(screen.getByText(PARCEL.headline)).toBeInTheDocument()
  })

  it('shows a dash and no level for an index with no value', () => {
    const { container } = renderSummary({
      status: 'ready',
      parcel: {
        ...PARCEL,
        district: null,
        sector: null,
        cell: null,
        village: null,
        ndvi: null,
        latestDate: null,
        areaM2: null,
        reliability: null,
        usableDates: null,
        headline: null,
      },
    })
    expect(screen.getByRole('heading', { name: '5/05/10/02/1939' })).toBeInTheDocument()
    expect(screen.getByTestId('NDVI-value')).toHaveTextContent('–')
    expect(screen.getByTestId('NDVI-level')).toBeEmptyDOMElement()
    expect(screen.getByTestId('NDMI-value')).toHaveTextContent('-0.30')
    expect(container.textContent).not.toMatch(/NaN|null|undefined|Invalid/)
  })

  it('prompts for a UPI before anything is selected', () => {
    renderSummary({ status: 'idle' })
    expect(screen.getByText('Enter a UPI and press Run to see its analysis.')).toBeInTheDocument()
  })

  it('shows a loading state', () => {
    renderSummary({ status: 'loading' })
    expect(screen.getByRole('status', { name: 'Loading parcel' })).toBeInTheDocument()
  })

  it('says when the parcel has not been analysed', () => {
    renderSummary({ status: 'not-found' })
    expect(screen.getByText('This parcel has not been analysed yet.')).toBeInTheDocument()
  })

  it('shows the error with a retry button', async () => {
    const onRetry = vi.fn()
    renderSummary({ status: 'error', error: 'Could not reach GeoHub. Try again in a moment.', onRetry })
    expect(screen.getByRole('alert')).toHaveTextContent('Could not reach GeoHub. Try again in a moment.')
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('opens the guide for the index whose info button was pressed', async () => {
    const onOpenGuide = vi.fn()
    renderSummary({ status: 'ready', parcel: PARCEL, onOpenGuide })
    await userEvent.click(screen.getByRole('button', { name: 'About NDMI' }))
    expect(onOpenGuide).toHaveBeenCalledWith('NDMI')
  })
})

describe('IndexGuideDialog', () => {
  const ENTRIES = [
    {
      code: 'NDVI',
      name: 'Normalized Difference Vegetation Index',
      meaning: 'How much green leaf is on the ground.',
      howToRead: 'Rises as a crop covers the soil and falls at harvest.',
      thresholds: 'below 0.20 bare; 0.20-0.35 very sparse',
      caveats: 'A parcel is often only a few 10 m pixels.',
      formula: '(B8 - B4) / (B8 + B4)',
      bands: 'B8 near infrared, B4 red',
      reference: 'Rouse et al. 1974',
    },
  ]

  it('shows the guide entry for the index', () => {
    render(<IndexGuideDialog code="NDVI" entries={ENTRIES} error={null} onClose={noop} />)
    const dialog = screen.getByRole('dialog', { name: 'Normalized Difference Vegetation Index' })
    expect(dialog).toHaveTextContent('How much green leaf is on the ground.')
    expect(dialog).toHaveTextContent('below 0.20 bare; 0.20-0.35 very sparse')
    expect(dialog).toHaveTextContent('A parcel is often only a few 10 m pixels.')
    expect(dialog).toHaveTextContent('(B8 - B4) / (B8 + B4)')
  })

  it('shows a loading state while the guide is being fetched', () => {
    render(<IndexGuideDialog code="NDVI" entries={null} error={null} onClose={noop} />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
  })

  it('shows an error, and a note when the index has no entry', () => {
    const { rerender } = render(<IndexGuideDialog code="NDVI" entries={null} error="Invalid query" onClose={noop} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid query')
    rerender(<IndexGuideDialog code="NDRE" entries={ENTRIES} error={null} onClose={noop} />)
    expect(screen.getByText('No guide entry for NDRE.')).toBeInTheDocument()
  })

  it('closes on Escape and on the close button', async () => {
    const onClose = vi.fn()
    render(<IndexGuideDialog code="NDVI" entries={ENTRIES} error={null} onClose={onClose} />)
    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run src/components/ParcelSummary.test.jsx`
Expected: FAIL, cannot resolve `./IndexGuideDialog.jsx`.

- [ ] **Step 3: Implement `src/components/IndexCard.jsx`**

The value is written in the normal text colour; the index colour is the bar across the top.

```jsx
import { formatIndex } from '../lib/format.js'

export default function IndexCard({ code, hint, value, level, color, onInfo }) {
  const hasValue = typeof value === 'number' && Number.isFinite(value)
  return (
    <div className="relative overflow-hidden rounded-lg border border-line bg-page p-3">
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: color }} />
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold tracking-wide">{code}</h3>
          <p className="text-xs text-ink-2">{hint}</p>
        </div>
        <button
          type="button"
          onClick={() => onInfo(code)}
          aria-label={`About ${code}`}
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-line text-xs text-ink-2 hover:bg-raised hover:text-ink"
        >
          i
        </button>
      </div>
      <p className="mt-2 text-2xl font-semibold" data-testid={`${code}-value`}>
        {formatIndex(value)}
      </p>
      <p className="min-h-5 text-sm text-ink-2" data-testid={`${code}-level`}>
        {hasValue && level ? level : null}
      </p>
    </div>
  )
}
```

- [ ] **Step 4: Implement `src/components/ParcelSummary.jsx`**

```jsx
import { formatDate, formatHectares } from '../lib/format.js'
import { CHART_COLORS, SERIES } from '../theme/palette.js'
import { useTheme } from '../theme/ThemeContext.jsx'
import IndexCard from './IndexCard.jsx'

const Message = ({ children }) => <p className="p-4 text-sm text-ink-2">{children}</p>

const Fact = ({ label, children }) => (
  <div className="flex justify-between gap-4 py-1.5">
    <dt className="text-ink-2">{label}</dt>
    <dd className="text-right font-medium">{children}</dd>
  </div>
)

export default function ParcelSummary({ status, parcel, error, onRetry, onOpenGuide }) {
  const { theme } = useTheme()
  const colors = CHART_COLORS[theme]

  if (status === 'idle') return <Message>Enter a UPI and press Run to see its analysis.</Message>
  if (status === 'not-found') return <Message>This parcel has not been analysed yet.</Message>
  if (status === 'loading') {
    return (
      <div role="status" aria-label="Loading parcel" className="animate-pulse space-y-3 p-4">
        <div className="h-5 w-2/3 rounded bg-raised" />
        <div className="h-4 w-1/2 rounded bg-raised" />
        <div className="grid grid-cols-3 gap-2">
          <div className="h-24 rounded-lg bg-raised" />
          <div className="h-24 rounded-lg bg-raised" />
          <div className="h-24 rounded-lg bg-raised" />
        </div>
        <div className="h-20 rounded bg-raised" />
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div className="p-4">
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
        <button type="button" className="btn-ghost mt-3" onClick={onRetry}>
          Retry
        </button>
      </div>
    )
  }

  const title = parcel.district ? `${parcel.upi} · ${parcel.district}` : parcel.upi
  const place = [parcel.sector, parcel.cell, parcel.village].filter(Boolean).join(' · ')

  return (
    <div className="space-y-4 p-4">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {place && <p className="text-sm text-ink-2">{place}</p>}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {SERIES.map((s) => (
          <IndexCard
            key={s.key}
            code={s.code}
            hint={s.hint}
            value={parcel[s.key]}
            level={parcel[`${s.key}Level`]}
            color={colors[s.key]}
            onInfo={onOpenGuide}
          />
        ))}
      </div>

      <dl className="divide-y divide-line text-sm">
        <Fact label="Latest clear view">{formatDate(parcel.latestDate)}</Fact>
        <Fact label="Area">{formatHectares(parcel.areaM2)}</Fact>
        <Fact label="Reliability">{parcel.reliability ?? '–'}</Fact>
        <Fact label="Clear dates">{parcel.usableDates ?? '–'}</Fact>
      </dl>

      {parcel.headline && <p className="text-sm text-ink-2">{parcel.headline}</p>}
    </div>
  )
}
```

- [ ] **Step 5: Implement `src/components/IndexGuideDialog.jsx`**

```jsx
import { useEffect, useRef } from 'react'

const Section = ({ label, children }) =>
  children ? (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-2">{label}</dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  ) : null

export default function IndexGuideDialog({ code, entries, error, onClose }) {
  const closeRef = useRef(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const entry = entries?.find((item) => item.code === code) ?? null

  let body
  if (error) {
    body = (
      <p role="alert" className="text-sm text-danger">
        {error}
      </p>
    )
  } else if (!entries) {
    body = (
      <p role="status" className="text-sm text-ink-2">
        Loading…
      </p>
    )
  } else if (!entry) {
    body = <p className="text-sm text-ink-2">{`No guide entry for ${code}.`}</p>
  } else {
    body = (
      <>
        {entry.meaning && <p className="text-sm">{entry.meaning}</p>}
        <dl className="mt-4 space-y-3">
          <Section label="How to read">{entry.howToRead}</Section>
          <Section label="Levels">{entry.thresholds}</Section>
          <Section label="Keep in mind">{entry.caveats}</Section>
          <Section label="Formula">{[entry.formula, entry.bands].filter(Boolean).join(' · ')}</Section>
          <Section label="Reference">{entry.reference}</Section>
        </dl>
      </>
    )
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-title"
        className="panel max-h-[85vh] w-full max-w-lg overflow-y-auto p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-4">
          <h2 id="guide-title" className="text-base font-semibold">
            {entry?.name || code}
          </h2>
          <button ref={closeRef} type="button" className="btn-ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {body}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/components/ParcelSummary.test.jsx`
Expected: PASS, 11 tests.

- [ ] **Step 7: Commit**

```
git add -A
git commit -m "Add parcel summary, index cards and index guide dialog"
```

---

### Task 9: Index history chart

**Files:**
- Create: `src/components/IndexChart.jsx`
- Test: `src/components/IndexChart.test.jsx`

**Interfaces:**
- Consumes: `Observation[]` from Task 6; `formatDate`, `formatIndex`, `formatMonth` from Task 1; `SERIES`, `CHART_COLORS`, `useTheme` from Task 2.
- Produces: `<IndexChart status observations error onRetry />` where `status` is `'idle' | 'loading' | 'ready' | 'error'` and `observations` is an array (may be empty).

Chart rules that the code below follows and must keep: one y-axis; 2px lines, no dot on every point; a legend; a hover tooltip with a crosshair; axis and legend text in text colours, never the series colour; a table view of the same numbers.

- [ ] **Step 1: Write the failing tests**

jsdom has no layout, so the tests cover the states and the table view. The drawn chart is checked in the browser in Task 12.

`src/components/IndexChart.test.jsx`:

```jsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '../theme/ThemeContext.jsx'
import IndexChart from './IndexChart.jsx'

const ROWS = [
  { date: 1754265600000, ndvi: 0.3931, ndmi: -0.0896, ndre: null, clearShare: 1 },
  { date: 1755993600000, ndvi: 0.4959, ndmi: -0.0734, ndre: 0.284, clearShare: 1 },
]

const noop = () => {}

function renderChart(props) {
  return render(
    <ThemeProvider>
      <IndexChart observations={[]} error={null} onRetry={noop} {...props} />
    </ThemeProvider>,
  )
}

describe('IndexChart', () => {
  it('prompts before a parcel is selected', () => {
    renderChart({ status: 'idle' })
    expect(screen.getByText('Select a parcel to see its history.')).toBeInTheDocument()
  })

  it('shows a loading state', () => {
    renderChart({ status: 'loading' })
    expect(screen.getByRole('status', { name: 'Loading history' })).toBeInTheDocument()
  })

  it('says when a parcel has no observations', () => {
    renderChart({ status: 'ready', observations: [] })
    expect(screen.getByText('No clear observations yet')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Table' })).toBeNull()
  })

  it('offers the same numbers as a table, newest first, with a dash for a missing value', async () => {
    const { container } = renderChart({ status: 'ready', observations: ROWS })
    expect(screen.getByText(/2 clear dates/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Table' }))

    const rows = screen.getAllByRole('row').slice(1)
    expect(rows).toHaveLength(2)
    const cells = (row) => within(row).getAllByRole('cell').map((cell) => cell.textContent)
    expect(cells(rows[0])).toEqual(['24 Aug 2025', '0.50', '-0.07', '0.28'])
    expect(cells(rows[1])).toEqual(['4 Aug 2025', '0.39', '-0.09', '–'])
    expect(container.textContent).not.toMatch(/NaN|null|undefined|Invalid/)

    await userEvent.click(screen.getByRole('button', { name: 'Chart' }))
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('shows the error with a retry button', async () => {
    const onRetry = vi.fn()
    renderChart({ status: 'error', error: 'Invalid query', onRetry })
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid query')
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run src/components/IndexChart.test.jsx`
Expected: FAIL, cannot resolve `./IndexChart.jsx`.

- [ ] **Step 3: Implement `src/components/IndexChart.jsx`**

```jsx
import { useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatDate, formatIndex, formatMonth } from '../lib/format.js'
import { CHART_COLORS, SERIES } from '../theme/palette.js'
import { useTheme } from '../theme/ThemeContext.jsx'

const SUBTITLE = SERIES.map((s) => `${s.code} ${s.hint}`).join(' · ')

function Lines({ observations, colors }) {
  const tick = { fill: colors.text, fontSize: 12 }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={observations} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={colors.grid} vertical={false} />
        <XAxis
          dataKey="date"
          type="number"
          scale="time"
          domain={['dataMin', 'dataMax']}
          tickFormatter={formatMonth}
          tick={tick}
          tickLine={false}
          stroke={colors.axis}
          minTickGap={48}
        />
        <YAxis
          tickFormatter={(value) => value.toFixed(1)}
          tick={tick}
          tickLine={false}
          axisLine={false}
          width={40}
        />
        <Tooltip
          labelFormatter={formatDate}
          formatter={(value) => formatIndex(value)}
          cursor={{ stroke: colors.axis, strokeWidth: 1 }}
          contentStyle={{
            background: colors.surface,
            border: `1px solid ${colors.grid}`,
            borderRadius: 8,
            color: colors.ink,
            fontSize: 12,
          }}
          labelStyle={{ color: colors.ink, fontWeight: 600 }}
          itemStyle={{ color: colors.ink2 }}
        />
        <Legend
          iconType="plainline"
          formatter={(value) => <span style={{ color: colors.ink2, fontSize: 12 }}>{value}</span>}
        />
        {SERIES.map((s) => (
          <Line
            key={s.key}
            type="linear"
            dataKey={s.key}
            name={`${s.code} ${s.hint}`}
            stroke={colors[s.key]}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={false}
            activeDot={{ r: 4, stroke: colors.surface, strokeWidth: 2 }}
            connectNulls
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

function Rows({ observations }) {
  const newestFirst = [...observations].reverse()
  return (
    <div className="max-h-72 overflow-y-auto">
      <table className="w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
        <thead className="sticky top-0 bg-surface text-left text-xs text-ink-2">
          <tr>
            <th scope="col" className="py-1.5 pr-3 font-medium">Date</th>
            {SERIES.map((s) => (
              <th key={s.key} scope="col" className="py-1.5 pr-3 text-right font-medium">
                {s.code}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {newestFirst.map((row) => (
            <tr key={row.date}>
              <td className="py-1.5 pr-3">{formatDate(row.date)}</td>
              {SERIES.map((s) => (
                <td key={s.key} className="py-1.5 pr-3 text-right">
                  {formatIndex(row[s.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function IndexChart({ status, observations, error, onRetry }) {
  const { theme } = useTheme()
  const [view, setView] = useState('chart')
  const hasRows = status === 'ready' && observations.length > 0

  let body
  if (status === 'idle') {
    body = <p className="text-sm text-ink-2">Select a parcel to see its history.</p>
  } else if (status === 'loading') {
    body = <div role="status" aria-label="Loading history" className="h-64 animate-pulse rounded-lg bg-raised" />
  } else if (status === 'error') {
    body = (
      <div>
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
        <button type="button" className="btn-ghost mt-3" onClick={onRetry}>
          Retry
        </button>
      </div>
    )
  } else if (!hasRows) {
    body = <p className="text-sm text-ink-2">No clear observations yet</p>
  } else if (view === 'table') {
    body = <Rows observations={observations} />
  } else {
    body = (
      <div className="h-64">
        <Lines observations={observations} colors={CHART_COLORS[theme]} />
      </div>
    )
  }

  return (
    <section className="panel p-4" aria-labelledby="chart-title">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="chart-title" className="text-sm font-semibold">
            Index history
          </h2>
          <p className="text-xs text-ink-2">
            {hasRows ? `${observations.length} clear dates · ${SUBTITLE}` : SUBTITLE}
          </p>
        </div>
        {hasRows && (
          <div className="flex gap-1" role="group" aria-label="View">
            {[
              ['chart', 'Chart'],
              ['table', 'Table'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`btn-ghost ${view === id ? 'bg-raised text-ink' : ''}`}
                aria-pressed={view === id}
                onClick={() => setView(id)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      {body}
    </section>
  )
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/IndexChart.test.jsx`
Expected: PASS, 5 tests. A Recharts warning about a chart width or height of 0 is expected in jsdom and is not a failure.

- [ ] **Step 5: Commit**

```
git add -A
git commit -m "Add index history chart with table view"
```

---

### Task 10: UPI search panel and analysed-parcels table

**Files:**
- Create: `src/components/UpiSearch.jsx`, `src/components/ParcelsTable.jsx`
- Test: `src/components/UpiSearch.test.jsx`, `src/components/ParcelsTable.test.jsx`

**Interfaces:**
- Consumes: `parseUpi`, `UPI_FORMAT_MESSAGE` from Task 5; `ParcelRow` from Task 6.
- Produces:
  - `<UpiSearch defaultValue history busy onSubmit />`: `defaultValue: string`, `history: string[]`, `busy: boolean`, `onSubmit(upi: string)` called only with a valid, cleaned UPI. The parent remounts it with a `key` when the selected UPI changes.
  - `<ParcelsTable status parcels truncated selectedUpi error onSelect onRetry />`: `status` is `'loading' | 'ready' | 'error'`; `onSelect(upi: string)`.

- [ ] **Step 1: Write the failing tests**

`src/components/UpiSearch.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import UpiSearch from './UpiSearch.jsx'

const MESSAGE = 'Enter a UPI in the form 5/05/10/02/1939'

function renderSearch(props) {
  const onSubmit = vi.fn()
  render(<UpiSearch defaultValue="" history={[]} busy={false} onSubmit={onSubmit} {...props} />)
  return onSubmit
}

describe('UpiSearch', () => {
  it('submits a cleaned UPI when Run is pressed', async () => {
    const onSubmit = renderSearch()
    await userEvent.type(screen.getByLabelText('UPI'), '  5/05/10/02/1939 ')
    await userEvent.click(screen.getByRole('button', { name: 'Run' }))
    expect(onSubmit).toHaveBeenCalledWith('5/05/10/02/1939')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('submits on Enter', async () => {
    const onSubmit = renderSearch()
    await userEvent.type(screen.getByLabelText('UPI'), '5/05/10/02/1939{Enter}')
    expect(onSubmit).toHaveBeenCalledWith('5/05/10/02/1939')
  })

  it('shows the format message and sends nothing for a malformed UPI', async () => {
    const onSubmit = renderSearch()
    await userEvent.type(screen.getByLabelText('UPI'), '5-05-10-02-1939')
    await userEvent.click(screen.getByRole('button', { name: 'Run' }))
    expect(screen.getByRole('alert')).toHaveTextContent(MESSAGE)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows the format message at once for a malformed UPI from a link', () => {
    renderSearch({ defaultValue: 'abc' })
    expect(screen.getByLabelText('UPI')).toHaveValue('abc')
    expect(screen.getByRole('alert')).toHaveTextContent(MESSAGE)
  })

  it('disables Run while a parcel is loading', () => {
    renderSearch({ busy: true })
    expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled()
  })

  it('lists history and opens a parcel from it', async () => {
    const onSubmit = renderSearch({ history: ['5/05/10/02/2206', '5/02/06/06/1702'] })
    await userEvent.click(screen.getByRole('tab', { name: 'History' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    await userEvent.click(screen.getByRole('button', { name: '5/02/06/06/1702' }))
    expect(onSubmit).toHaveBeenCalledWith('5/02/06/06/1702')
  })

  it('says when there is no history', async () => {
    renderSearch()
    await userEvent.click(screen.getByRole('tab', { name: 'History' }))
    expect(screen.getByText('No parcels opened yet.')).toBeInTheDocument()
  })
})
```

`src/components/ParcelsTable.test.jsx`:

```jsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ParcelsTable from './ParcelsTable.jsx'

const PARCELS = [
  { upi: '5/05/10/02/2206', district: 'Kirehe', ndviLevel: 'bare ground', latestDate: 1, rings: null },
  { upi: '5/02/06/06/1702', district: 'Nyagatare', ndviLevel: 'very sparse cover', latestDate: 1, rings: null },
  { upi: '5/04/08/04/1948', district: 'Kayonza', ndviLevel: null, latestDate: 1, rings: null },
]

const noop = () => {}

function renderTable(props) {
  return render(
    <ParcelsTable
      status="ready"
      parcels={PARCELS}
      truncated={false}
      selectedUpi={null}
      error={null}
      onSelect={noop}
      onRetry={noop}
      {...props}
    />,
  )
}

const column = (index) =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[index].textContent)

describe('ParcelsTable', () => {
  it('lists parcels sorted by UPI, with a dash for a missing level', () => {
    renderTable()
    expect(column(0)).toEqual(['5/02/06/06/1702', '5/04/08/04/1948', '5/05/10/02/2206'])
    expect(column(2)).toEqual(['very sparse cover', '–', 'bare ground'])
  })

  it('sorts by a column and reverses on a second press', async () => {
    renderTable()
    await userEvent.click(screen.getByRole('button', { name: 'District' }))
    expect(column(1)).toEqual(['Kayonza', 'Kirehe', 'Nyagatare'])
    expect(screen.getByRole('columnheader', { name: 'District' })).toHaveAttribute('aria-sort', 'ascending')
    await userEvent.click(screen.getByRole('button', { name: 'District' }))
    expect(column(1)).toEqual(['Nyagatare', 'Kirehe', 'Kayonza'])
    expect(screen.getByRole('columnheader', { name: 'District' })).toHaveAttribute('aria-sort', 'descending')
  })

  it('selects a parcel and marks the selected row', async () => {
    const onSelect = vi.fn()
    renderTable({ onSelect, selectedUpi: '5/04/08/04/1948' })
    await userEvent.click(screen.getByRole('button', { name: '5/05/10/02/2206' }))
    expect(onSelect).toHaveBeenCalledWith('5/05/10/02/2206')
    expect(screen.getByRole('button', { name: '5/04/08/04/1948' }).closest('tr')).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('button', { name: '5/05/10/02/2206' }).closest('tr')).not.toHaveAttribute('aria-current')
  })

  it('says when the list was cut short', () => {
    renderTable({ truncated: true })
    expect(screen.getByText('Showing the first 3 parcels. Search by UPI to open any other.')).toBeInTheDocument()
  })

  it('shows loading, empty and error states', async () => {
    const onRetry = vi.fn()
    const { rerender } = renderTable({ status: 'loading', parcels: [] })
    expect(screen.getByRole('status')).toHaveTextContent('Loading parcels…')

    rerender(
      <ParcelsTable status="ready" parcels={[]} truncated={false} selectedUpi={null} error={null} onSelect={noop} onRetry={noop} />,
    )
    expect(screen.getByText('No analysed parcels yet.')).toBeInTheDocument()

    rerender(
      <ParcelsTable status="error" parcels={[]} truncated={false} selectedUpi={null} error="Invalid query" onSelect={noop} onRetry={onRetry} />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid query')
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run src/components/UpiSearch.test.jsx src/components/ParcelsTable.test.jsx`
Expected: FAIL, cannot resolve `./UpiSearch.jsx` and `./ParcelsTable.jsx`.

- [ ] **Step 3: Implement `src/components/UpiSearch.jsx`**

```jsx
import { useState } from 'react'
import { parseUpi, UPI_FORMAT_MESSAGE } from '../lib/upi.js'

const TABS = [
  ['tools', 'Tools'],
  ['history', 'History'],
]

export default function UpiSearch({ defaultValue = '', history, busy, onSubmit }) {
  const [tab, setTab] = useState('tools')
  const [value, setValue] = useState(defaultValue)
  const [error, setError] = useState(defaultValue && !parseUpi(defaultValue) ? UPI_FORMAT_MESSAGE : null)

  const submit = (event) => {
    event.preventDefault()
    const upi = parseUpi(value)
    if (!upi) {
      setError(UPI_FORMAT_MESSAGE)
      return
    }
    setError(null)
    setValue(upi)
    onSubmit(upi)
  }

  return (
    <section className="panel flex flex-col" aria-label="Find a parcel">
      <div role="tablist" className="grid grid-cols-2 border-b border-line">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            onClick={() => setTab(id)}
            className={`border-b-2 px-4 py-3 text-sm font-semibold ${
              tab === id ? 'border-accent text-ink' : 'border-transparent text-ink-2 hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'tools' ? (
        <form role="tabpanel" id="panel-tools" aria-labelledby="tab-tools" onSubmit={submit} noValidate className="space-y-3 p-4">
          <div className="space-y-1">
            <label htmlFor="upi" className="text-sm font-medium">
              UPI
            </label>
            <input
              id="upi"
              name="upi"
              type="text"
              className="field"
              inputMode="numeric"
              autoComplete="off"
              spellCheck="false"
              placeholder="5/05/10/02/1939"
              aria-invalid={error ? 'true' : undefined}
              aria-describedby={error ? 'upi-error' : undefined}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            {error && (
              <p id="upi-error" role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
          </div>
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            Run
          </button>
        </form>
      ) : (
        <div role="tabpanel" id="panel-history" aria-labelledby="tab-history" className="p-4">
          {history.length === 0 ? (
            <p className="text-sm text-ink-2">No parcels opened yet.</p>
          ) : (
            <ul className="space-y-1">
              {history.map((upi) => (
                <li key={upi}>
                  <button
                    type="button"
                    onClick={() => onSubmit(upi)}
                    className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-raised"
                  >
                    {upi}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Implement `src/components/ParcelsTable.jsx`**

```jsx
import { useMemo, useState } from 'react'

const COLUMNS = [
  { key: 'upi', label: 'UPI' },
  { key: 'district', label: 'District' },
  { key: 'ndviLevel', label: 'NDVI level' },
]

export default function ParcelsTable({ status, parcels, truncated, selectedUpi, error, onSelect, onRetry }) {
  const [sort, setSort] = useState({ key: 'upi', dir: 'asc' })

  const rows = useMemo(() => {
    const factor = sort.dir === 'asc' ? 1 : -1
    return [...parcels].sort(
      (a, b) => factor * String(a[sort.key] ?? '').localeCompare(String(b[sort.key] ?? ''), 'en', { numeric: true }),
    )
  }, [parcels, sort])

  const toggleSort = (key) =>
    setSort((current) => ({ key, dir: current.key === key && current.dir === 'asc' ? 'desc' : 'asc' }))

  let body
  if (status === 'loading') {
    body = (
      <p role="status" className="text-sm text-ink-2">
        Loading parcels…
      </p>
    )
  } else if (status === 'error') {
    body = (
      <div>
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
        <button type="button" className="btn-ghost mt-3" onClick={onRetry}>
          Retry
        </button>
      </div>
    )
  } else if (rows.length === 0) {
    body = <p className="text-sm text-ink-2">No analysed parcels yet.</p>
  } else {
    body = (
      <>
        <div className="max-h-72 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-surface text-xs text-ink-2">
              <tr>
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    scope="col"
                    className="py-1.5 pr-3 font-medium"
                    aria-sort={sort.key === col.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <button type="button" className="hover:text-ink" onClick={() => toggleSort(col.key)}>
                      {col.label}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((parcel) => {
                const selected = parcel.upi === selectedUpi
                return (
                  <tr key={parcel.upi} aria-current={selected ? 'true' : undefined} className={selected ? 'bg-raised' : 'hover:bg-raised/60'}>
                    <td className="py-1.5 pr-3" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      <button type="button" className="text-left hover:underline" onClick={() => onSelect(parcel.upi)}>
                        {parcel.upi}
                      </button>
                    </td>
                    <td className="py-1.5 pr-3">{parcel.district ?? '–'}</td>
                    <td className="py-1.5 pr-3">{parcel.ndviLevel ?? '–'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {truncated && (
          <p className="mt-2 text-xs text-ink-2">
            {`Showing the first ${rows.length} parcels. Search by UPI to open any other.`}
          </p>
        )}
      </>
    )
  }

  return (
    <section className="panel p-4" aria-labelledby="parcels-title">
      <h2 id="parcels-title" className="mb-3 text-sm font-semibold">
        Analysed parcels
      </h2>
      {body}
    </section>
  )
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/components/UpiSearch.test.jsx src/components/ParcelsTable.test.jsx`
Expected: PASS, 12 tests.

- [ ] **Step 6: Commit**

```
git add -A
git commit -m "Add UPI search panel and analysed-parcels table"
```

---

### Task 11: Parcel map

**Files:**
- Create: `src/components/ParcelMap.jsx`
- Modify: `src/pages/Dashboard.jsx` (temporary, to view the map; Task 12 replaces the file)

**Interfaces:**
- Consumes: `ParcelRow[]` and `Parcel` from Task 6 (`rings` in WGS84); `useTheme` from Task 2.
- Produces: default export `<ParcelMap parcels selected onSelect />`: `parcels: ParcelRow[]`, `selected: Parcel | null`, `onSelect(upi: string)`. The component fills its parent, so the parent must have a height. It is the only file that imports `@arcgis/core`, and is loaded with `React.lazy` so the SDK stays out of the first bundle and out of unit tests.

There are no unit tests for this component (jsdom has no WebGL). It is verified in the browser in Step 3.

- [ ] **Step 1: Implement `src/components/ParcelMap.jsx`**

```jsx
import { useEffect, useRef, useState } from 'react'
import Basemap from '@arcgis/core/Basemap.js'
import Graphic from '@arcgis/core/Graphic.js'
import ArcGISMap from '@arcgis/core/Map.js'
import { version as sdkVersion } from '@arcgis/core/kernel.js'
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer.js'
import ImageryLayer from '@arcgis/core/layers/ImageryLayer.js'
import TileLayer from '@arcgis/core/layers/TileLayer.js'
import MapView from '@arcgis/core/views/MapView.js'
import { useTheme } from '../theme/ThemeContext.jsx'

// Public services: no token, loaded by the browser directly.
const SENTINEL_URL = 'https://sentinel.arcgis.com/arcgis/rest/services/Sentinel2/ImageServer'
const WORLD_IMAGERY_URL = 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'

// Raster function names as published by the Sentinel-2 image service.
const MODES = [
  { id: 'ndvi', label: 'NDVI', functionName: 'NDVI Colormap' },
  { id: 'ndmi', label: 'NDMI', functionName: 'NDMI Colorized' },
  { id: 'natural', label: 'Natural colour', functionName: 'Natural Color with DRA' },
]

const RWANDA_EXTENT = { xmin: 28.84, ymin: -2.86, xmax: 30.91, ymax: -1.04, spatialReference: { wkid: 4326 } }

// White outlines and a cyan highlight stay visible over every imagery mode.
const PARCEL_SYMBOL = {
  type: 'simple-fill',
  color: [255, 255, 255, 0.04],
  outline: { color: [255, 255, 255, 0.9], width: 1 },
}
const SELECTED_SYMBOL = {
  type: 'simple-fill',
  color: [0, 229, 255, 0.25],
  outline: { color: [0, 229, 255, 1], width: 2.5 },
}

function toGraphic(parcel, symbol) {
  return new Graphic({
    geometry: { type: 'polygon', rings: parcel.rings, spatialReference: { wkid: 4326 } },
    attributes: { upi: parcel.upi },
    symbol,
  })
}

export default function ParcelMap({ parcels, selected, onSelect }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const onSelectRef = useRef(onSelect)
  const [mode, setMode] = useState('ndvi')
  const { theme } = useTheme()

  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  // The SDK's own controls (zoom buttons, attribution) take their look from
  // this stylesheet, served from the same CDN the SDK loads its assets from.
  useEffect(() => {
    let link = document.getElementById('esri-theme')
    if (!link) {
      link = document.createElement('link')
      link.id = 'esri-theme'
      link.rel = 'stylesheet'
      document.head.appendChild(link)
    }
    link.href = `https://js.arcgis.com/${sdkVersion}/esri/themes/${theme}/main.css`
  }, [theme])

  useEffect(() => {
    const imagery = new ImageryLayer({
      url: SENTINEL_URL,
      rasterFunction: { functionName: MODES[0].functionName },
      format: 'jpgpng',
    })
    const parcelLayer = new GraphicsLayer()
    const selectedLayer = new GraphicsLayer()
    const view = new MapView({
      container: containerRef.current,
      map: new ArcGISMap({
        basemap: new Basemap({ baseLayers: [new TileLayer({ url: WORLD_IMAGERY_URL })] }),
        layers: [imagery, parcelLayer, selectedLayer],
      }),
      extent: RWANDA_EXTENT,
    })

    const click = view.on('click', async (event) => {
      const hit = await view.hitTest(event, { include: [parcelLayer, selectedLayer] })
      const upi = hit.results.find((result) => result.graphic?.attributes?.upi)?.graphic.attributes.upi
      if (upi) onSelectRef.current(upi)
    })

    mapRef.current = { view, imagery, parcelLayer, selectedLayer }
    return () => {
      click.remove()
      view.destroy()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.parcelLayer.removeAll()
    map.parcelLayer.addMany(parcels.filter((p) => p.rings).map((p) => toGraphic(p, PARCEL_SYMBOL)))
  }, [parcels])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.selectedLayer.removeAll()
    if (!selected?.rings) return
    const graphic = toGraphic(selected, SELECTED_SYMBOL)
    map.selectedLayer.add(graphic)
    // goTo rejects when the user moves the map mid-animation or the view is
    // destroyed; neither is an error worth showing.
    map.view
      .when(() => map.view.goTo(graphic.geometry.extent.expand(3)))
      .catch(() => {})
  }, [selected])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.imagery.rasterFunction = { functionName: MODES.find((m) => m.id === mode).functionName }
  }, [mode])

  return (
    <div className="relative h-full min-h-[24rem]">
      <div ref={containerRef} className="absolute inset-0" />
      <div
        role="group"
        aria-label="Imagery"
        className="absolute right-3 top-3 flex overflow-hidden rounded-md border border-line bg-surface text-xs shadow"
      >
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            aria-pressed={mode === m.id}
            onClick={() => setMode(m.id)}
            className={`px-3 py-1.5 font-medium ${
              mode === m.id ? 'bg-accent text-accent-ink' : 'text-ink-2 hover:bg-raised hover:text-ink'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Mount the map on the temporary dashboard**

In `src/pages/Dashboard.jsx`, add these imports at the top:

```jsx
import { lazy, Suspense } from 'react'

const ParcelMap = lazy(() => import('../components/ParcelMap.jsx'))
```

and add this block directly after the closing `</header>` tag:

```jsx
      <main className="p-4">
        <div className="panel h-[32rem] overflow-hidden">
          <Suspense fallback={<div role="status" className="grid h-full place-items-center text-sm text-ink-2">Loading map…</div>}>
            <ParcelMap
              parcels={[]}
              selected={{
                upi: '5/05/10/02/1939',
                rings: [[[30.71, -2.285], [30.713, -2.285], [30.713, -2.282], [30.71, -2.282], [30.71, -2.285]]],
              }}
              onSelect={(upi) => console.log('selected', upi)}
            />
          </Suspense>
        </div>
      </main>
```

The square is a made-up shape in Kirehe district, only there to exercise the highlight and zoom.

- [ ] **Step 3: Check the map in the browser**

Run: `npm run dev`, open http://localhost:5173 and ask the user to sign in.

Expected:
- the map appears with satellite imagery and zooms to a cyan-outlined square in eastern Rwanda;
- the NDVI rendering (greens and browns) covers the area once zoomed in;
- pressing NDMI and Natural colour changes the imagery, and the pressed button is highlighted;
- clicking the square logs `selected 5/05/10/02/1939` in the browser console;
- switching the app theme changes the zoom buttons between light and dark;
- the browser console shows no errors from `@arcgis/core`.

If the imagery layer does not draw, open the network panel and check the `exportImage` requests to `sentinel.arcgis.com` before changing code. Stop the dev server afterwards.

- [ ] **Step 4: Build and run all tests**

Run: `npm run build`
Expected: succeeds. Vite prints a warning about chunks larger than 500 kB for the ArcGIS SDK; that is expected.

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```
git add -A
git commit -m "Add parcel map with Sentinel-2 imagery modes"
```

---

### Task 12: Dashboard

**Files:**
- Replace: `src/pages/Dashboard.jsx`
- Test: `src/pages/Dashboard.test.jsx`

**Interfaces:**
- Consumes:
  - `useAuth() → { user, signOut, expire }` (Task 7)
  - `getParcel`, `getObservations`, `listParcels`, `getIndexGuide` and `SessionExpiredError` (Task 6)
  - `parseUpi` (Task 5), `readHistory`, `addToHistory` (Task 5)
  - `<UpiSearch>`, `<ParcelsTable>` (Task 10), `<ParcelSummary>`, `<IndexGuideDialog>` (Task 8), `<IndexChart>` (Task 9), `<ParcelMap>` (Task 11), `<ThemeToggle>` (Task 2)
- Produces: the finished `/` page. The selected parcel is the `upi` query parameter.

- [ ] **Step 1: Write the failing tests**

The data layer, the auth hook and the map are replaced with fakes; everything else is real.

`src/pages/Dashboard.test.jsx`:

```jsx
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PortalError, SessionExpiredError } from '../api/arcgis.js'
import { getIndexGuide, getObservations, getParcel, listParcels } from '../api/cropHealth.js'
import { ThemeProvider } from '../theme/ThemeContext.jsx'
import Dashboard from './Dashboard.jsx'

const { expire, signOut } = vi.hoisted(() => ({ expire: vi.fn(), signOut: vi.fn() }))

vi.mock('../api/cropHealth.js', () => ({
  getParcel: vi.fn(),
  getObservations: vi.fn(),
  listParcels: vi.fn(),
  getIndexGuide: vi.fn(),
}))

vi.mock('../auth/AuthContext.jsx', () => ({
  useAuth: () => ({ user: { username: 'tresor', fullName: 'Tresor S' }, signOut, expire }),
}))

vi.mock('../components/ParcelMap.jsx', () => ({
  default: ({ parcels, selected }) => (
    <div data-testid="map">{`${parcels.length} outlines, selected ${selected?.upi ?? 'none'}`}</div>
  ),
}))

const parcel = (upi, district) => ({
  upi,
  province: 'Eastern',
  district,
  sector: 'Nasho',
  cell: 'Kagese',
  village: 'Kagese Ii',
  areaM2: 18477.8,
  reliability: 'good',
  latestDate: 1790294400000,
  ndvi: 0.1394,
  ndmi: -0.2968,
  ndre: 0.0684,
  ndviLevel: 'bare ground',
  ndmiLevel: 'very dry',
  ndreLevel: 'very little chlorophyll',
  headline: 'On 25 Sep 2026: NDVI 0.14 (bare ground).',
  usableDates: 87,
  lastRefreshed: 1790778688448,
  rings: [[[30.7, -2.3], [30.71, -2.3], [30.71, -2.29], [30.7, -2.3]]],
})

const A = parcel('5/05/10/02/1939', 'Kirehe')
const B = parcel('5/02/06/06/1702', 'Nyagatare')
const row = (p) => ({ upi: p.upi, district: p.district, ndviLevel: p.ndviLevel, latestDate: p.latestDate, rings: p.rings })
const OBSERVATIONS = [{ date: 1754265600000, ndvi: 0.39, ndmi: -0.09, ndre: 0.24, clearShare: 1 }]

function Search() {
  return <output data-testid="search">{useLocation().search}</output>
}
const selectedInUrl = () => new URLSearchParams(screen.getByTestId('search').textContent).get('upi')

function renderDashboard(initial = '/') {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/" element={<><Dashboard /><Search /></>} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  )
}

const title = (p) => `${p.upi} · ${p.district}`

beforeEach(() => {
  for (const fn of [getParcel, getObservations, listParcels, getIndexGuide, expire, signOut]) fn.mockReset()
  getParcel.mockImplementation(async (upi) => [A, B].find((p) => p.upi === upi) ?? null)
  getObservations.mockResolvedValue(OBSERVATIONS)
  listParcels.mockResolvedValue({ parcels: [row(A), row(B)], truncated: false })
})

describe('Dashboard', () => {
  it('starts with a prompt, the parcels table and the user name', async () => {
    renderDashboard()
    expect(screen.getByText('Tresor S')).toBeInTheDocument()
    expect(screen.getByText('Enter a UPI and press Run to see its analysis.')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: B.upi })).toBeInTheDocument()
    expect(await screen.findByTestId('map')).toHaveTextContent('2 outlines, selected none')
    expect(getParcel).not.toHaveBeenCalled()
  })

  it('opens the parcel named in the link and remembers it in history', async () => {
    renderDashboard(`/?upi=${A.upi}`)
    expect(await screen.findByRole('heading', { name: title(A) })).toBeInTheDocument()
    expect(await screen.findByTestId('map')).toHaveTextContent(`selected ${A.upi}`)
    expect(await screen.findByText(/1 clear dates/)).toBeInTheDocument()
    expect(JSON.parse(window.localStorage.getItem('crophealth-history'))).toEqual([A.upi])
    expect(screen.getByLabelText('UPI')).toHaveValue(A.upi)
  })

  it('runs a search, puts the UPI in the link and shows the result', async () => {
    renderDashboard()
    await userEvent.type(screen.getByLabelText('UPI'), ` ${A.upi} `)
    await userEvent.click(screen.getByRole('button', { name: 'Run' }))
    expect(await screen.findByRole('heading', { name: title(A) })).toBeInTheDocument()
    expect(selectedInUrl()).toBe(A.upi)
  })

  it('says when the parcel has not been analysed, and leaves the chart idle', async () => {
    renderDashboard('/?upi=5/05/10/02/1')
    expect(await screen.findByText('This parcel has not been analysed yet.')).toBeInTheDocument()
    expect(screen.getByText('Select a parcel to see its history.')).toBeInTheDocument()
    expect(window.localStorage.getItem('crophealth-history')).toBeNull()
  })

  it('shows the format message for a malformed UPI in the link and requests nothing', async () => {
    renderDashboard('/?upi=abc')
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a UPI in the form 5/05/10/02/1939')
    await screen.findByRole('button', { name: B.upi })
    expect(getParcel).not.toHaveBeenCalled()
  })

  it('shows an error with Retry, and recovers when Retry succeeds', async () => {
    getParcel.mockRejectedValueOnce(new PortalError('Could not reach GeoHub. Try again in a moment.'))
    renderDashboard(`/?upi=${A.upi}`)
    expect(await screen.findByText('Could not reach GeoHub. Try again in a moment.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('heading', { name: title(A) })).toBeInTheDocument()
  })

  it('signs the user out of the page when the session has expired', async () => {
    getParcel.mockRejectedValue(new SessionExpiredError())
    renderDashboard(`/?upi=${A.upi}`)
    await waitFor(() => expect(expire).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('keeps the newest parcel when an older request finishes last', async () => {
    let finishA
    getParcel.mockImplementation((upi) =>
      upi === A.upi ? new Promise((resolve) => (finishA = resolve)) : Promise.resolve(B),
    )
    renderDashboard(`/?upi=${A.upi}`)
    await userEvent.click(await screen.findByRole('button', { name: B.upi }))
    expect(await screen.findByRole('heading', { name: title(B) })).toBeInTheDocument()

    await act(async () => finishA(A))
    expect(screen.getByRole('heading', { name: title(B) })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: title(A) })).toBeNull()
    expect(selectedInUrl()).toBe(B.upi)
  })

  it('opens the index guide from a card', async () => {
    getIndexGuide.mockResolvedValue([
      { code: 'NDVI', name: 'Normalized Difference Vegetation Index', meaning: 'How much green leaf is on the ground.' },
    ])
    renderDashboard(`/?upi=${A.upi}`)
    await userEvent.click(await screen.findByRole('button', { name: 'About NDVI' }))
    const dialog = await screen.findByRole('dialog', { name: 'Normalized Difference Vegetation Index' })
    expect(dialog).toHaveTextContent('How much green leaf is on the ground.')
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('signs out from the header', async () => {
    renderDashboard()
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(signOut).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run src/pages/Dashboard.test.jsx`
Expected: FAIL. The temporary shell has no UPI field or table, so the first assertions that look for them fail.

- [ ] **Step 3: Replace `src/pages/Dashboard.jsx`**

```jsx
import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SessionExpiredError } from '../api/arcgis.js'
import { getIndexGuide, getObservations, getParcel, listParcels } from '../api/cropHealth.js'
import { useAuth } from '../auth/AuthContext.jsx'
import IndexChart from '../components/IndexChart.jsx'
import IndexGuideDialog from '../components/IndexGuideDialog.jsx'
import ParcelSummary from '../components/ParcelSummary.jsx'
import ParcelsTable from '../components/ParcelsTable.jsx'
import UpiSearch from '../components/UpiSearch.jsx'
import { addToHistory, readHistory } from '../lib/history.js'
import { parseUpi } from '../lib/upi.js'
import ThemeToggle from '../theme/ThemeToggle.jsx'

// The map SDK is large: load it apart from the rest of the page.
const ParcelMap = lazy(() => import('../components/ParcelMap.jsx'))

const IDLE_PARCEL = { status: 'idle', parcel: null, error: null }
const IDLE_HISTORY = { status: 'idle', rows: [], error: null }
const FALLBACK_ERROR = 'Something went wrong. Try again.'

export default function Dashboard() {
  const { user, signOut, expire } = useAuth()
  const [params, setParams] = useSearchParams()
  const rawUpi = params.get('upi') || ''
  const upi = parseUpi(rawUpi)

  const [attempt, setAttempt] = useState(0)
  const [parcelState, setParcelState] = useState(IDLE_PARCEL)
  const [observations, setObservations] = useState(IDLE_HISTORY)
  const [listAttempt, setListAttempt] = useState(0)
  const [list, setList] = useState({ status: 'loading', parcels: [], truncated: false, error: null })
  const [history, setHistory] = useState(readHistory)
  const [guide, setGuide] = useState({ code: null, entries: null, error: null })

  // Analysed parcels: one request feeds the table and the map outlines.
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setList((current) => ({ ...current, status: 'loading', error: null }))
    listParcels({ signal: controller.signal })
      .then(({ parcels, truncated }) => {
        if (active) setList({ status: 'ready', parcels, truncated, error: null })
      })
      .catch((err) => {
        if (!active || err?.name === 'AbortError') return
        if (err instanceof SessionExpiredError) return expire()
        setList({ status: 'error', parcels: [], truncated: false, error: err.message || FALLBACK_ERROR })
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [listAttempt, expire])

  // The selected parcel and its history. `active` makes a slow answer for a
  // parcel the user has already left harmless.
  useEffect(() => {
    if (!upi) {
      setParcelState(IDLE_PARCEL)
      setObservations(IDLE_HISTORY)
      return undefined
    }
    const controller = new AbortController()
    const options = { signal: controller.signal }
    let active = true
    const failWith = (apply) => (err) => {
      if (!active || err?.name === 'AbortError') return
      if (err instanceof SessionExpiredError) return expire()
      apply(err.message || FALLBACK_ERROR)
    }

    setParcelState({ status: 'loading', parcel: null, error: null })
    setObservations({ status: 'loading', rows: [], error: null })

    getParcel(upi, options)
      .then((parcel) => {
        if (!active) return
        if (!parcel) {
          setParcelState({ status: 'not-found', parcel: null, error: null })
          return
        }
        setParcelState({ status: 'ready', parcel, error: null })
        setHistory(addToHistory(upi))
      })
      .catch(failWith((error) => setParcelState({ status: 'error', parcel: null, error })))

    getObservations(upi, options)
      .then((rows) => {
        if (active) setObservations({ status: 'ready', rows, error: null })
      })
      .catch(failWith((error) => setObservations({ status: 'error', rows: [], error })))

    return () => {
      active = false
      controller.abort()
    }
  }, [upi, attempt, expire])

  // Bumping `attempt` re-runs the request even when the UPI is unchanged, so
  // Run and Retry always fetch fresh data.
  const select = useCallback(
    (next) => {
      setParams({ upi: next })
      setAttempt((n) => n + 1)
    },
    [setParams],
  )
  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  const openGuide = useCallback(
    (code) => {
      setGuide((current) => ({ ...current, code, error: null }))
      getIndexGuide()
        .then((entries) => setGuide((current) => ({ ...current, entries })))
        .catch((err) => {
          if (err instanceof SessionExpiredError) return expire()
          setGuide((current) => ({ ...current, error: err.message || FALLBACK_ERROR }))
        })
    },
    [expire],
  )
  const closeGuide = useCallback(() => setGuide((current) => ({ ...current, code: null })), [])

  const selected = parcelState.status === 'ready' ? parcelState.parcel : null
  // The chart follows the parcel: no parcel, no history shown.
  const chartStatus =
    parcelState.status === 'ready' ? observations.status : parcelState.status === 'loading' ? 'loading' : 'idle'

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

      <main className="space-y-4 p-4">
        <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)_24rem]">
          <UpiSearch
            key={rawUpi}
            defaultValue={rawUpi}
            history={history}
            busy={parcelState.status === 'loading'}
            onSubmit={select}
          />

          <div className="panel h-[28rem] overflow-hidden lg:h-auto lg:min-h-[28rem]">
            <Suspense
              fallback={
                <div role="status" className="grid h-full place-items-center text-sm text-ink-2">
                  Loading map…
                </div>
              }
            >
              <ParcelMap parcels={list.parcels} selected={selected} onSelect={select} />
            </Suspense>
          </div>

          <section className="panel" aria-label="Parcel analysis">
            <ParcelSummary
              status={parcelState.status}
              parcel={parcelState.parcel}
              error={parcelState.error}
              onRetry={retry}
              onOpenGuide={openGuide}
            />
          </section>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <ParcelsTable
            status={list.status}
            parcels={list.parcels}
            truncated={list.truncated}
            selectedUpi={upi}
            error={list.error}
            onSelect={select}
            onRetry={() => setListAttempt((n) => n + 1)}
          />
          <IndexChart
            status={chartStatus}
            observations={observations.rows}
            error={observations.error}
            onRetry={retry}
          />
        </div>
      </main>

      {guide.code && (
        <IndexGuideDialog code={guide.code} entries={guide.entries} error={guide.error} onClose={closeGuide} />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/pages/Dashboard.test.jsx`
Expected: PASS, 10 tests.

Run: `npm test`
Expected: PASS, all files.

- [ ] **Step 5: Check the whole app against the live services**

Run: `npm run dev`, open http://localhost:5173 and ask the user to sign in. Go through this list with them:

| Check | Expected |
|---|---|
| Analysed parcels table | Fills with UPI, district and NDVI level; column headers sort |
| Map before a search | Rwanda, with white parcel outlines once zoomed in |
| Type `5/05/10/02/1939`, press Run | Address bar gains `?upi=…`; map zooms to the parcel with a cyan outline; cards show NDVI 0.14 bare ground, NDMI -0.30 very dry, NDRE 0.07; facts show date, area in hectares, reliability, clear dates |
| Chart | Three lines over about 14 months; hovering shows the date and three values; Table shows the same numbers |
| Info button on a card | Dialog with meaning, levels, caveats, formula; Escape closes it |
| Click a table row, then a parcel on the map | Each opens that parcel |
| Type `5/05/10/02/1`, press Run | "This parcel has not been analysed yet." |
| Type `abc`, press Run | "Enter a UPI in the form 5/05/10/02/1939", no request in the network panel |
| History tab | Lists the parcels opened, newest first |
| Reload the page on a parcel | Same parcel shown |
| Theme toggle | Whole page, chart and map controls switch; choice survives a reload |
| Narrow the window below 1024 px | Panels stack in one column, nothing overflows sideways |
| Sign out, then open a `?upi=…` link | Sign-in page; after sign-in the parcel opens |

Compare one parcel's numbers with the GIS team's dashboard. They must match, since both read the same layer.

Stop the dev server.

- [ ] **Step 6: Check the production build**

Run: `npm run build`
Expected: succeeds.

Create `.env` with a real secret (PowerShell):

```
"SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")" | Out-File -Encoding ascii .env
```

Run: `npm start`
Expected: `Crop Health listening on http://localhost:4173`. Open it; the sign-in page loads, and `http://localhost:4173/api/auth/session` returns `{"authenticated":false}`. Stop the server. `.env` is ignored by git and must not be committed.

- [ ] **Step 7: Commit**

```
git add -A
git commit -m "Assemble the dashboard: search, map, summary, chart and table"
```

---

## After this plan

These are waiting on the GIS team and are not part of this plan:

1. Status badge, season, narrative, trend and crop-cycle count: needs the rules or the service that produces them. The result panel has room below the cards.
2. Running a new analysis for a UPI that is not in the layer: needs the REST URL, inputs and outputs of the "Crop Health V2 - Analyse UPI" tool. It becomes one new function in `src/api/cropHealth.js` and one new allowed path in the proxy.
3. A registered OAuth app for sign-in: set `PORTAL_CLIENT_ID` and `PORTAL_CLIENT_SECRET`; no code change.
