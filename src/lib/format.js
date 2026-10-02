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
