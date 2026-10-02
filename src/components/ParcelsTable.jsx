import { useMemo, useState } from 'react'

const COLUMNS = [
  { key: 'upi', label: 'UPI' },
  { key: 'district', label: 'District' },
  { key: 'ndviLevel', label: 'NDVI level' },
]

export default function ParcelsTable({ status, parcels, truncated, selectedUpi, error, onSelect, onRetry }) {
  const [sort, setSort] = useState({ key: 'upi', dir: 'asc' })
  const [filter, setFilter] = useState('')

  const rows = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    const factor = sort.dir === 'asc' ? 1 : -1
    return parcels
      .filter(
        (parcel) =>
          !needle ||
          COLUMNS.some((col) => String(parcel[col.key] ?? '').toLowerCase().includes(needle)),
      )
      .sort(
        (a, b) => factor * String(a[sort.key] ?? '').localeCompare(String(b[sort.key] ?? ''), 'en', { numeric: true }),
      )
  }, [parcels, sort, filter])

  const toggleSort = (key) =>
    setSort((current) => ({ key, dir: current.key === key && current.dir === 'asc' ? 'desc' : 'asc' }))

  if (status === 'loading') {
    return (
      <p role="status" className="text-sm text-ink-2">
        Loading parcels…
      </p>
    )
  }
  if (status === 'error') {
    return (
      <div>
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
        <button type="button" className="btn-ghost mt-3" onClick={onRetry}>
          Retry
        </button>
      </div>
    )
  }
  if (parcels.length === 0) return <p className="text-sm text-ink-2">No analysed parcels yet.</p>

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div>
        <label htmlFor="parcel-filter" className="sr-only">
          Filter parcels
        </label>
        <input
          id="parcel-filter"
          type="search"
          className="field"
          placeholder="Filter by UPI, district or level"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-ink-2">No parcels match.</p>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
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
                  <tr
                    key={parcel.upi}
                    aria-current={selected ? 'true' : undefined}
                    onClick={() => onSelect(parcel.upi)}
                    className={`cursor-pointer ${selected ? 'bg-accent/10' : 'hover:bg-raised/60'}`}
                  >
                    <td className="py-2 pr-3 font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {/* The button is for keyboard use; its click reaches the row's handler. */}
                      <button type="button" className="text-left hover:underline">
                        {parcel.upi}
                      </button>
                    </td>
                    <td className="py-2 pr-3">{parcel.district ?? '–'}</td>
                    <td className="py-2 pr-3 text-ink-2">{parcel.ndviLevel ?? '–'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {truncated && (
        <p className="text-xs text-ink-2">
          {`Showing the first ${parcels.length} parcels. Search by UPI to open any other.`}
        </p>
      )}
    </div>
  )
}
