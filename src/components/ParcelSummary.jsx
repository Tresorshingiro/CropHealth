import { formatDate, formatHectares } from '../lib/format.js'
import { isAreaId } from '../lib/upi.js'
import { CHART_COLORS, SERIES } from '../theme/palette.js'
import { useTheme } from '../theme/ThemeContext.jsx'
import IndexMeter from './IndexMeter.jsx'

const Notice = ({ children }) => <div className="panel p-6">{children}</div>

const Fact = ({ label, children }) => (
  <div>
    <dt className="text-xs text-ink-2">{label}</dt>
    <dd className="mt-0.5 text-sm font-semibold">{children}</dd>
  </div>
)

/** The head of a parcel's report: who it is, what the layer says about it, and its three indices. */
export default function ParcelSummary({ status, parcel, error, onRetry, guide }) {
  const { theme } = useTheme()
  const colors = CHART_COLORS[theme]

  if (status === 'not-found') {
    return (
      <Notice>
        <p className="text-sm text-ink-2">This parcel has not been analysed yet.</p>
      </Notice>
    )
  }
  if (status === 'loading') {
    return (
      <div role="status" aria-label="Loading parcel" className="animate-pulse space-y-5 motion-reduce:animate-none">
        <div className="space-y-2">
          <div className="h-9 w-72 max-w-full rounded-lg bg-raised" />
          <div className="h-4 w-52 max-w-full rounded bg-raised" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="h-40 rounded-2xl bg-raised" />
          <div className="h-40 rounded-2xl bg-raised" />
          <div className="h-40 rounded-2xl bg-raised" />
        </div>
      </div>
    )
  }
  if (status === 'error') {
    return (
      <Notice>
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
        <button type="button" className="btn-ghost mt-3" onClick={onRetry}>
          Retry
        </button>
      </Notice>
    )
  }
  if (status !== 'ready') return null

  const place = [parcel.sector, parcel.cell, parcel.village].filter(Boolean).join(' · ')

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-3xl font-semibold tracking-tight">{parcel.upi}</h2>
            {parcel.district && (
              <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
                {parcel.district}
              </span>
            )}
            {isAreaId(parcel.upi) && (
              <span className="rounded-full border border-line px-3 py-1 text-xs font-medium text-ink-2">
                Drawn field
              </span>
            )}
          </div>
          {place && <p className="mt-1 text-sm text-ink-2">{place}</p>}
        </div>

        <dl className="flex flex-wrap gap-x-8 gap-y-3">
          <Fact label="Latest clear view">{formatDate(parcel.latestDate)}</Fact>
          <Fact label="Area">{formatHectares(parcel.areaM2)}</Fact>
          {/* The analysis tool writes no reliability, so a re-analysed parcel has none. */}
          {parcel.reliability && <Fact label="Reliability">{parcel.reliability}</Fact>}
          <Fact label="Clear dates">{parcel.usableDates ?? '–'}</Fact>
        </dl>
      </div>

      {parcel.headline && (
        <p className="max-w-3xl border-l-2 border-accent pl-4 text-[15px] leading-relaxed">{parcel.headline}</p>
      )}

      <div className="grid items-start gap-4 md:grid-cols-3">
        {SERIES.map((s) => (
          <IndexMeter
            key={s.key}
            code={s.code}
            hint={s.hint}
            value={parcel[s.key]}
            level={parcel[`${s.key}Level`]}
            color={colors[s.key]}
            guide={guide}
          />
        ))}
      </div>
    </div>
  )
}
