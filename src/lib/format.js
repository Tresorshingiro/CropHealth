const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DASH = '–'

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value)

export function formatIndex(value) {
  if (!isNumber(value)) return DASH
  const text = value.toFixed(2)
  return text === '-0.00' ? '0.00' : text
}

export function formatDate(ms) {
  if (!isNumber(ms)) return DASH
  const d = new Date(ms)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

export function formatMonth(ms) {
  if (!isNumber(ms)) return DASH
  const d = new Date(ms)
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

export function formatHectares(m2) {
  if (!isNumber(m2)) return DASH
  return `${(m2 / 10000).toFixed(2)} ha`
}

/** A change with its sign, e.g. +0.12. A change that rounds to nothing has none. */
export function formatChange(value) {
  if (!isNumber(value)) return DASH
  const text = formatIndex(value)
  return value > 0 && text !== '0.00' ? `+${text}` : text
}

export function formatRange(range) {
  return range ? `${formatDate(range.from)} – ${formatDate(range.to)}` : 'All dates'
}

/** The Sentinel-2 image on the map. The cloud share is the whole tile's, not the plot's. */
export function formatScene(scene) {
  if (!scene) return DASH
  const cloud = isNumber(scene.cloud) ? ` · cloud ${Math.round(scene.cloud * 100)}%` : ''
  return `Image ${formatDate(scene.date)}${cloud}`
}
