import { useMemo } from 'react'
import { formatDate, formatIndex } from '../lib/format.js'
import { areasFor, healthSummary } from '../lib/health.js'
import { HEALTH_COLORS } from '../lib/mapLayers.js'
import Verdict from './Verdict.jsx'

const GUIDE_FAILED = "Health can't be rated: the index guide didn't load."
const tabular = { fontVariantNumeric: 'tabular-nums' }

const Dot = ({ verdict }) => (
  <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: HEALTH_COLORS[verdict].css }} />
)

// A count in one short chip, so the whole summary fits on the title's line and the map gets the height.
// With `onPick` it is a filter: pressed while its filter is on.
function Tile({ label, verdict, value, pressed, onPick }) {
  const body = (
    <>
      <span className="font-display text-base font-semibold leading-none" style={tabular}>
        {value}
      </span>
      <span className="flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-ink-2">
        {verdict && <Dot verdict={verdict} />}
        {label}
      </span>
    </>
  )
  const shape = 'flex items-center gap-2 rounded-full px-3 py-1.5'
  if (!onPick) return <div className={`card ${shape}`}>{body}</div>
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onPick}
      className={`${shape} transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
        pressed ? 'bg-accent/15 ring-1 ring-accent' : 'card hover:bg-raised'
      }`}
    >
      {body}
    </button>
  )
}

/**
 * The top of the overview: how many parcels are analysed and how their crop
 * health splits, by the same rule as each report. The counts filter the list
 * and the map: `filter` is 'all', a verdict, or null; picking it again clears it.
 */
export default function Overview({
  status,
  parcels,
  truncated,
  guide,
  district = null,
  onClearDistrict,
  filter = null,
  onFilter,
}) {
  const known = status === 'ready'
  const rated = Boolean(guide?.entries)
  const counts = useMemo(() => healthSummary(parcels, guide), [parcels, guide])
  const districts = new Set(parcels.map((parcel) => parcel.district).filter(Boolean)).size
  const dates = parcels.map((parcel) => parcel.latestDate).filter((date) => typeof date === 'number')
  const latest = dates.length ? Math.max(...dates) : null

  let note = null
  if (known && parcels.length === 0) note = 'No areas of interest yet.'
  else if (known) note = `${districts} ${districts === 1 ? 'district' : 'districts'} · latest ${formatDate(latest)}`
  const count = (key) => (known && rated ? counts[key] : '–')
  // Filtering needs the parcels and their ratings.
  const pick = (key) => (onFilter && known && rated ? () => onFilter(filter === key ? null : key) : undefined)

  const notes = [
    known && rated && counts.unrated > 0 ? `${counts.unrated} not rated` : null,
    guide?.error ? GUIDE_FAILED : null,
    truncated ? `Counts cover the first ${parcels.length} parcels.` : null,
  ].filter(Boolean)

  // One line: the title, then the counts as chips (they wrap under it on a narrow screen).
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="font-display text-xl font-semibold tracking-tight">Overview</h1>
          {district && (
            <button
              type="button"
              onClick={onClearDistrict}
              aria-label={`Show all districts (now ${district})`}
              className="inline-flex shrink-0 items-center gap-1 self-center rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-semibold text-accent transition hover:bg-accent/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              {district}
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          )}
          {note && <p className="truncate text-xs text-ink-2">{note}</p>}
        </div>
        {status === 'loading' ? (
          <div role="status" aria-label="Loading overview" className="h-8 w-80 max-w-full animate-pulse rounded-full bg-raised motion-reduce:animate-none" />
        ) : (
          <div role="group" aria-label="Crop health summary" className="flex flex-wrap gap-2">
            <Tile label="Areas of interest" value={known ? parcels.length : '–'} pressed={filter === 'all'} onPick={pick('all')} />
            {['good', 'moderate', 'poor'].map((key) => (
              <Tile
                key={key}
                label={HEALTH_COLORS[key].label}
                verdict={key}
                value={count(key)}
                pressed={filter === key}
                onPick={pick(key)}
              />
            ))}
          </div>
        )}
      </div>
      {notes.length > 0 && (
        <p className="flex flex-wrap justify-end gap-x-4 text-xs text-ink-2">
          {notes.map((text) => (
            <span key={text}>{text}</span>
          ))}
        </p>
      )}
    </div>
  )
}

