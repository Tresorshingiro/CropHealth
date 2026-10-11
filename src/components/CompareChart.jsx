import { useMemo } from 'react'
import { mergeSeries } from '../lib/compare.js'
import { SERIES } from '../theme/palette.js'
import IndexChart from './IndexChart.jsx'
import IndexSwitch from './IndexSwitch.jsx'

const noop = () => {}

/** One index for every loaded plot, one line each, in the plots' colours and dashes. */
export default function CompareChart({ plots, range, index, onIndexChange, imageDate, onImageDate, onRangeSelect }) {
  const ready = plots.filter((plot) => plot.status === 'ready')
  const readyKey = ready.map((plot) => plot.id).join(',')
  // Re-merged only when the loaded plots or the index change: a loaded plot's
  // observations never change, so its id stands for them.
  const rows = useMemo(() => mergeSeries(ready, index), [readyKey, index])
  const lines = ready.map((plot, i) => ({ key: `p${i}`, name: plot.id, short: plot.id, color: plot.color, dash: plot.dash }))
  const code = SERIES.find((s) => s.key === index)?.code ?? ''
  const status = ready.length === 0 && plots.some((plot) => plot.status === 'loading') ? 'loading' : 'ready'

  return (
    <IndexChart
      status={status}
      observations={rows}
      lines={lines}
      error={null}
      onRetry={noop}
      title={`${code} by plot`}
      actions={<IndexSwitch value={index} onChange={onIndexChange} label="Index to compare" />}
      range={range}
      imageDate={imageDate}
      onImageDate={onImageDate}
      onRangeSelect={onRangeSelect}
    />
  )
}
