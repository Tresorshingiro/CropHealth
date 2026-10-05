import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SessionExpiredError } from '../api/arcgis.js'
import { getIndexGuide, getObservations, getParcel, listParcels } from '../api/cropHealth.js'
import { useAuth } from '../auth/AuthContext.jsx'
import ErrorBoundary from '../components/ErrorBoundary.jsx'
import IndexChart from '../components/IndexChart.jsx'
import Overview from '../components/Overview.jsx'
import ParcelSummary from '../components/ParcelSummary.jsx'
import SearchBar from '../components/SearchBar.jsx'
import Sidebar from '../components/Sidebar.jsx'
import { addToHistory, readHistory } from '../lib/history.js'
import { parseParcelId } from '../lib/upi.js'

// The map SDK is large: load it apart from the rest of the page.
const ParcelMap = lazy(() => import('../components/ParcelMap.jsx'))

const IDLE_PARCEL = { status: 'idle', parcel: null, error: null }
const IDLE_HISTORY = { status: 'idle', rows: [], error: null }
const FALLBACK_ERROR = 'Something went wrong. Try again.'
const DESKTOP = '(min-width: 1024px)'

/** Whether the sidebar is a fixed column (wide screens) or a slide-in menu, kept current. */
function useIsDesktop() {
  const [matches, setMatches] = useState(() => window.matchMedia(DESKTOP).matches)
  useEffect(() => {
    const query = window.matchMedia(DESKTOP)
    const onChange = (event) => setMatches(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return matches
}

export default function Dashboard() {
  const { user, signOut, expire } = useAuth()
  const [params, setParams] = useSearchParams()
  const rawUpi = params.get('upi') || ''
  // A parcel's UPI or a drawn area's id: both are rows of the parcel layer.
  const upi = parseParcelId(rawUpi)
  const isDesktop = useIsDesktop()

  const [attempt, setAttempt] = useState(0)
  const [parcelState, setParcelState] = useState(IDLE_PARCEL)
  const [observations, setObservations] = useState(IDLE_HISTORY)
  const [listAttempt, setListAttempt] = useState(0)
  const [list, setList] = useState({ status: 'loading', parcels: [], truncated: false, error: null })
  const [history, setHistory] = useState(readHistory)
  const [guide, setGuide] = useState({ entries: null, error: null })
  const [menuOpen, setMenuOpen] = useState(false)

  // Analysed parcels: one request feeds the list, the overview and the map outlines.
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

  // The index guide draws the scales and explains each index. The page works
  // without it, so a failure only removes those.
  useEffect(() => {
    let active = true
    getIndexGuide()
      .then((entries) => {
        if (active) setGuide({ entries, error: null })
      })
      .catch((err) => {
        if (!active) return
        if (err instanceof SessionExpiredError) return expire()
        setGuide({ entries: null, error: err.message || FALLBACK_ERROR })
      })
    return () => {
      active = false
    }
  }, [expire])

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

  // The slide-in menu closes on Escape.
  useEffect(() => {
    if (!menuOpen) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [menuOpen])

  // A new UPI reloads through the link; running the same UPI again bumps
  // `attempt` so it still fetches fresh data.
  const select = useCallback(
    (next) => {
      setMenuOpen(false)
      if (next === upi) setAttempt((n) => n + 1)
      else setParams({ upi: next })
    },
    [upi, setParams],
  )
  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  const closeMenu = useCallback(() => setMenuOpen(false), [])

  const reportOpen = parcelState.status !== 'idle'
  const selected = parcelState.status === 'ready' ? parcelState.parcel : null
  const showChart = parcelState.status === 'ready'

  return (
    <div className="flex h-dvh overflow-hidden bg-page">
      {menuOpen && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={closeMenu} />}

      <Sidebar
        open={menuOpen}
        hidden={!isDesktop && !menuOpen}
        onClose={closeMenu}
        user={user}
        onSignOut={signOut}
        list={{
          status: list.status,
          parcels: list.parcels,
          truncated: list.truncated,
          selectedUpi: upi,
          error: list.error,
          onSelect: select,
          onRetry: () => setListAttempt((n) => n + 1),
        }}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="relative z-20 flex items-center gap-2 border-b border-line bg-surface px-4 py-3 lg:px-8">
          <button type="button" className="icon-btn lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Open menu">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h10" />
            </svg>
          </button>
          <SearchBar selected={rawUpi} history={history} onSubmit={select} />
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          {/* One grid for both views, so the map stays mounted while the cards around it change. */}
          <div className="mx-auto grid max-w-7xl gap-4 p-4 lg:grid-cols-5 lg:gap-5 lg:p-8">
            <div className="lg:col-span-5">
              {reportOpen ? (
                <section aria-label="Parcel analysis" className="space-y-4">
                  <button
                    type="button"
                    onClick={() => setParams({})}
                    aria-label="Back to overview"
                    className="-ml-1 inline-flex items-center gap-1 rounded-md px-1 text-sm text-ink-2 transition hover:text-ink"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M15 6l-6 6 6 6" />
                    </svg>
                    Overview
                  </button>
                  <ParcelSummary
                    status={parcelState.status}
                    parcel={parcelState.parcel}
                    error={parcelState.error}
                    onRetry={retry}
                    guide={guide}
                  />
                </section>
              ) : (
                <Overview status={list.status} parcels={list.parcels} truncated={list.truncated} />
              )}
            </div>

            {showChart && (
              <div className="lg:col-span-3">
                <IndexChart
                  status={observations.status}
                  observations={observations.rows}
                  error={observations.error}
                  onRetry={retry}
                />
              </div>
            )}

            <div
              className={`panel relative overflow-hidden ${
                showChart ? 'h-80 lg:col-span-2 lg:h-auto lg:min-h-[24rem]' : 'h-[26rem] lg:col-span-5 lg:h-[34rem]'
              }`}
            >
              <ErrorBoundary
                fallback={
                  <p role="alert" className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-ink-2">
                    The map could not be shown. Search and the parcels list still work.
                  </p>
                }
              >
                <Suspense
                  fallback={
                    <div role="status" className="absolute inset-0 grid place-items-center text-sm text-ink-2">
                      Loading map…
                    </div>
                  }
                >
                  <ParcelMap parcels={list.parcels} selected={selected} onSelect={select} controlsBottom="1.75rem" />
                </Suspense>
              </ErrorBoundary>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
