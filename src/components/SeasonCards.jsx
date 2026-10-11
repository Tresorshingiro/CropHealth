import { formatIndex } from '../lib/format.js'
import { HEALTH_COLORS } from '../lib/mapLayers.js'
import { seasonsWithReadings } from '../lib/seasons.js'
import { summarise } from '../lib/stats.js'
import { guideBands, VERDICT_LABELS, verdictOf } from '../lib/verdict.js'
import { CHART_COLORS, SERIES } from '../theme/palette.js'
import { useTheme } from '../theme/ThemeContext.jsx'

/**
 * Every farming season in the plot's history, oldest on the left, as a row of
 * compact chips in the chart card: each season's average NDVI, NDMI and NDRE
 * with its verdict. A chip sets the period to its season.
 */
export default function SeasonCards({ observations, range, onSelect, guide, now = Date.now() }) {
  const { theme } = useTheme()
  const colors = CHART_COLORS[theme]
  const seasons = seasonsWithReadings(observations, now)

  return (
    <section aria-labelledby="seasons-title" className="space-y-1.5">
      <h3 id="seasons-title" className="text-xs font-medium text-ink-2">
        Seasons
      </h3>
      {seasons.length === 0 ? (
        <p className="text-sm text-ink-2">No clear dates in the last seasons</p>
      ) : (
        // One row; more seasons than fit scroll sideways. The padding (taken back by the
        // negative margin) leaves room for the selected chip's ring, which the scroll box would clip.
        <div className="-m-1 flex gap-2 overflow-x-auto p-1">
          {seasons.map((s) => {
            const selected = range?.from === s.from && range?.to === s.to
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={selected}
                onClick={() => onSelect({ from: s.from, to: s.to })}
                // relative: the verdict words for screen readers are absolutely placed; without it they
                // land at the page's edge and make the whole page scroll past the app.
                className={`card relative block w-60 shrink-0 rounded-2xl px-3 py-2 text-left transition hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                  selected ? 'ring-2 ring-accent' : ''
                }`}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-xs font-semibold">{s.label}</span>
                  <span className="shrink-0 text-[0.6875rem] text-ink-2">{s.months}</span>
                </span>
                <span className="mt-1.5 grid grid-cols-3 gap-1" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {SERIES.map((x) => {
                    const { mean } = summarise(s.rows, x.key)
                    const verdict = verdictOf(guideBands(guide, x.code), mean)
                    return (
                      <span
                        key={x.key}
                        data-testid={`${s.key}-${x.code}`}
                        title={verdict ? `${x.code}: ${VERDICT_LABELS[verdict]}` : x.code}
                        className="flex flex-col rounded-xl px-1.5 py-1 text-center"
                        style={{ backgroundColor: `${colors[x.key]}26` }}
                      >
                        <span className="text-[0.625rem] font-semibold text-ink-2">{x.code}</span>
                        <span className="flex items-center justify-center gap-1 text-sm font-semibold leading-tight">
                          {/* The verdict as a dot in its status colour, and in words for assistive technology. */}
                          {verdict && (
                            <span
                              aria-hidden="true"
                              className="h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{ backgroundColor: HEALTH_COLORS[verdict].css }}
                            />
                          )}
                          {formatIndex(mean)}
                        </span>
                        {verdict && <span className="sr-only">{VERDICT_LABELS[verdict]}</span>}
                      </span>
                    )
                  })}
                </span>
                <span className="mt-1.5 flex items-center justify-between gap-2 text-[0.6875rem] text-ink-2">
                  {`${s.rows.length} clear ${s.rows.length === 1 ? 'date' : 'dates'}`}
                  {s.inProgress && <span className="rounded-full bg-accent/10 px-1.5 font-semibold text-accent">In progress</span>}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
