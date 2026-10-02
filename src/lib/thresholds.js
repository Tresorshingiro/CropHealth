// The index guide describes each index's levels as text, e.g.
//   "below 0.20 bare; 0.20-0.35 very sparse; ...; above 0.75 dense"
// These helpers turn that into bands for drawing a scale. The bands and their
// names are the GIS team's; nothing here decides what a value means.

const NUM = '(-?\\d*\\.?\\d+)'
const BELOW = new RegExp(`^below\\s+${NUM}\\s+(.+)$`, 'i')
const BETWEEN = new RegExp(`^${NUM}\\s*-\\s*${NUM}\\s+(.+)$`)
const ABOVE = new RegExp(`^above\\s+${NUM}\\s+(.+)$`, 'i')

/**
 * Bands as [{ from, to, label }], lowest first, open at both ends.
 * Returns null unless the text is one unbroken, ascending run of bands.
 */
export function parseThresholds(text) {
  if (typeof text !== 'string') return null
  const parts = text.split(';').map((part) => part.trim()).filter(Boolean)
  if (parts.length < 2) return null

  const bands = []
  for (let i = 0; i < parts.length; i += 1) {
    let m
    if (i === 0 && (m = BELOW.exec(parts[i]))) {
      bands.push({ from: -Infinity, to: Number(m[1]), label: m[2] })
    } else if (i === parts.length - 1 && (m = ABOVE.exec(parts[i]))) {
      bands.push({ from: Number(m[1]), to: Infinity, label: m[2] })
    } else if (i > 0 && i < parts.length - 1 && (m = BETWEEN.exec(parts[i]))) {
      bands.push({ from: Number(m[1]), to: Number(m[2]), label: m[3] })
    } else {
      return null
    }
  }
  for (let i = 1; i < bands.length; i += 1) {
    if (bands[i].from !== bands[i - 1].to || !(bands[i].to > bands[i].from)) return null
  }
  return bands
}

const width = (band) => (band && Number.isFinite(band.from) && Number.isFinite(band.to) ? band.to - band.from : null)

/**
 * Where a value sits on a scale that draws every band the same width:
 * { index: its band, position: 0..1 along the whole scale }.
 */
export function locate(bands, value) {
  if (!bands || typeof value !== 'number' || !Number.isFinite(value)) return null
  const index = bands.findIndex((band) => value < band.to)
  const band = bands[index]
  // The two end bands have no outer bound, so they borrow their neighbour's width.
  const span = width(band) ?? width(bands[index === 0 ? 1 : index - 1]) ?? 1
  const from = Number.isFinite(band.from) ? band.from : band.to - span
  const within = Math.min(1, Math.max(0, (value - from) / span))
  return { index, position: (index + within) / bands.length }
}
