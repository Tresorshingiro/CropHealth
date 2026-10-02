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
