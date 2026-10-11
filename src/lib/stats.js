const isNumber = (value) => typeof value === 'number' && Number.isFinite(value)

/**
 * Average, lowest, highest and first-to-last change of one index over some
 * observations. Plain arithmetic on the layer's readings: no levels.
 */
export function summarise(rows, key) {
  const points = rows.filter((row) => isNumber(row[key])).sort((a, b) => a.date - b.date)
  if (points.length === 0) return { mean: null, min: null, max: null, change: null, count: 0 }
  const values = points.map((row) => row[key])
  return {
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    change: values.length > 1 ? values[values.length - 1] - values[0] : null,
    count: values.length,
  }
}
