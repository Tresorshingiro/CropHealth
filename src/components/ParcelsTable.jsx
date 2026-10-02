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
                  <tr
                    key={parcel.upi}
                    aria-current={selected ? 'true' : undefined}
                    onClick={() => onSelect(parcel.upi)}
                    className={`cursor-pointer ${selected ? 'bg-raised' : 'hover:bg-raised/60'}`}
                  >
                    <td className="py-1.5 pr-3" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {/* The button is for keyboard use; its click reaches the row's handler. */}
                      <button type="button" className="text-left hover:underline">
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
