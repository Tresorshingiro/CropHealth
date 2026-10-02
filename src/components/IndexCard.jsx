import { formatIndex } from '../lib/format.js'

export default function IndexCard({ code, hint, value, level, color, onInfo }) {
  const hasValue = typeof value === 'number' && Number.isFinite(value)
  return (
    <div className="relative overflow-hidden rounded-lg border border-line bg-page p-3">
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: color }} />
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold tracking-wide">{code}</h3>
          <p className="text-xs text-ink-2">{hint}</p>
        </div>
        <button
          type="button"
          onClick={() => onInfo(code)}
          aria-label={`About ${code}`}
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-line text-xs text-ink-2 hover:bg-raised hover:text-ink"
        >
          i
        </button>
      </div>
      <p className="mt-2 text-2xl font-semibold" data-testid={`${code}-value`}>
        {formatIndex(value)}
      </p>
      <p className="min-h-5 text-sm text-ink-2" data-testid={`${code}-level`}>
        {hasValue && level ? level : null}
      </p>
    </div>
  )
}
