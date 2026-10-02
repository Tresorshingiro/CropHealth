import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SessionExpiredError } from '../api/arcgis.js'
import { getIndexGuide, getObservations, getParcel, listParcels } from '../api/cropHealth.js'
import { useAuth } from '../auth/AuthContext.jsx'
import ErrorBoundary from '../components/ErrorBoundary.jsx'
import IndexChart from '../components/IndexChart.jsx'
import ParcelsDrawer from '../components/ParcelsDrawer.jsx'
import ParcelSummary from '../components/ParcelSummary.jsx'
import SearchBar from '../components/SearchBar.jsx'
import { addToHistory, readHistory } from '../lib/history.js'
import { parseUpi } from '../lib/upi.js'
import ThemeToggle from '../theme/ThemeToggle.jsx'

// The map SDK is large: load it apart from the rest of the page.
const ParcelMap = lazy(() => import('../components/ParcelMap.jsx'))

const IDLE_PARCEL = { status: 'idle', parcel: null, error: null }
const IDLE_HISTORY = { status: 'idle', rows: [], error: null }
const FALLBACK_ERROR = 'Something went wrong. Try again.'
const DESKTOP = '(min-width: 1024px)'

// Sheet widths in pixels, matched by the Tailwind classes on the sheet below.
const SHEET_NARROW = 416
const SHEET_WIDE = 720
const SHEET_GAP = 12
// On a phone the sheet rises from the bottom and takes this share of the height.
const SHEET_PHONE_SHARE = 0.55

/** Whether the sheet sits beside the map (wide screens) and how tall the window is, kept current. */
function useViewport() {
  const read = () => ({ isDesktop: window.matchMedia(DESKTOP).matches, height: window.innerHeight })
  const [viewport, setViewport] = useState(read)
  useEffect(() => {
    const onResize = () => setViewport(read())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return viewport
}

const Icon = ({ d }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
)

export default function Dashboard() {
  const { user, signOut, expire } = useAuth()
  const [params, setParams] = useSearchParams()
  const rawUpi = params.get('upi') || ''
  const upi = parseUpi(rawUpi)
  const { isDesktop, height } = useViewport()

  const [attempt, setAttempt] = useState(0)
  const [parcelState, setParcelState] = useState(IDLE_PARCEL)
  const [observations, setObservations] = useState(IDLE_HISTORY)
  const [listAttempt, setListAttempt] = useState(0)
  const [list, setList] = useState({ status: 'loading', parcels: [], truncated: false, error: null })
  const [history, setHistory] = useState(readHistory)
  const [guide, setGuide] = useState({ entries: null, error: null })
  const [listOpen, setListOpen] = useState(false)
  const [wide, setWide] = useState(false)

  // Analysed parcels: one request feeds the list and the map outlines.
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

  // A new UPI reloads through the link; running the same UPI again bumps
  // `attempt` so it still fetches fresh data.
  const select = useCallback(
    (next) => {
      setListOpen(false)
      if (next === upi) setAttempt((n) => n + 1)
      else setParams({ upi: next })
    },
    [upi, setParams],
  )
  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  const closeSheet = useCallback(() => setParams({}), [setParams])
  const closeList = useCallback(() => setListOpen(false), [])

  const sheetOpen = parcelState.status !== 'idle'
  const selected = parcelState.status === 'ready' ? parcelState.parcel : null
  const showChart = parcelState.status === 'ready'

  // The part of the window the sheet covers, so the map centres the parcel in
  // what is left: beside the sheet on a wide screen, above it on a phone.
  const padding = useMemo(() => {
    if (!sheetOpen) return { top: 64 }
    if (isDesktop) return { top: 64, right: (wide ? SHEET_WIDE : SHEET_NARROW) + SHEET_GAP }
    return { top: 64, bottom: Math.round(height * SHEET_PHONE_SHARE) }
  }, [sheetOpen, isDesktop, wide, height])

  return (
    <div className="relative h-dvh overflow-hidden bg-page">
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
          <ParcelMap
            parcels={list.parcels}
            selected={selected}
            onSelect={select}
            padding={padding}
            controlsBottom={sheetOpen && !isDesktop ? 'calc(55dvh + 1.25rem)' : undefined}
          />
        </Suspense>
      </ErrorBoundary>

      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-3">
        <div className="pointer-events-auto w-full max-w-md">
          <SearchBar selected={rawUpi} history={history} onSubmit={select} onOpenParcels={() => setListOpen(true)} />
          {!sheetOpen && !rawUpi && (
            <p className="glass mt-2 inline-block rounded-full px-4 py-1.5 text-xs text-ink-2 shadow-float">
              Search a UPI, pick a parcel on the map, or open the list.
            </p>
          )}
        </div>

        <div className="glass pointer-events-auto flex shrink-0 items-center gap-1 rounded-full p-1.5 shadow-float">
          <span className="hidden px-3 font-display text-sm font-semibold sm:inline">Crop Health</span>
          <span className="hidden max-w-[10rem] truncate border-l border-line px-3 text-sm text-ink-2 md:inline">
            {user?.fullName || user?.username}
          </span>
          <ThemeToggle />
          <button type="button" className="icon-btn" onClick={signOut} aria-label="Sign out" title="Sign out">
            <Icon d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
          </button>
        </div>
      </header>

      {sheetOpen && (
        <aside
          aria-label="Parcel analysis"
          className={`glass absolute inset-x-0 bottom-0 z-20 flex h-[55dvh] animate-slide-up flex-col rounded-t-3xl shadow-float motion-reduce:animate-none lg:inset-x-auto lg:bottom-7 lg:right-3 lg:top-[4.25rem] lg:h-auto lg:animate-slide-in-right lg:rounded-3xl lg:transition-[width] lg:duration-300 lg:motion-reduce:transition-none ${
            wide ? 'lg:w-[45rem]' : 'lg:w-[26rem]'
          }`}
        >
          <div className="flex shrink-0 items-center justify-end gap-1 px-3 pt-3">
            <button
              type="button"
              className="icon-btn hidden lg:grid"
              onClick={() => setWide((current) => !current)}
              aria-label={wide ? 'Narrow' : 'Widen'}
              title={wide ? 'Narrow' : 'Widen'}
            >
              <Icon d={wide ? 'M13 6l6 6-6 6M5 6l6 6-6 6' : 'M11 6l-6 6 6 6M19 6l-6 6 6 6'} />
            </button>
            <button type="button" className="icon-btn" onClick={closeSheet} aria-label="Close parcel" title="Close">
              <Icon d="M6 6l12 12M18 6L6 18" />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 pb-5">
            <ParcelSummary
              status={parcelState.status}
              parcel={parcelState.parcel}
              error={parcelState.error}
              onRetry={retry}
              guide={guide}
            />
            {showChart && (
              <div className="border-t border-line pt-5">
                <IndexChart
                  status={observations.status}
                  observations={observations.rows}
                  error={observations.error}
                  onRetry={retry}
                />
              </div>
            )}
          </div>
        </aside>
      )}

      {listOpen && (
        <ParcelsDrawer
          onClose={closeList}
          status={list.status}
          parcels={list.parcels}
          truncated={list.truncated}
          selectedUpi={upi}
          error={list.error}
          onSelect={select}
          onRetry={() => setListAttempt((n) => n + 1)}
        />
      )}
    </div>
  )
}
