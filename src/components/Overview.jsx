import { useMemo } from 'react'
import { formatDate } from '../lib/format.js'

const Stat = ({ label, children }) => (
  <div className="panel flex flex-col justify-between gap-3 p-5">
    <p className="text-xs text-ink-2">{label}</p>
    <p className="font-display text-3xl font-semibold leading-none tracking-tight">{children}</p>
  </div>
)

/** What the layer holds, shown when no parcel is open. Counts only; no judgement of the values. */
export default function Overview({ status, parcels, truncated }) {
  const summary = useMemo(() => {
    const districts = new Set(parcels.map((parcel) => parcel.district).filter(Boolean))
    const dates = parcels.map((parcel) => parcel.latestDate).filter((date) => typeof date === 'number')
    const counts = new Map()
    let unplaced = 0
    for (const parcel of parcels) {
      if (parcel.district) counts.set(parcel.district, (counts.get(parcel.district) || 0) + 1)
      else unplaced += 1
    }
    const byDistrict = [...counts]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    if (unplaced) byDistrict.push({ label: 'No district', count: unplaced })
    return {
      districts: districts.size,
      latest: dates.length ? Math.max(...dates) : null,
      byDistrict,
      most: Math.max(0, ...byDistrict.map((row) => row.count)),
    }
  }, [parcels])

  const known = status === 'ready'

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Overview</h1>
        <p className="mt-1 text-sm text-ink-2">Search a UPI, pick a parcel on the map, or choose one from the list.</p>
      </div>

      {status === 'loading' ? (
        <div role="status" aria-label="Loading overview" className="grid animate-pulse gap-4 motion-reduce:animate-none sm:grid-cols-3">
          <div className="h-20 rounded-2xl bg-raised" />
          <div className="h-20 rounded-2xl bg-raised" />
          <div className="h-20 rounded-2xl bg-raised" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Parcels analysed">{known ? parcels.length : '–'}</Stat>
            <Stat label="Districts">{known ? summary.districts : '–'}</Stat>
            <Stat label="Latest clear view">{formatDate(summary.latest)}</Stat>
            {truncated && (
              <p className="text-xs text-ink-2 sm:col-span-3">{`Counts cover the first ${parcels.length} parcels.`}</p>
            )}
          </div>

          {summary.byDistrict.length > 0 && (
            <div className="panel p-5">
              <p id="districts-title" className="text-xs text-ink-2">
                Parcels by district
              </p>
              <ul aria-labelledby="districts-title" className="mt-3 space-y-2.5">
                {summary.byDistrict.map(({ label, count }) => (
                  <li key={label} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_2rem] items-center gap-3 text-sm">
                    <span className="truncate">{label}</span>
                    <span aria-hidden="true" className="h-2 rounded-full bg-ink/10">
                      <span
                        className="block h-2 rounded-full bg-accent"
                        style={{ width: `${(count / summary.most) * 100}%` }}
                      />
                    </span>
                    <span className="text-right font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {count}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
