import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SessionExpiredError } from '../api/arcgis.js'
import { getIndexGuide, getObservations, getParcel, listParcels } from '../api/cropHealth.js'
import { findLandParcel } from '../api/lais.js'
import { useAuth } from '../auth/AuthContext.jsx'
import ErrorBoundary from '../components/ErrorBoundary.jsx'
import IndexCards from '../components/IndexCards.jsx'
import IndexChart from '../components/IndexChart.jsx'
import Overview, { NeedsAttention } from '../components/Overview.jsx'
import ParcelSummary from '../components/ParcelSummary.jsx'
import RangeBar from '../components/RangeBar.jsx'
import SearchBar from '../components/SearchBar.jsx'
import SeasonCards from '../components/SeasonCards.jsx'
import Sidebar from '../components/Sidebar.jsx'
import { useAnalysis } from '../hooks/useAnalysis.js'
import { inDistrict, parseHealthFilter, withHealth } from '../lib/health.js'
import { usePlotScene } from '../hooks/usePlotScene.js'
import { useQuickLook } from '../hooks/useQuickLook.js'
import { defaultFieldName, fieldName } from '../lib/drawnField.js'
import { formatDate } from '../lib/format.js'
import { addToHistory, readHistory } from '../lib/history.js'
import { parseRange, rangeParams } from '../lib/range.js'
import { parseParcelId, parseUpi } from '../lib/upi.js'

// The map SDK is large: load it apart from the rest of the page.
const ParcelMap = lazy(() => import('../components/ParcelMap.jsx'))

