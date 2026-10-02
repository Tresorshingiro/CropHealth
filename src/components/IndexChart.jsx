import { useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatDate, formatIndex, formatMonth } from '../lib/format.js'
import { axisTicks } from '../lib/ticks.js'
import { CHART_COLORS, SERIES } from '../theme/palette.js'
import { useTheme } from '../theme/ThemeContext.jsx'


function Lines({ observations, colors }) {
  const tick = { fill: colors.text, fontSize: 12 }
  const ticks = axisTicks(observations.flatMap((row) => SERIES.map((s) => row[s.key])))
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={observations} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={colors.grid} vertical={false} />
        <XAxis
          dataKey="date"
          type="number"
          scale="time"
          domain={['dataMin', 'dataMax']}
          tickFormatter={formatMonth}
          tick={tick}
          tickLine={false}
          stroke={colors.axis}
          minTickGap={48}
        />
        <YAxis
          domain={[ticks[0], ticks[ticks.length - 1]]}
          ticks={ticks}
          tickFormatter={(value) => value.toFixed(1)}
          tick={tick}
          tickLine={false}
          axisLine={false}
          width={40}
        />
        <Tooltip
          // A missing index is listed as a dash, not left out.
          filterNull={false}
          itemSorter={() => 0}
          labelFormatter={formatDate}
          formatter={(value) => formatIndex(value)}
          cursor={{ stroke: colors.axis, strokeWidth: 1 }}
          contentStyle={{
            background: colors.surface,
            border: `1px solid ${colors.grid}`,
            borderRadius: 8,
            color: colors.ink,
            fontSize: 12,
          }}
          labelStyle={{ color: colors.ink, fontWeight: 600 }}
          itemStyle={{ color: colors.ink2 }}
        />
        <Legend
          // Keep NDVI, NDMI, NDRE in the same order as the cards above.
          itemSorter={() => 0}
          iconType="plainline"
          formatter={(value) => <span style={{ color: colors.ink2, fontSize: 12 }}>{value}</span>}
        />
        {SERIES.map((s) => (
          <Line
            key={s.key}
            type="linear"
            dataKey={s.key}
            name={`${s.code} ${s.hint}`}
            stroke={colors[s.key]}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={false}
            activeDot={{ r: 4, stroke: colors.surface, strokeWidth: 2 }}
            connectNulls
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

function Rows({ observations }) {
  const newestFirst = [...observations].reverse()
  return (
    <div className="max-h-72 overflow-y-auto">
      <table className="w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
        <thead className="sticky top-0 bg-surface text-left text-xs text-ink-2">
          <tr>
            <th scope="col" className="py-1.5 pr-3 font-medium">Date</th>
            {SERIES.map((s) => (
              <th key={s.key} scope="col" className="py-1.5 pr-3 text-right font-medium">
                {s.code}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {newestFirst.map((row) => (
            <tr key={row.date}>
              <td className="py-1.5 pr-3">{formatDate(row.date)}</td>
              {SERIES.map((s) => (
                <td key={s.key} className="py-1.5 pr-3 text-right">
                  {formatIndex(row[s.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function IndexChart({ status, observations, error, onRetry }) {
  const { theme } = useTheme()
  const [view, setView] = useState('chart')
  const hasRows = status === 'ready' && observations.length > 0

  let body
  if (status === 'idle') {
    body = <p className="text-sm text-ink-2">Select a parcel to see its history.</p>
  } else if (status === 'loading') {
    body = <div role="status" aria-label="Loading history" className="h-64 animate-pulse rounded-lg bg-raised motion-reduce:animate-none" />
  } else if (status === 'error') {
    body = (
      <div>
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
        <button type="button" className="btn-ghost mt-3" onClick={onRetry}>
          Retry
        </button>
      </div>
    )
  } else if (!hasRows) {
    body = <p className="text-sm text-ink-2">No clear observations yet</p>
  } else if (view === 'table') {
    body = <Rows observations={observations} />
  } else {
    body = (
      <div className="h-72">
        <Lines observations={observations} colors={CHART_COLORS[theme]} />
      </div>
    )
  }

  return (
    <section aria-labelledby="chart-title" className="panel h-full p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="chart-title" className="font-display text-sm font-semibold">
            Index history
          </h2>
          <p className="text-xs text-ink-2">
            {hasRows ? `${observations.length} clear ${observations.length === 1 ? 'date' : 'dates'}` : 'Clear Sentinel-2 dates'}
          </p>
        </div>
        {hasRows && (
          <div className="flex gap-1" role="group" aria-label="View">
            {[
              ['chart', 'Chart'],
              ['table', 'Table'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`btn-ghost ${view === id ? 'bg-raised text-ink' : ''}`}
                aria-pressed={view === id}
                onClick={() => setView(id)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      {body}
    </section>
  )
}
