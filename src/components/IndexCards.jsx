import { filterRange } from '../lib/range.js'
import { summarise } from '../lib/stats.js'
import { CHART_COLORS, SERIES } from '../theme/palette.js'
import { useTheme } from '../theme/ThemeContext.jsx'
import IndexMeter from './IndexMeter.jsx'

/**
 * A parcel's three indices. `observations` is its history, or null while that loads.
 * On a wide screen the column fills the box it is placed in (the map's height), the three cards sharing it.
 */
export default function IndexCards({ parcel, guide, observations, range, className = '' }) {
  const { theme } = useTheme()
  const colors = CHART_COLORS[theme]
  const rows = observations ? filterRange(observations, range) : null
  return (
    <div role="group" aria-label="Indices" className={`grid gap-3 lg:flex lg:h-full lg:flex-col ${className}`}>
      {SERIES.map((s) => (
        <IndexMeter
          key={s.key}
          indexKey={s.key}
          code={s.code}
          hint={s.hint}
          value={parcel[s.key]}
          level={parcel[`${s.key}Level`]}
          color={colors[s.key]}
          guide={guide}
          average={rows ? summarise(rows, s.key) : null}
        />
      ))}
    </div>
  )
}
