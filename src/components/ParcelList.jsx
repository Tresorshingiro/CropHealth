import { useMemo, useState } from 'react'
import { formatDate } from '../lib/format.js'
import { parcelHealth } from '../lib/health.js'
import { HEALTH_COLORS } from '../lib/mapLayers.js'

const RANK = { poor: 0, moderate: 1, good: 2, unrated: 3 }
// The chips read worst first, the order someone checking crops works in.
const CHIPS = ['poor', 'moderate', 'good', 'unrated']
const NO_DISTRICT = 'No district'
const byUpi = (a, b) => a.parcel.upi.localeCompare(b.parcel.upi, 'en', { numeric: true })
const tabular = { fontVariantNumeric: 'tabular-nums' }

const Dot = ({ health }) => (
  <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: HEALTH_COLORS[health].css }} />
)

/**
 * The areas of interest (analysed parcels and drawn fields) for the sidebar:
 * filtered by text, health and district, grouped under their district
 * (largest first), worst health first within each group. Health uses the
 * same rule as the reports and the overview.
 */
export default function ParcelList({ status, parcels, truncated, selectedUpi, error, onSelect, onRetry, guide = null }) {
  const [filter, setFilter] = useState('')
  const [health, setHealth] = useState('all')
  const [district, setDistrict] = useState('')
  const [folded, setFolded] = useState(() => new Set())

  const rated = useMemo(
    () =>
      parcels.map((parcel) => ({
        parcel,
        health: parcelHealth(parcel, guide).verdict ?? 'unrated',
        district: parcel.district || NO_DISTRICT,
      })),
    [parcels, guide],
  )
  const counts = useMemo(() => {
    const out = { all: rated.length, poor: 0, moderate: 0, good: 0, unrated: 0 }
    for (const row of rated) out[row.health] += 1
    return out
  }, [rated])
  const districts = useMemo(() => [...new Set(rated.map((row) => row.district))].sort((a, b) => a.localeCompare(b)), [rated])

  const groups = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    const byDistrict = new Map()
    for (const row of rated) {
      if (health !== 'all' && row.health !== health) continue
      if (district && row.district !== district) continue
      if (needle && !row.parcel.upi.toLowerCase().includes(needle) && !row.district.toLowerCase().includes(needle)) continue
      byDistrict.set(row.district, [...(byDistrict.get(row.district) ?? []), row])
    }
    return [...byDistrict]
      .map(([label, rows]) => ({ label, rows: rows.sort((a, b) => RANK[a.health] - RANK[b.health] || byUpi(a, b)) }))
      .sort(
        (a, b) =>
          (a.label === NO_DISTRICT) - (b.label === NO_DISTRICT) || b.rows.length - a.rows.length || a.label.localeCompare(b.label),
      )
  }, [rated, filter, health, district])

  if (status === 'loading') {
    return (
      <p role="status" className="px-1 text-sm text-ink-2">
        Loading areas…
      </p>
    )
  }
  if (status === 'error') {
    return (
      <div role="alert" className="px-1">
        <p className="text-sm text-danger">{error}</p>
        <button type="button" className="btn-ghost mt-3" onClick={onRetry}>
          Retry
        </button>
      </div>
    )
  }
  if (parcels.length === 0) return <p className="px-1 text-sm text-ink-2">No areas of interest yet.</p>

  const toggleGroup = (label) =>
    setFolded((current) => {
      const next = new Set(current)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })

  const chip = (id, label, count) => (
    <button
      key={id}
      type="button"
      aria-pressed={health === id}
      onClick={() => setHealth(id)}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition ${
        health === id ? 'border-accent/40 bg-accent/10 text-ink' : 'border-line text-ink-2 hover:bg-raised hover:text-ink'
      }`}
    >
      {id !== 'all' && <Dot health={id} />}
      {label}
      <span className="font-semibold" style={tabular}>
        {count}
      </span>
    </button>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div>
        <label htmlFor="parcel-filter" className="sr-only">
          Filter areas
        </label>
        <input
          id="parcel-filter"
          type="search"
          className="field"
          placeholder="Filter by UPI or district"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
      </div>

      <div role="group" aria-label="Health" className="flex flex-wrap gap-1">
        {chip('all', 'All', counts.all)}
        {CHIPS.filter((id) => counts[id] > 0).map((id) => chip(id, HEALTH_COLORS[id].label, counts[id]))}
      </div>

      <div className="flex items-center gap-2 px-1 text-xs text-ink-2">
        <label htmlFor="parcel-district">District</label>
        <select
          id="parcel-district"
          value={district}
          onChange={(event) => setDistrict(event.target.value)}
          className="min-w-0 flex-1 rounded-md border border-line bg-surface px-1.5 py-1 text-xs text-ink focus:border-accent focus:outline-none"
        >
          <option value="">All districts</option>
          {districts.map((label) => (
            <option key={label} value={label}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {groups.length === 0 ? (
        <p className="px-1 text-sm text-ink-2">No areas match.</p>
      ) : (
        <div className="-mx-1 min-h-0 flex-1 space-y-1 overflow-y-auto px-1">
          {groups.map(({ label, rows }) => {
            const open = !folded.has(label)
            return (
              <section key={label}>
                <button
                  type="button"
                  aria-expanded={open}
                  aria-label={`${open ? 'Hide' : 'Show'} ${label} (${rows.length})`}
                  onClick={() => toggleGroup(label)}
                  className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs font-semibold text-ink-2 hover:text-ink"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}>
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                  <span className="flex-1 truncate">{label}</span>
                  <span style={tabular}>{rows.length}</span>
                </button>
                {open && (
                  <ul className="space-y-px">
                    {rows.map(({ parcel, health: verdict }) => {
                      const selected = parcel.upi === selectedUpi
                      const date = typeof parcel.latestDate === 'number' ? formatDate(parcel.latestDate) : null
                      const title = [HEALTH_COLORS[verdict].label, date && `latest clear view ${date}`].filter(Boolean).join(' · ')
                      return (
                        <li key={parcel.upi}>
                          <button
                            type="button"
                            aria-current={selected ? 'true' : undefined}
                            title={title}
                            onClick={() => onSelect(parcel.upi)}
                            className={`flex w-full min-w-0 items-center gap-2 rounded-lg py-1.5 pl-4 pr-2.5 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                              selected ? 'bg-accent/10 ring-1 ring-accent/30' : 'hover:bg-raised'
                            }`}
                          >
                            <Dot health={verdict} />
                            <span data-testid="upi" className="truncate text-[0.8125rem] font-semibold" style={tabular}>
                              {parcel.upi}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      )}

      {truncated && (
        <p className="px-1 text-xs text-ink-2">{`Showing the first ${parcels.length} areas. Search by UPI to open any other.`}</p>
      )}
    </div>
  )
}
