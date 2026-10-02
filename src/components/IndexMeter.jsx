import { useMemo, useState } from 'react'
import { formatIndex } from '../lib/format.js'
import { locate, parseThresholds } from '../lib/thresholds.js'

function Scale({ code, bands, spot, color }) {
  const name =
    `${code} scale: ${bands.map((band) => band.label).join(', ')}.` +
    (spot ? ` This parcel: ${bands[spot.index].label}.` : '')
  return (
    <div role="img" aria-label={name} className="pt-1">
      <div className="relative">
        <div className="flex gap-0.5">
          {bands.map((band, i) => {
            const active = spot?.index === i
            return (
              <span
                key={band.label}
                data-testid="band"
                data-active={active}
                title={band.label}
                className="h-2 flex-1 bg-ink/15 first:rounded-l-full last:rounded-r-full"
                style={active ? { backgroundColor: color } : undefined}
              />
            )
          })}
        </div>
        {spot && (
          <span
            data-testid="marker"
            className="absolute -top-1 h-4 w-1.5 -translate-x-1/2 rounded-full bg-ink ring-2 ring-surface"
            style={{ left: `${spot.position * 100}%` }}
          />
        )}
      </div>
      {/* The numbers sit under the joins between bands. */}
      <div className="relative mt-1 h-4 text-[11px] text-ink-2" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {bands.slice(0, -1).map((band, i) => (
          <span
            key={band.to}
            className="absolute -translate-x-1/2"
            style={{ left: `${((i + 1) / bands.length) * 100}%` }}
          >
            {String(band.to)}
          </span>
        ))}
      </div>
    </div>
  )
}

function Note({ code, entry, guide }) {
  if (!entry) {
    let message = `No explanation is available for ${code}.`
    if (guide.error) message = 'The explanation could not be loaded.'
    else if (!guide.entries) message = 'Loading the explanation…'
    return <p className="rounded-lg bg-raised/60 p-3 text-sm text-ink-2">{message}</p>
  }
  const formula = [entry.formula, entry.bands].filter(Boolean).join(' · ')
  return (
    <div className="space-y-2 rounded-lg bg-raised/60 p-3 text-sm">
      {entry.name && <p className="font-display text-xs font-semibold uppercase tracking-wide text-ink-2">{entry.name}</p>}
      {entry.meaning && <p>{entry.meaning}</p>}
      {entry.howToRead && <p className="text-ink-2">{entry.howToRead}</p>}
      {entry.caveats && <p className="text-ink-2">{entry.caveats}</p>}
      {formula && <p className="text-xs text-ink-2">{formula}</p>}
      {entry.reference && <p className="text-xs text-ink-2">{entry.reference}</p>}
    </div>
  )
}

/**
 * One index: its value, where that value sits on the guide's scale, the level
 * the layer gives it, and an explanation that opens in place.
 */
export default function IndexMeter({ code, hint, value, level, color, guide }) {
  const [open, setOpen] = useState(false)
  const entry = guide.entries?.find((item) => item.code === code) ?? null
  const bands = useMemo(() => parseThresholds(entry?.thresholds), [entry])
  const hasValue = typeof value === 'number' && Number.isFinite(value)

  return (
    <section aria-label={code} className="space-y-1.5">
      <div className="flex items-end justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          <h3 className="font-display text-sm font-semibold">{code}</h3>
          <span className="truncate text-xs text-ink-2">{hint}</span>
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            aria-label={`About ${code}`}
            aria-expanded={open}
            className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-line text-[11px] text-ink-2 transition hover:bg-raised hover:text-ink"
          >
            i
          </button>
        </div>
        <p className="font-display text-2xl font-semibold leading-none" data-testid={`${code}-value`}>
          {formatIndex(value)}
        </p>
      </div>

      {bands && <Scale code={code} bands={bands} spot={locate(bands, value)} color={color} />}

      <p className="min-h-5 text-sm font-medium" data-testid={`${code}-level`}>
        {hasValue && level ? level : null}
      </p>

      {open && <Note code={code} entry={entry} guide={guide} />}
    </section>
  )
}
