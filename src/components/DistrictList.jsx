import { useMemo } from 'react'
import { districtHealth } from '../lib/health.js'
import { HEALTH_COLORS, HEALTH_ORDER } from '../lib/mapLayers.js'

const tabular = { fontVariantNumeric: 'tabular-nums' }
// Worst first along each bar, as in the overview's district chart.
const STACK = ['poor', 'moderate', 'good', 'unrated']
const RECENT_LIMIT = 5

const rowButton =
  'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent'

/** One district's parcels as a bar: as long as its share of the largest district, split by health. */
function Bar({ counts, most, name }) {
  const label = HEALTH_ORDER.map((key) => `${HEALTH_COLORS[key].label} ${counts[key]}`).join(', ')
  return (
    <span className="h-1.5 min-w-0 flex-1 rounded-full bg-ink/10">
      <span
        role="img"
        aria-label={`${name}: ${label}`}
        className="flex h-full gap-px overflow-hidden rounded-full"
        style={{ width: `${(counts.total / most) * 100}%` }}
      >
        {STACK.filter((key) => counts[key]).map((key) => (
          <span key={key} style={{ flex: `${counts[key]} 1 0`, backgroundColor: HEALTH_COLORS[key].css }} />
        ))}
      </span>
    </span>
  )
}

/**
 * The sidebar: the districts with areas of interest, each with its health
 * split, and the parcels opened last. A district narrows the overview and the
 * map to it; picking it again, or "All districts", shows them all.
 */
export default function DistrictList({
  status,
  parcels,
  error,
  onRetry,
  guide = null,
  district = null,
  onDistrict,
  recent = [],
  selectedUpi = null,
  onSelect,
}) {
  const rows = useMemo(() => districtHealth(parcels, guide), [parcels, guide])
  const most = Math.max(1, ...rows.map((row) => row.counts.total))
  const shownRecent = recent.slice(0, RECENT_LIMIT)

  let districts
  if (status === 'loading') {
    districts = (
      <p role="status" className="px-2 text-sm text-ink-2">
        Loading areas…
      </p>
    )
  } else if (status === 'error') {
    districts = (
      <div role="alert" className="px-2">
        <p className="text-sm text-danger">{error}</p>
        <button type="button" className="btn-ghost mt-3" onClick={onRetry}>
          Retry
        </button>
      </div>
    )
  } else if (rows.length === 0) {
    districts = <p className="px-2 text-sm text-ink-2">No areas of interest yet.</p>
  } else {
    districts = (
      <ul aria-labelledby="districts-heading" className="space-y-0.5">
        <li>
          <button
            type="button"
            aria-pressed={district === null}
            onClick={() => onDistrict(null)}
            className={`${rowButton} ${district === null ? 'bg-raised font-semibold' : 'text-ink-2'}`}
          >
            <span className="flex-1">All districts</span>
            <span className="text-xs" style={tabular}>
              {parcels.length}
            </span>
          </button>
        </li>
        {rows.map(({ label, counts }) => {
          const on = district === label
          return (
            <li key={label}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onDistrict(on ? null : label)}
                className={`${rowButton} ${on ? 'bg-raised' : ''}`}
              >
                <span className={`w-24 shrink-0 truncate ${on ? 'font-semibold' : ''}`} title={label}>
                  {label}
                </span>
                <Bar counts={counts} most={most} name={label} />
                <span className="w-5 shrink-0 text-right text-xs font-medium" style={tabular}>
                  {counts.total}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      <section className="space-y-1.5">
        <div className="flex items-baseline justify-between px-2">
          <h2 id="districts-heading" className="font-display text-sm font-semibold">
            Districts
          </h2>
          {status === 'ready' && rows.length > 0 && (
            <span className="text-xs text-ink-2" style={tabular}>
              {rows.length}
            </span>
          )}
        </div>
        {districts}
      </section>

      {shownRecent.length > 0 && (
        <section className="space-y-1.5">
          <h2 id="recent-heading" className="px-2 font-display text-sm font-semibold">
            Recent
          </h2>
          <ul aria-labelledby="recent-heading" className="space-y-0.5">
            {shownRecent.map((upi) => (
              <li key={upi}>
                <button
                  type="button"
                  aria-current={upi === selectedUpi ? 'true' : undefined}
                  onClick={() => onSelect(upi)}
                  className={`${rowButton} truncate font-medium ${upi === selectedUpi ? 'bg-raised' : ''}`}
                  style={tabular}
                >
                  <span className="truncate">{upi}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
