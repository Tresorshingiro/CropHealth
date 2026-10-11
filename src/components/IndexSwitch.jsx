import { SERIES } from '../theme/palette.js'

/** NDVI / NDMI / NDRE as one segmented control. */
export default function IndexSwitch({ value, onChange, label = 'Index', className = '' }) {
  return (
    <div role="group" aria-label={label} className={`inline-flex rounded-full border border-line p-0.5 ${className}`}>
      {SERIES.map((s) => (
        <button
          key={s.key}
          type="button"
          aria-pressed={value === s.key}
          onClick={() => onChange(s.key)}
          className={`rounded-full px-3 py-1 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
            value === s.key ? 'bg-accent text-accent-ink' : 'text-ink-2 hover:text-ink'
          }`}
        >
          {s.code}
        </button>
      ))}
    </div>
  )
}
