import { useMemo, useState } from 'react'
import { formatDate } from '../lib/format.js'

const byText = (key) => (a, b) => a[key].localeCompare(b[key], 'en', { numeric: true })

// Each sort compares two parcels that both have the field; parcels without it
// go last whichever way the list runs.
const SORTS = [
  { key: 'upi', label: 'UPI', compare: byText('upi') },
  { key: 'district', label: 'District', compare: byText('district') },
  { key: 'latestDate', label: 'Latest clear view', compare: (a, b) => b.latestDate - a.latestDate },
]
const FILTERED = ['upi', 'district']

/** The analysed parcels as a filterable, sortable list for the sidebar. */
export default function ParcelList({ status, parcels, truncated, selectedUpi, error, onSelect, onRetry }) {
  const [sortKey, setSortKey] = useState('upi')
  const [reversed, setReversed] = useState(false)
  const [filter, setFilter] = useState('')

  const rows = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    const factor = reversed ? -1 : 1
    const { compare } = SORTS.find((sort) => sort.key === sortKey)
    const missing = (parcel) => parcel[sortKey] === null || parcel[sortKey] === undefined || parcel[sortKey] === ''
    return parcels
      .filter(
        (parcel) =>
          !needle || FILTERED.some((key) => String(parcel[key] ?? '').toLowerCase().includes(needle)),
      )
      .sort((a, b) => missing(a) - missing(b) || (missing(a) ? 0 : factor * compare(a, b)))
  }, [parcels, sortKey, reversed, filter])

  if (status === 'loading') {
    return (
      <p role="status" className="px-1 text-sm text-ink-2">
        Loading parcels…
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
  if (parcels.length === 0) return <p className="px-1 text-sm text-ink-2">No analysed parcels yet.</p>

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div>
        <label htmlFor="parcel-filter" className="sr-only">
          Filter parcels
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

      <div className="flex items-center justify-between gap-2 px-1 text-xs text-ink-2">
        <label htmlFor="parcel-sort">Sort parcels by</label>
        <div className="flex items-center gap-1">
          <select
            id="parcel-sort"
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value)}
            className="rounded-md border border-line bg-surface px-1.5 py-1 text-xs text-ink focus:border-accent focus:outline-none"
          >
            {SORTS.map(({ key, label }) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-label="Reverse order"
            aria-pressed={reversed}
            onClick={() => setReversed((current) => !current)}
            className={`grid h-6 w-6 place-items-center rounded-md border border-line hover:bg-raised hover:text-ink ${
              reversed ? 'bg-raised text-ink' : ''
            }`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4" />
            </svg>
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="px-1 text-sm text-ink-2">No parcels match.</p>
      ) : (
        <ul className="-mx-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1">
          {rows.map((parcel) => {
            const selected = parcel.upi === selectedUpi
            const date = typeof parcel.latestDate === 'number' ? formatDate(parcel.latestDate) : null
            const detail = [parcel.district, date].filter(Boolean).join(' · ')
            return (
              <li key={parcel.upi}>
                <button
                  type="button"
                  aria-current={selected ? 'true' : undefined}
                  onClick={() => onSelect(parcel.upi)}
                  className={`w-full rounded-xl px-3 py-2 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                    selected ? 'bg-accent/10 ring-1 ring-accent/30' : 'hover:bg-raised'
                  }`}
                >
                  <span data-testid="upi" className="block text-sm font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {parcel.upi}
                  </span>
                  {detail && (
                    <span data-testid="detail" className="block truncate text-xs text-ink-2">
                      {detail}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {truncated && (
        <p className="px-1 text-xs text-ink-2">
          {`Showing the first ${parcels.length} parcels. Search by UPI to open any other.`}
        </p>
      )}
    </div>
  )
}
