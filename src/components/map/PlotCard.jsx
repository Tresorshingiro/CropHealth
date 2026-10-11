import { formatHectares, formatIndex, formatScene } from '../../lib/format.js'
import { guideBands, verdictOf } from '../../lib/verdict.js'
import { CHART_COLORS, SERIES } from '../../theme/palette.js'
import { useTheme } from '../../theme/ThemeContext.jsx'
import Verdict from '../Verdict.jsx'

export const SCENE_TEXT = {
  loading: 'Finding the clearest image…',
  none: 'No Sentinel-2 image of this plot in the chosen period',
  error: 'Satellite image unavailable',
}

/**
 * Whether a selection gets the map card: only a quick look or a drawn field,
 * which have no report. An analysed plot's values are in its index cards.
 */
export const hasCard = (parcel) => Boolean(parcel?.quick)

const QUICK_TEXT = {
  loading: 'Measuring the field…',
  failed: 'The field could not be measured.',
}

const Glyph = ({ d }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
)

/**
 * Running the GIS team's analysis for a field that has none: it writes the
 * field into the feature service, which then gives it a full report.
 * `status`: idle, running, succeeded, failed, or busy (another field's run).
 * A drawn field also carries its `name` (required), whether it is `valid`,
 * and whether a field of that name `exists` already.
 */
function Analyse({ status, message, onStart, name, onNameChange, valid = true, exists = false }) {
  if (status === 'running' || status === 'succeeded') {
    return (
      <p role="status" className="mt-3 rounded-xl bg-raised/70 px-2.5 py-2 text-xs text-ink-2">
        {status === 'running' ? 'Analysing this field… about a minute' : 'Analysed. Opening its report…'}
      </p>
    )
  }
  const named = name !== undefined
  let label = 'Analyse this field'
  if (status === 'failed') label = 'Try again'
  else if (exists) label = 'Replace and analyse'
  return (
    <div className="mt-3 space-y-1.5">
      {named && (
        <div className="space-y-1">
          <label htmlFor="field-name" className="text-xs font-medium">
            Name
          </label>
          <input
            id="field-name"
            className="field py-1.5"
            value={name}
            maxLength={26}
            autoComplete="off"
            onChange={(event) => onNameChange(event.target.value)}
          />
          {!valid && <p className="text-xs text-ink-2">Letters, digits, spaces, _ and -, up to 26 characters.</p>}
          {valid && exists && <p className="text-xs text-danger">A field with this name exists. Analysing replaces it.</p>}
        </div>
      )}
      {status === 'failed' && (
        <p role="alert" className="text-xs text-danger">
          {message}
        </p>
      )}
      <button
        type="button"
        className="btn-primary w-full rounded-xl py-1.5"
        disabled={status === 'busy' || !valid}
        onClick={onStart}
      >
        {label}
      </button>
      <p className="text-xs text-ink-2">
        {status === 'busy' ? 'Another field is being analysed.' : 'A full report with 14 months of history takes about a minute.'}
      </p>
    </div>
  )
}

/**
 * The selected plot's latest readings, docked in a corner of the map so the
 * plot itself stays in view. A land parcel or drawn field that has not been
 * analysed carries `quick`: values measured from Sentinel-2, with no report.
 * Folded, it is a one-line chip.
 */
export default function PlotCard({ parcel, scene, guide = null, folded = false, onFold = () => {}, onOpenReport, onClose }) {
  const { theme } = useTheme()
  const colors = CHART_COLORS[theme]
  const quick = parcel.quick ?? null
  const values = quick ? (quick.values ?? {}) : parcel
  const title = parcel.drawn ? 'Drawn field' : parcel.upi
  const imageText = scene.status === 'ready' ? formatScene(scene.scene) : SCENE_TEXT[scene.status] ?? ''
  const place = quick
    ? [parcel.district, parcel.sector, parcel.cell, parcel.village, parcel.areaM2 ? formatHectares(parcel.areaM2) : null]
        .filter(Boolean)
        .join(' · ')
    : ''

  if (folded) {
    return (
      <button
        type="button"
        onClick={() => onFold(false)}
        aria-label={`Show details of ${title}`}
        aria-expanded="false"
        className="glass flex max-w-full items-center gap-2 rounded-full px-3 py-1.5 text-xs shadow-float"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        <span className="truncate font-semibold">{title}</span>
        <span className="text-ink-2">{`NDVI ${formatIndex(values.ndvi)}`}</span>
        <Glyph d="M6 15l6-6 6 6" />
      </button>
    )
  }

  return (
    <div role="dialog" aria-label={`Plot ${title}`} className="glass w-72 max-w-full rounded-3xl p-3 text-sm shadow-float">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-display font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {title}
          </p>
          {place && <p className="text-xs text-ink-2">{place}</p>}
        </div>
        <div className="-m-1 flex shrink-0">
          <button type="button" aria-label="Fold" aria-expanded="true" onClick={() => onFold(true)} className="icon-btn h-7 w-7">
            <Glyph d="M6 9l6 6 6-6" />
          </button>
          <button type="button" aria-label="Close" onClick={onClose} className="icon-btn h-7 w-7">
            <Glyph d="M6 6l12 12M18 6L6 18" />
          </button>
        </div>
      </div>

      <ul className="mt-2.5 grid grid-cols-3 gap-1.5" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {SERIES.map((s) => {
          const verdict = verdictOf(guideBands(guide, s.code), values[s.key])
          return (
            <li key={s.key} className="rounded-2xl px-2 py-1.5 text-center" style={{ backgroundColor: `${colors[s.key]}26` }}>
              <p className="text-[0.6875rem] font-semibold text-ink-2">{s.code}</p>
              <p data-testid={`popup-${s.code}`} className="text-base font-semibold leading-tight">
                {formatIndex(values[s.key])}
              </p>
              <p data-testid={`popup-${s.code}-verdict`} className="text-[0.6875rem]">
                <Verdict verdict={verdict} />
              </p>
            </li>
          )
        })}
      </ul>

      {quick && QUICK_TEXT[quick.status] && <p className="mt-2 text-xs text-ink-2">{QUICK_TEXT[quick.status]}</p>}
      <p className="mt-2 text-xs text-ink-2" title="Cloud share of the whole Sentinel-2 tile, not of this plot">
        {imageText}
      </p>
      {quick && parcel.analyse && <Analyse {...parcel.analyse} />}
      {!quick && (
        <button type="button" className="btn-ghost mt-3 w-full" onClick={onOpenReport}>
          Open report
        </button>
      )}
    </div>
  )
}