// The list's title, line under it and empty message for each filter.
const LISTS = {
  null: { title: 'Needs attention', hint: 'Poor first, then Moderate · latest readings', empty: 'No parcel needs attention.' },
  all: { title: 'All areas of interest', hint: 'Worst first · latest readings', empty: 'No areas of interest yet.' },
  good: { title: 'Good', hint: 'Newest reading first', empty: 'No parcel is Good.' },
  moderate: { title: 'Moderate', hint: 'Newest reading first', empty: 'No parcel is Moderate.' },
  poor: { title: 'Poor', hint: 'Newest reading first', empty: 'No parcel is Poor.' },
}

/**
 * The overview's list of parcels, each opening its report: those worth a look
 * (Poor first, then Moderate) unless a health filter picks every area or one verdict.
 */
export function NeedsAttention({ status, parcels, guide, onSelect, filter = null, onClearFilter }) {
  const list = LISTS[filter] ?? LISTS.null
  // Every one of them: the list scrolls within the card, which is no taller than the map beside it.
  const rows = useMemo(() => areasFor(parcels, guide, filter), [parcels, guide, filter])

  let body
  if (status === 'loading') {
    body = <div role="status" aria-label="Loading parcels" className="h-40 animate-pulse rounded-2xl bg-raised motion-reduce:animate-none" />
  } else if (guide?.error) {
    body = <p className="text-sm text-ink-2">{GUIDE_FAILED}</p>
  } else if (!guide?.entries) {
    body = <p className="text-sm text-ink-2">Rating parcels…</p>
  } else if (parcels.length === 0) {
    body = <p className="text-sm text-ink-2">No areas of interest yet.</p>
  } else if (rows.length === 0) {
    body = <p className="text-sm text-ink-2">{list.empty}</p>
  } else {
    body = (
      <ul aria-label={list.title} className="-mx-1.5 min-h-0 space-y-1 overflow-y-auto">
        {rows.map(({ parcel, verdict, weakest }) => (
          <li key={parcel.upi}>
            <button
              type="button"
              onClick={() => onSelect(parcel.upi)}
              className="flex w-full items-center gap-3 rounded-2xl px-2.5 py-2 text-left transition hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <Dot verdict={verdict ?? 'unrated'} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold" style={tabular}>
                  {parcel.upi}
                </span>
                <span className="block truncate text-xs text-ink-2">
                  {[parcel.district, formatDate(parcel.latestDate)].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="shrink-0 text-right">
                {verdict ? (
                  <Verdict verdict={verdict} className="block text-xs" />
                ) : (
                  <span className="block text-xs text-ink-2">Not rated</span>
                )}
                {weakest && (
                  <span className="block text-xs text-ink-2" style={tabular}>
                    {`${weakest.code} ${formatIndex(weakest.value)}`}
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    )
  }

  return (
    // On a phone it stops at 28rem; beside the map, at the map's height (the Dashboard sizes that box).
    <section
      aria-labelledby="attention-title"
      className="panel flex max-h-[28rem] flex-col gap-3 p-4 lg:absolute lg:inset-x-0 lg:top-0 lg:max-h-full"
    >
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="attention-title" className="flex items-center gap-2 font-display text-sm font-semibold">
            {filter && filter !== 'all' && <Dot verdict={filter} />}
            {list.title}
          </h2>
          {status === 'ready' && guide?.entries && rows.length > 0 && (
            <span className="text-xs font-medium text-ink-2" style={tabular}>
              {rows.length}
            </span>
          )}
        </div>
        <p className="flex items-center justify-between gap-2 text-xs text-ink-2">
          {list.hint}
          {filter && onClearFilter && (
            <button type="button" onClick={onClearFilter} className="font-semibold text-accent hover:underline">
              Back to needs attention
            </button>
          )}
        </p>
      </div>
      {body}
    </section>
  )
}
