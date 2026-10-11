import { SEASON_NOTE, summary } from '../lib/explain.js'
import { formatDate, formatHectares } from '../lib/format.js'
import { isAreaId } from '../lib/upi.js'
import { guideBands, verdictOf } from '../lib/verdict.js'
import { SERIES } from '../theme/palette.js'
import Verdict from './Verdict.jsx'

const Notice = ({ children }) => <div className="panel p-6">{children}</div>

const Fact = ({ label, children }) => (
  <div>
    <dt className="text-xs text-ink-2">{label}</dt>
    <dd className="mt-0.5 text-sm font-semibold">{children}</dd>
  </div>
)

const LOOKUP_TEXT = {
  searching: 'Finding it in the land parcel records…',
  missing: 'No land parcel with this UPI in the NLA records. Check the UPI.',
  error: 'The land parcel records could not be reached, so it is not on the map.',
  found: 'It is shown on the map with a quick look from Sentinel-2. Analyse it for a full report with 14 months of history (about a minute).',
}

/** The GIS team's analysis for a searched parcel that has none yet. */
function AnalyseSearched({ status, message, onStart }) {
  if (status === 'running' || status === 'succeeded') {
    return (
      <p role="status" className="mt-3 text-sm text-ink-2">
        {status === 'running' ? 'Analysing this parcel… about a minute' : 'Analysed. Opening its report…'}
      </p>
    )
  }
  return (
    <div className="mt-3 space-y-2">
      {status === 'failed' && (
        <p role="alert" className="text-sm text-danger">
          {message}
        </p>
      )}
      <button type="button" className="btn-primary rounded-xl" disabled={status === 'busy'} onClick={onStart}>
        {status === 'failed' ? 'Try again' : 'Analyse this parcel'}
      </button>
      {status === 'busy' && <p className="text-xs text-ink-2">Another field is being analysed.</p>}
    </div>
  )
}

/**
 * The GIS team's analysis run again for an analysed parcel or field, so new
 * Sentinel-2 images join its history. `status`: idle, running, succeeded,
 * failed, or busy (another field's run).
 */
function UpdateImages({ status, message, outcome = null, onStart }) {
  if (status === 'running') {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-ink-2">
        <span aria-hidden="true" className="h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent motion-reduce:animate-none" />
        Reading new images… about a minute
      </p>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <button
        type="button"
        className="btn-ghost"
        disabled={status === 'busy'}
        onClick={onStart}
        title="Run the GIS team's analysis again: all 14 months are read, new images included"
      >
        {status === 'failed' ? 'Try the update again' : 'Update with new images'}
      </button>
      {/* What the run found, once the report has reloaded: new dates, or none since the last clear one. */}
      {status === 'succeeded' && (
        <span role="status" className={`text-xs ${outcome?.found === false ? 'text-ink-2' : 'text-accent'}`}>
          {outcome?.text ?? 'Updated with the latest images.'}
        </span>
      )}
      {status === 'busy' && <span className="text-xs text-ink-2">Another field is being analysed.</span>}
      {status === 'failed' && (
        <span role="alert" className="text-xs text-danger">
          {message}
        </span>
      )}
    </div>
  )
}

/**
 * The head of a parcel's report: who it is, what the layer says about it, and
 * a one-line health summary. For a parcel not analysed yet, `lookup` says
 * whether it was found in the land records, and `analyse` runs the analysis;
 * for an analysed one, `refresh` runs it again for new images.
 */
export default function ParcelSummary({
  status,
  parcel,
  error,
  onRetry,
  guide,
  lookup = null,
  analyse = null,
  refresh = null,
}) {
  if (status === 'not-found') {
    return (
      <Notice>
        <p className="text-sm font-semibold">This parcel has not been analysed yet.</p>
        {LOOKUP_TEXT[lookup] && (
          <p role={lookup === 'searching' ? 'status' : undefined} className="mt-1 text-sm text-ink-2">
            {LOOKUP_TEXT[lookup]}
          </p>
        )}
        {lookup === 'found' && analyse && <AnalyseSearched {...analyse} />}
      </Notice>
    )
  }
  if (status === 'loading') {
    return (
      <div role="status" aria-label="Loading parcel" className="animate-pulse space-y-2 motion-reduce:animate-none">
        <div className="h-9 w-72 max-w-full rounded-lg bg-raised" />
        <div className="h-4 w-52 max-w-full rounded bg-raised" />
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
  const health = summary(Object.fromEntries(SERIES.map((s) => [s.key, verdictOf(guideBands(guide, s.code), parcel[s.key])])))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-2xl font-semibold tracking-tight 2xl:text-3xl">{parcel.upi}</h2>
            {parcel.district && (
              <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">{parcel.district}</span>
            )}
            {isAreaId(parcel.upi) && (
              <span className="rounded-full border border-line px-3 py-1 text-xs font-medium text-ink-2">Drawn field</span>
            )}
          </div>
          {place && <p className="mt-1 text-sm text-ink-2">{place}</p>}
        </div>

        <div className="space-y-2">
          <dl className="flex flex-wrap gap-x-8 gap-y-3">
            <Fact label="Latest clear view">{formatDate(parcel.latestDate)}</Fact>
            <Fact label="Area">{formatHectares(parcel.areaM2)}</Fact>
            {/* The analysis tool writes no reliability, so a re-analysed parcel has none. */}
            {parcel.reliability && <Fact label="Reliability">{parcel.reliability}</Fact>}
            <Fact label="Clear dates">{parcel.usableDates ?? '–'}</Fact>
            {/* When the analysis last ran: how old the history is. */}
            <Fact label="Last updated">{formatDate(parcel.lastRefreshed)}</Fact>
          </dl>
          {refresh && <UpdateImages {...refresh} />}
        </div>
      </div>

      {parcel.headline && (
        <p className="max-w-3xl border-l-2 border-accent pl-4 text-[0.9375rem] leading-relaxed">{parcel.headline}</p>
      )}

      {health && (
        <div data-testid="crop-health" className="card max-w-3xl space-y-1 px-4 py-3">
          <p className="text-[0.9375rem]">
            <span className="font-semibold">Crop health: </span>
            <Verdict verdict={health.verdict} />. {health.text}
          </p>
          <p className="text-xs text-ink-2">{SEASON_NOTE}</p>
        </div>
      )}
    </div>
  )
}