const IDLE_PARCEL = { status: 'idle', parcel: null, error: null }
const IDLE_HISTORY = { status: 'idle', rows: [], error: null }
const FALLBACK_ERROR = 'Something went wrong. Try again.'
const DESKTOP = '(min-width: 1024px)'
// The least a report's map and index cards get on a short window: below this they would be unreadable,
// and the page scrolls instead.
const FIT_MIN_PX = 340

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

  // The period the report covers: in the link, so a reload or a shared link keeps it.
  const fromParam = params.get('from')
  const toParam = params.get('to')
  const range = useMemo(
    () => parseRange(new URLSearchParams({ from: fromParam ?? '', to: toParam ?? '' })),
    [fromParam, toParam],
  )

  // Changes the given link params and keeps the rest (the period).
  const patchParams = useCallback(
    (patch) =>
      setParams((current) => {
        const next = new URLSearchParams(current)
        for (const [key, value] of Object.entries(patch)) {
          if (value === null || value === undefined || value === '') next.delete(key)
          else next.set(key, value)
        }
        return next
      }),
    [setParams],
  )
  const setRange = useCallback((next) => patchParams(rangeParams(next)), [patchParams])

  // A district picked in the sidebar narrows the overview and moves the map to it; in the link too.
  const district = params.get('district') || null
  // A health chip picked on the overview (every area, or one verdict) filters its list and the map; in the link too.
  const healthFilter = parseHealthFilter(params.get('health'))
  const setHealthFilter = useCallback((next) => patchParams({ health: next }), [patchParams])

  // A land parcel clicked on the map that has not been analysed: a quick look,
  // measured from Sentinel-2, shown on the map only. Not in the link.
  const [look, setLook] = useState(null)
  // The name a drawn field will be analysed under; the tool stores it as `AREA <name>`.
  const [nameText, setNameText] = useState('')

  // A date picked on the chart for the map image. It belongs to one plot and
  // period, so it is forgotten when either changes.
  const lookKey = look ? JSON.stringify(look.rings) : ''
  const imageKey = `${upi}|${fromParam}|${toParam}|${lookKey}`
  const [picked, setPicked] = useState({ key: '', date: null })
  const imageDate = picked.key === imageKey ? picked.date : null
  const pickImageDate = useCallback((date) => setPicked({ key: imageKey, date }), [imageKey])

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

  // A searched UPI with no analysis yet: find it in the land records, so the
  // map can show it with a quick look and it can be analysed in one click.
  // `lookup`: idle, searching, found, missing or error, for the parcel in `key`.
  const [lookup, setLookup] = useState({ key: null, status: 'idle' })
  const searchable = parcelState.status === 'not-found' ? parseUpi(upi) : null
  useEffect(() => {
    if (!searchable) return undefined
    const controller = new AbortController()
    let active = true
    setLookup({ key: searchable, status: 'searching' })
    findLandParcel(searchable, { signal: controller.signal })
      .then((field) => {
        if (!active) return
        setLookup({ key: searchable, status: field ? 'found' : 'missing' })
        if (field) setLook({ ...field, searchedUpi: searchable })
      })
      .catch((err) => {
        if (active && err?.name !== 'AbortError') setLookup({ key: searchable, status: 'error' })
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [searchable])
  // The searched parcel's quick look belongs to that search: leaving it ends it.
  useEffect(() => {
    setLook((current) => (current?.searchedUpi && current.searchedUpi !== upi ? null : current))
  }, [upi])
  const lookupStatus = lookup.key === searchable ? lookup.status : null

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
      setLook(null)
      if (next === upi) setAttempt((n) => n + 1)
      else patchParams({ upi: next })
    },
    [upi, patchParams],
  )
  // A click on the open plot only reopens its card (the map does that itself);
  // reloading the report would also undo the user's pan and zoom.
  const selectOnMap = useCallback(
    (next) => {
      if (next === upi && !look) return
      select(next)
    },
    [upi, look, select],
  )
  // The quick look takes the map's selection: it closes the report.
  const lookAt = useCallback(
    (field) => {
      setMenuOpen(false)
      setLook(field)
      patchParams({ upi: null })
    },
    [patchParams],
  )
  // A field drawn on the map is a quick look too, with a name to analyse it under.
  const drawField = useCallback(
    (field) => {
      setNameText(defaultFieldName())
      lookAt(field)
    },
    [lookAt],
  )
  // The GIS team's analysis, run for a clicked field: once its rows are
  // written, the list is read again (the field joins it) and its report opens.
  const onAnalysed = useCallback(
    (done) => {
      setListAttempt((n) => n + 1)
      select(done)
    },
    [select],
  )
  const { job: analysis, start: startAnalysis } = useAnalysis({ expire, onDone: onAnalysed })
  // The report as it was when "Update with new images" was pressed, to tell what the run added.
  const refreshBefore = useRef(null)
  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  const closeMenu = useCallback(() => setMenuOpen(false), [])
  // A district is an overview of its parcels: picking one closes any open report.
  const pickDistrict = useCallback(
    (next) => {
      setMenuOpen(false)
      setLook(null)
      patchParams({ district: next, upi: null })
    },
    [patchParams],
  )
  const districtParcels = useMemo(() => inDistrict(list.parcels, district), [list.parcels, district])
  // On the overview the map outlines only the parcels of the picked verdict; a report shows them all.
  const reportShown = parcelState.status !== 'idle'
  const mapParcels = useMemo(
    () => (reportShown ? list.parcels : withHealth(list.parcels, guide, healthFilter)),
    [reportShown, list.parcels, guide, healthFilter],
  )

  const reportOpen = parcelState.status !== 'idle'
  const selected = parcelState.status === 'ready' ? parcelState.parcel : null
  const showChart = parcelState.status === 'ready'
  const plotRings = look ? look.rings : (selected?.rings ?? null)
  const scene = usePlotScene(plotRings, range, imageDate)
  const quick = useQuickLook(look, scene)
  // On the map the quick-look parcel is the selection, carrying its measurement.
  // Only a real UPI can be analysed. One run at a time: while another field's
  // run is going, this field's button waits.
  const lookUpi = look && !look.drawn ? parseUpi(look.upi) : null
  const drawnName = look?.drawn ? fieldName(nameText) : null
  const lookId = lookUpi ?? (drawnName ? `AREA ${drawnName}` : null)
  let analyse = null
  if (lookUpi || look?.drawn) {
    const own = lookId !== null && analysis.id === lookId
    let status = own ? analysis.status : 'idle'
    if (!own && analysis.status === 'running') status = 'busy'
    analyse = {
      status,
      message: own ? analysis.message : null,
      onStart: () => {
        if (lookUpi) startAnalysis({ upi: lookUpi })
        else if (drawnName) startAnalysis({ area: { rings: look.rings }, name: drawnName })
      },
    }
    if (look.drawn) {
      const target = `AREA ${drawnName}`.toLowerCase()
      Object.assign(analyse, {
        name: nameText,
        onNameChange: setNameText,
        valid: drawnName !== null,
        exists: drawnName !== null && list.parcels.some((p) => p.upi.toLowerCase() === target),
      })
    }
  }
  // An analysed parcel or field, run again for new images. Its id (a UPI or `AREA <name>`) goes in the
  // tool's UPI box; when the run is done the report reloads with the new dates.
  let refresh = null
  if (selected) {
    const own = analysis.id === selected.upi
    let status = own ? analysis.status : 'idle'
    if (!own && analysis.status === 'running') status = 'busy'
    // After the run, the reloaded report says what it found: compared with the latest clear date before it.
    const before = refreshBefore.current
    let outcome = null
    if (own && status === 'succeeded' && before?.upi === selected.upi) {
      const found = (selected.latestDate ?? 0) > (before.latestDate ?? 0)
      outcome = found
        ? { found, text: `New clear images added, up to ${formatDate(selected.latestDate)}.` }
        : {
            found,
            text: `No new clear image since ${formatDate(before.latestDate)}: cloud cover, or no satellite pass yet. The history is unchanged.`,
          }
    }
    refresh = {
      status,
      message: own ? analysis.message : null,
      outcome,
      onStart: () => {
        refreshBefore.current = { upi: selected.upi, latestDate: selected.latestDate }
        startAnalysis({ upi: selected.upi })
      },
    }
  }
  const mapSelected = look ? { ...look, quick, analyse } : selected
  const mainRef = useRef(null)
  // The card's "Open report": the report is above the map in this layout.
  const openReport = useCallback(() => mainRef.current?.scrollTo?.({ top: 0, behavior: 'smooth' }), [])

  // On a wide screen a report's map, and the three index cards beside it, end at the window's foot: all of
  // both in view without scrolling, whatever the summary above them takes. Measured from where the map
  // starts, again whenever the window or the summary changes size.
  const headRef = useRef(null)
  const mapBoxRef = useRef(null)
  const [fitHeight, setFitHeight] = useState(null)
  useLayoutEffect(() => {
    if (!showChart || !isDesktop) {
      setFitHeight(null)
      return undefined
    }
    const measure = () => {
      const main = mainRef.current
      const box = mapBoxRef.current
      if (!main || !box) return
      const top = box.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop
      const foot = parseFloat(getComputedStyle(box.parentElement).paddingBottom) || 0
      setFitHeight(Math.max(FIT_MIN_PX, Math.floor(main.clientHeight - top - foot)))
    }
    measure()
    const observer = new ResizeObserver(measure)
    for (const el of [mainRef.current, headRef.current]) if (el) observer.observe(el)
    return () => observer.disconnect()
  }, [showChart, isDesktop])

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
          error: list.error,
          onRetry: () => setListAttempt((n) => n + 1),
          guide,
          district,
          onDistrict: pickDistrict,
          recent: history,
          selectedUpi: upi,
          onSelect: select,
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

        <main ref={mainRef} className="min-h-0 flex-1 overflow-y-auto">
          {/* One grid for every view, so the map stays mounted while the cards around it change.
              It is capped at 1440px and centred, so it never stretches edge to edge; spacing grows with the screen.
              On a phone the overview reads summary, attention, map, districts (the `order-*` classes). */}
          <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-4 p-4 sm:p-5 lg:grid-cols-3 2xl:gap-5 2xl:p-8">
            <div ref={headRef} className={`lg:col-span-3 ${reportOpen ? '' : 'order-1 lg:order-none'}`}>
              {reportOpen ? (
                <section aria-label="Parcel analysis" className="space-y-4">
                  <button
                    type="button"
                    onClick={() => patchParams({ upi: null })}
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
                    lookup={lookupStatus}
                    analyse={look?.searchedUpi ? analyse : null}
                    refresh={refresh}
                  />
                </section>
              ) : (
                <Overview
                  status={list.status}
                  parcels={districtParcels}
                  truncated={list.truncated}
                  guide={guide}
                  district={district}
                  onClearDistrict={() => pickDistrict(null)}
                  filter={healthFilter}
                  onFilter={setHealthFilter}
                />
              )}
            </div>

            {/* The map is the page's priority: first after the header, and the largest card. */}
            <div
              ref={mapBoxRef}
              // A report's map on a wide screen: as tall as the room left in the window (measured above).
              style={showChart && fitHeight ? { height: fitHeight } : undefined}
              className={`panel relative overflow-hidden ${
                showChart
                  ? // Until measured, and on a phone: a share of the screen. The index cards beside it share its height.
                    'h-[55vh] min-h-[22rem] lg:col-span-2 lg:h-[calc(100dvh-6rem)]'
                  : reportOpen
                    ? 'h-[26rem] lg:col-span-3 lg:h-[34rem]'
                    : // The screen's height less the header and the one-line summary above it, so the
                      // whole map (legend included) is in view and Home shows all of Rwanda.
                      // The parcels list ("Needs attention") is beside it.
                      'order-3 h-[60vh] min-h-[22rem] lg:order-none lg:col-span-2 lg:h-[calc(100dvh-11rem)] lg:min-h-[24rem] lg:self-start'
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
                  <ParcelMap
                    parcels={mapParcels}
                    allParcels={list.parcels}
                    selected={mapSelected}
                    onSelect={selectOnMap}
                    onLookAt={lookAt}
                    onDrawn={drawField}
                    scene={scene}
                    onOpenReport={openReport}
                    guide={guide}
                    district={district}
                    controlsBottom="1.75rem"
                  />
                </Suspense>
              </ErrorBoundary>
            </div>

            {!reportOpen && (
              // Beside the map this box is as tall as the map; the card inside never makes it taller.
              <div className="order-2 lg:relative lg:order-none">
                <NeedsAttention
                  status={list.status}
                  parcels={districtParcels}
                  guide={guide}
                  onSelect={select}
                  filter={healthFilter}
                  onClearFilter={() => setHealthFilter(null)}
                />
              </div>
            )}

            {showChart && (
              // The cards fill this box, which is as tall as the map; placed absolutely, they never make the row taller.
              <div className="lg:relative">
                <IndexCards
                  parcel={parcelState.parcel}
                  guide={guide}
                  observations={observations.status === 'ready' ? observations.rows : null}
                  range={range}
                  className="lg:absolute lg:inset-0"
                />
              </div>
            )}

            {showChart && (
              <div className="lg:col-span-3">
                <IndexChart
                  status={observations.status}
                  observations={observations.rows}
                  error={observations.error}
                  onRetry={retry}
                  range={range}
                  imageDate={imageDate}
                  onImageDate={pickImageDate}
                  onRangeSelect={setRange}
                  toolbar={
                    // The seasons sit with the period bar: both set the chart's period, in view without scrolling down.
                    <div className="space-y-3">
                      <RangeBar range={range} onChange={setRange} />
                      {observations.status === 'ready' && (
                        <SeasonCards observations={observations.rows} range={range} onSelect={setRange} guide={guide} />
                      )}
                    </div>
                  }
                />
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
