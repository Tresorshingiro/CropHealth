import { useState } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatDate, formatIndex, formatMonth } from '../lib/format.js'
import { useChartDrag } from '../hooks/useChartDrag.js'
import { filterRange } from '../lib/range.js'
import { seasonBands } from '../lib/seasons.js'
import { axisTicks } from '../lib/ticks.js'
import { CHART_COLORS, SERIES } from '../theme/palette.js'
import { useTheme } from '../theme/ThemeContext.jsx'

/** One parcel's three indices as chart lines. */
export const indexLines = (colors) =>
  SERIES.map((s) => ({ key: s.key, name: `${s.code} ${s.hint}`, short: s.code, color: colors[s.key] }))

function Lines({ rows, lines, colors, range, imageDate, onImageDate, onRangeSelect }) {
  const { drag, handlers } = useChartDrag(rows, { onRangeSelect, onImageDate })
  const tick = { fill: colors.text, fontSize: 12 }
  const ticks = axisTicks(rows.flatMap((row) => lines.map((line) => row[line.key])))
  // Rwanda's farming seasons, shaded behind the lines across what the chart shows.
  const [first, last] = range ? [range.from, range.to] : [rows[0].date, rows[rows.length - 1].date]
  const bands = seasonBands(first, last)

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={rows}
        margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
        {...handlers}
        // A sideways drag picks dates instead of scrolling the page; up and down still scroll.
        style={{ cursor: 'crosshair', userSelect: 'none', touchAction: 'pan-y' }}
      >
        {bands.map((band) => (
          <ReferenceArea
            key={band.key}
            x1={band.x1}
            x2={band.x2}
            fill={colors.grid}
            fillOpacity={band.shade ? 0.55 : 0.25}
            stroke="none"
            ifOverflow="hidden"
            label={{ value: band.id, position: 'insideTop', fill: colors.text, fontSize: 11 }}
          />
        ))}
        <CartesianGrid stroke={colors.grid} vertical={false} />
        <XAxis
          dataKey="date"
          type="number"
          scale="time"
          domain={range ? [range.from, range.to] : ['dataMin', 'dataMax']}
          allowDataOverflow
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
          // A missing value is listed as a dash, not left out.
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
          // Keep the lines in the order they were given (NDVI, NDMI, NDRE).
          itemSorter={() => 0}
          iconType="plainline"
          formatter={(value) => <span style={{ color: colors.ink2, fontSize: 12 }}>{value}</span>}
        />
        {lines.map((line) => (
          <Line
            key={line.key}
            // Smooth, without overshooting the readings (monotone never bends past a point).
            type="monotone"
            dataKey={line.key}
            name={line.name}
            stroke={line.color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={false}
            activeDot={{ r: 4, stroke: colors.surface, strokeWidth: 2 }}
            connectNulls
            isAnimationActive={false}
          />
        ))}
        {imageDate !== null && <ReferenceLine x={imageDate} stroke={colors.ink2} strokeDasharray="3 3" />}
        {drag && drag.start !== drag.end && (
          <ReferenceArea
            x1={Math.min(drag.start, drag.end)}
            x2={Math.max(drag.start, drag.end)}
            fill={colors.ink2}
            fillOpacity={0.08}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  )
}

function Rows({ rows, lines, imageDate, onImageDate }) {
  const newestFirst = [...rows].reverse()
  return (
    <div className="max-h-72 overflow-y-auto">
      <table className="w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
        <thead className="sticky top-0 bg-surface text-left text-xs text-ink-2">
          <tr>
            <th scope="col" className="py-1.5 pr-3 font-medium">Date</th>
            {lines.map((line) => (
              <th key={line.key} scope="col" className="py-1.5 pr-3 text-right font-medium">
                {line.short}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {newestFirst.map((row) => (
            <tr key={row.date}>
              <td className="py-1.5 pr-3">
                {onImageDate ? (
                  <button
                    type="button"
                    aria-pressed={row.date === imageDate}
                    onClick={() => onImageDate(row.date)}
                    title="Show this date's image on the map"
                    className="rounded underline-offset-2 hover:underline aria-pressed:font-semibold aria-pressed:text-accent"
                  >
                    {formatDate(row.date)}
                  </button>
                ) : (
                  formatDate(row.date)
                )}
              </td>
              {lines.map((line) => (
                <td key={line.key} className="py-1.5 pr-3 text-right">
                  {formatIndex(row[line.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function IndexChart({
  status,
  observations,
  error,
  onRetry,
  lines,
  title = 'Index history',
  actions = null,
  toolbar = null,
  range = null,
  imageDate = null,
  onImageDate,
  onRangeSelect,
}) {
  const { theme } = useTheme()
  const colors = CHART_COLORS[theme]
  const shown = lines ?? indexLines(colors)
  const [view, setView] = useState('chart')
  const rows = status === 'ready' ? filterRange(observations, range) : []
  const hasAny = status === 'ready' && observations.length > 0
  const hasRows = rows.length > 0

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
  } else if (!hasAny) {
    body = <p className="text-sm text-ink-2">No clear observations yet</p>
  } else if (!hasRows) {
    body = <p className="text-sm text-ink-2">No clear dates in this period</p>
  } else if (view === 'table') {
    body = <Rows rows={rows} lines={shown} imageDate={imageDate} onImageDate={onImageDate} />
  } else {
    body = (
      <div className="h-72">
        <Lines
          rows={rows}
          lines={shown}
          colors={colors}
          range={range}
          imageDate={imageDate}
          onImageDate={onImageDate}
          onRangeSelect={onRangeSelect}
        />
      </div>
    )
  }

  return (
    <section aria-labelledby="chart-title" className="panel p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="chart-title" className="font-display text-sm font-semibold">
            {title}
          </h2>
          <p className="text-xs text-ink-2">
            {hasRows ? `${rows.length} clear ${rows.length === 1 ? 'date' : 'dates'}` : 'Clear Sentinel-2 dates'}
            {/* In its own element, so the count can still be found as exact text. */}
            {hasRows && onRangeSelect && view === 'chart' && <span> · drag to pick dates</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {actions}
          {imageDate !== null && onImageDate && (
            <button type="button" className="btn-ghost" onClick={() => onImageDate(null)}>
              Latest in range
            </button>
          )}
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
      </div>
      {toolbar && <div className="mb-4">{toolbar}</div>}
      {body}
    </section>
  )
}
