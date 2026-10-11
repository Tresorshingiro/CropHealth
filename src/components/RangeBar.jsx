import { endOfDay, formatDay, parseDay, PRESETS, presetOf, presetRange, startOfDay } from '../lib/range.js'

/**
 * The period the report covers: presets for the common cases, and From / To
 * date fields for an exact period. A preset fills the fields; a field left
 * empty means all dates.
 */
export default function RangeBar({ range, onChange, now = Date.now() }) {
  const active = presetOf(range, now)
  const today = formatDay(now)

  const setEnd = (end, text) => {
    const day = parseDay(text)
    if (day === null) {
      onChange(null)
      return
    }
    // From all dates, the other end defaults to today, or to a year before the chosen end.
    let from = end === 'from' ? day : (range?.from ?? presetRange('12m', day).from)
    let to = end === 'to' ? endOfDay(day) : (range?.to ?? endOfDay(now))
    if (from > to) [from, to] = [startOfDay(to), endOfDay(from)]
    onChange({ from, to })
  }

  const field = (end, label, value) => (
    <label className="flex items-center gap-2 text-sm text-ink-2">
      {label}
      <input
        type="date"
        value={value}
        max={today}
        onChange={(event) => setEnd(end, event.target.value)}
        className="rounded-lg border border-line bg-page px-2 py-1 text-sm text-ink focus:border-accent focus:outline-none"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      />
    </label>
  )

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div role="group" aria-label="Period" className="flex flex-wrap gap-1">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            aria-pressed={active === preset.id}
            onClick={() => onChange(presetRange(preset.id, now))}
            className={`btn-ghost ${active === preset.id ? 'bg-raised text-ink' : ''}`}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {field('from', 'From', range ? formatDay(range.from) : '')}
        {field('to', 'To', range ? formatDay(range.to) : '')}
        {range && (
          <button type="button" className="btn-ghost" onClick={() => onChange(null)}>
            Reset
          </button>
        )}
      </div>
    </div>
  )
}
