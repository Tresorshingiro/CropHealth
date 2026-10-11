import { useMemo, useState } from 'react'
import { sentence } from '../lib/explain.js'
import { formatIndex } from '../lib/format.js'
import { locate, parseThresholds } from '../lib/thresholds.js'
import { verdictForBand, verdictOf } from '../lib/verdict.js'
import RingGauge from './RingGauge.jsx'
import Verdict, { VERDICT_STROKE } from './Verdict.jsx'

function Note({ code, entry, guide }) {
  if (!entry) {
    let message = `No explanation is available for ${code}.`
    if (guide.error) message = 'The explanation could not be loaded.'
    else if (!guide.entries) message = 'Loading the explanation…'
    return <p className="rounded-2xl bg-surface/70 p-3 text-sm text-ink-2">{message}</p>
  }
  const formula = [entry.formula, entry.bands].filter(Boolean).join(' · ')
  return (
    <div className="space-y-2 rounded-2xl bg-surface/70 p-3 text-sm">
      {entry.name && <p className="font-display text-xs font-semibold uppercase tracking-wide text-ink-2">{entry.name}</p>}
      {entry.meaning && <p>{entry.meaning}</p>}
      {entry.howToRead && <p className="text-ink-2">{entry.howToRead}</p>}
      {entry.caveats && <p className="text-ink-2">{entry.caveats}</p>}
      {formula && <p className="text-xs text-ink-2">{formula}</p>}
      {entry.reference && <p className="text-xs text-ink-2">{entry.reference}</p>}
    </div>
  )
}

function Average({ code, average, bands }) {
  if (!average) return null
  const verdict = average.count > 0 ? verdictOf(bands, average.mean) : null
  return (
    // mt-auto: at the card's foot when the card is taller than its content (beside the map).
    <p data-testid={`${code}-average`} className="mt-auto border-t border-line/60 pt-2 text-xs text-ink-2">
      {average.count > 0 ? `Period average ${formatIndex(average.mean)}` : 'No clear dates in this period'}
      {verdict && (
        <>
          {' · '}
          <Verdict verdict={verdict} />
        </>
      )}
    </p>
  )
}

/**
 * One index, compact: the latest value in a ring that shows where it sits on
 * the GIS team's scale, the verdict that place gives it and what it means,
 * the layer's own level, the period average, and an explanation that opens
 * in place. `average` is `{ mean, count }`, or null while the history loads.
 */
export default function IndexMeter({ indexKey, code, hint, value, level, color, guide, average = null }) {
  const [open, setOpen] = useState(false)
  const entry = guide.entries?.find((item) => item.code === code) ?? null
  const bands = useMemo(() => parseThresholds(entry?.thresholds), [entry])
  const spot = locate(bands, value)
  const verdict = spot ? verdictForBand(spot.index, bands.length) : null
  const hasValue = typeof value === 'number' && Number.isFinite(value)
  const label = bands
    ? `${code} scale: ${bands.map((band) => band.label).join(', ')}.` + (spot ? ` This parcel: ${bands[spot.index].label}.` : '')
    : null

  return (
    // Tinted with the index's colour, as its tile in the season cards and the map card. Beside the map the
    // three cards share its height (IndexCards): one that runs out of room scrolls inside, never past the map.
    <section
      aria-label={code}
      className="card flex min-h-0 flex-col gap-2.5 overflow-y-auto p-3.5 lg:flex-1"
      style={{ backgroundColor: `${color}26` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
          </span>
          <div className="min-w-0 leading-tight">
            <h3 className="font-display text-sm font-semibold">{code}</h3>
            <p className="truncate text-xs text-ink-2">{hint}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-label={`About ${code}`}
          aria-expanded={open}
          className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border border-line text-xs transition hover:bg-surface hover:text-ink ${
            open ? 'bg-surface text-ink' : 'text-ink-2'
          }`}
        >
          i
        </button>
      </div>

      <div className="flex items-center gap-3">
        {/* The arc wears the status colour (Good green, Moderate yellow, Poor red), like the word beside it. */}
        <RingGauge
          value={value}
          position={spot?.position ?? null}
          color={color}
          arcClass={verdict ? VERDICT_STROKE[verdict] : ''}
          label={label}
          testId={`${code}-value`}
        />
        <div className="min-w-0 space-y-0.5">
          <Verdict verdict={verdict} testId={`${code}-verdict`} className="text-sm" />
          {verdict && <p className="text-xs leading-snug text-ink-2">{sentence(indexKey, verdict)}</p>}
          <p data-testid={`${code}-level`} className="text-[0.6875rem] text-ink-2">
            {hasValue && level ? `GIS level: ${level}` : null}
          </p>
        </div>
      </div>

      <Average code={code} average={average} bands={bands} />
      {open && <Note code={code} entry={entry} guide={guide} />}
    </section>
  )
}
