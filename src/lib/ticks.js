const STEP_TENTHS = 2 // ticks every 0.2
const EPSILON = 1e-9

/**
 * Y-axis ticks every 0.2 that cover the values, so the axis shows clean
 * numbers and passes through zero when the data does. Counting in whole steps
 * and dividing once keeps floating-point noise out of the labels.
 */
export function axisTicks(values) {
  const finite = values.filter((value) => typeof value === 'number' && Number.isFinite(value))
  if (finite.length === 0) return [0, 0.2, 0.4, 0.6, 0.8, 1]

  const step = STEP_TENTHS / 10
  const low = Math.floor(Math.min(...finite) / step + EPSILON)
  let high = Math.ceil(Math.max(...finite) / step - EPSILON)
  if (high === low) high += 1

  const ticks = []
  for (let i = low; i <= high; i += 1) ticks.push((i * STEP_TENTHS) / 10)
  return ticks
}
