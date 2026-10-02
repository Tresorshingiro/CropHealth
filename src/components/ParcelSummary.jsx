import { formatDate, formatHectares } from '../lib/format.js'
import { CHART_COLORS, SERIES } from '../theme/palette.js'
import { useTheme } from '../theme/ThemeContext.jsx'
import IndexMeter from './IndexMeter.jsx'

const Message = ({ children }) => <p className="text-sm text-ink-2">{children}</p>

const Fact = ({ label, children }) => (
  <div className="rounded-xl bg-ink/5 px-3 py-2">
    <dt className="text-xs text-ink-2">{label}</dt>
    <dd className="text-sm font-medium">{children}</dd>
  </div>
)

export default function ParcelSummary({ status, parcel, error, onRetry, guide }) {
  const { theme } = useTheme()
  const colors = CHART_COLORS[theme]

  if (status === 'not-found') return <Message>This parcel has not been analysed yet.</Message>
  if (status === 'loading') {
    return (
      <div role="status" aria-label="Loading parcel" className="animate-pulse space-y-4 motion-reduce:animate-none">
        <div className="h-7 w-2/3 rounded bg-raised" />
        <div className="h-4 w-1/2 rounded bg-raised" />
        <div className="h-14 rounded-lg bg-raised" />
        <div className="h-14 rounded-lg bg-raised" />
        <div className="h-14 rounded-lg bg-raised" />
      </div>
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
  if (status !== 'ready') return null

  const place = [parcel.sector, parcel.cell, parcel.village].filter(Boolean).join(' · ')

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-xl font-semibold tracking-tight">{parcel.upi}</h2>
          {parcel.district && (
            <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-semibold text-accent">
              {parcel.district}
            </span>
          )}
        </div>
        {place && <p className="mt-0.5 text-sm text-ink-2">{place}</p>}
      </div>

      {parcel.headline && <p className="text-[15px] leading-relaxed">{parcel.headline}</p>}

      <div className="space-y-4">
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

      <dl className="grid grid-cols-2 gap-2">
        <Fact label="Latest clear view">{formatDate(parcel.latestDate)}</Fact>
        <Fact label="Area">{formatHectares(parcel.areaM2)}</Fact>
        <Fact label="Reliability">{parcel.reliability ?? '–'}</Fact>
        <Fact label="Clear dates">{parcel.usableDates ?? '–'}</Fact>
      </dl>
    </div>
  )
}
