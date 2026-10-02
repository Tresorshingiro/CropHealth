import { formatDate, formatHectares } from '../lib/format.js'
import { CHART_COLORS, SERIES } from '../theme/palette.js'
import { useTheme } from '../theme/ThemeContext.jsx'
import IndexCard from './IndexCard.jsx'

const Message = ({ children }) => <p className="p-4 text-sm text-ink-2">{children}</p>

const Fact = ({ label, children }) => (
  <div className="flex justify-between gap-4 py-1.5">
    <dt className="text-ink-2">{label}</dt>
    <dd className="text-right font-medium">{children}</dd>
  </div>
)

export default function ParcelSummary({ status, parcel, error, onRetry, onOpenGuide }) {
  const { theme } = useTheme()
  const colors = CHART_COLORS[theme]

  if (status === 'idle') return <Message>Enter a UPI and press Run to see its analysis.</Message>
  if (status === 'not-found') return <Message>This parcel has not been analysed yet.</Message>
  if (status === 'loading') {
    return (
      <div role="status" aria-label="Loading parcel" className="animate-pulse space-y-3 p-4">
        <div className="h-5 w-2/3 rounded bg-raised" />
        <div className="h-4 w-1/2 rounded bg-raised" />
        <div className="grid grid-cols-3 gap-2">
          <div className="h-24 rounded-lg bg-raised" />
          <div className="h-24 rounded-lg bg-raised" />
          <div className="h-24 rounded-lg bg-raised" />
        </div>
        <div className="h-20 rounded bg-raised" />
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div className="p-4">
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
        <button type="button" className="btn-ghost mt-3" onClick={onRetry}>
          Retry
        </button>
      </div>
    )
  }

  const title = parcel.district ? `${parcel.upi} · ${parcel.district}` : parcel.upi
  const place = [parcel.sector, parcel.cell, parcel.village].filter(Boolean).join(' · ')

  return (
    <div className="space-y-4 p-4">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {place && <p className="text-sm text-ink-2">{place}</p>}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {SERIES.map((s) => (
          <IndexCard
            key={s.key}
            code={s.code}
            hint={s.hint}
            value={parcel[s.key]}
            level={parcel[`${s.key}Level`]}
            color={colors[s.key]}
            onInfo={onOpenGuide}
          />
        ))}
      </div>

      <dl className="divide-y divide-line text-sm">
        <Fact label="Latest clear view">{formatDate(parcel.latestDate)}</Fact>
        <Fact label="Area">{formatHectares(parcel.areaM2)}</Fact>
        <Fact label="Reliability">{parcel.reliability ?? '–'}</Fact>
        <Fact label="Clear dates">{parcel.usableDates ?? '–'}</Fact>
      </dl>

      {parcel.headline && <p className="text-sm text-ink-2">{parcel.headline}</p>}
    </div>
  )
}
