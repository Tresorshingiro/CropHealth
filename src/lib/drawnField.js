import { RWANDA_RINGS } from './mapLayers.js'

// A field drawn on the map, checked before anything is measured or sent. The
// server checks the outline and the name again.

const EARTH_RADIUS = 6378137 // m
const MIN_M2 = 500 // 0.05 ha
const MAX_M2 = 5_000_000 // 500 ha
const MAX_SPAN = 0.05 // degrees, about 5 km
export const MAX_POINTS = 500
const NAME = /^[A-Za-z0-9_-][A-Za-z0-9 _-]{0,25}$/
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const MESSAGES = {
  few: 'Click at least three points to outline the field.',
  crosses: 'The outline crosses itself. Draw it again.',
  many: `Draw the field with at most ${MAX_POINTS} points.`,
  outside: 'Draw a field inside Rwanda.',
  size: 'Draw a field between 0.05 and 500 hectares.',
  wide: 'Draw a field at most about 5 km across.',
}

const rad = (deg) => (deg * Math.PI) / 180

/** A closed ring's area on the earth in m², from [lng, lat] points (spherical; well under 1% off at field size). */
export function ringAreaM2(ring) {
  let sum = 0
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[i + 1]
    sum += rad(x2 - x1) * (2 + Math.sin(rad(y1)) + Math.sin(rad(y2)))
  }
  return Math.abs((sum * EARTH_RADIUS * EARTH_RADIUS) / 2)
}

const turn = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
const opposite = (p, q) => (p > 0 && q < 0) || (p < 0 && q > 0)
const edgesCross = (a, b, c, d) => opposite(turn(c, d, a), turn(c, d, b)) && opposite(turn(a, b, c), turn(a, b, d))

/** Whether any two edges of a closed ring that share no point cross. */
export function crossesItself(ring) {
  const edges = ring.length - 1
  for (let i = 0; i < edges; i += 1) {
    for (let j = i + 2; j < edges; j += 1) {
      if (i === 0 && j === edges - 1) continue // the first and last edges meet at the closing point
      if (edgesCross(ring[i], ring[i + 1], ring[j], ring[j + 1])) return true
    }
  }
  return false
}

/** Whether a [lng, lat] point is inside some rings (even-odd rule). */
export function insideRings([x, y], rings = RWANDA_RINGS) {
  let inside = false
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [xi, yi] = ring[i]
      const [xj, yj] = ring[j]
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
    }
  }
  return inside
}

const closed = (ring) => {
  const [first] = ring
  const last = ring[ring.length - 1]
  return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, [...first]]
}

// ArcGIS reads a lone counter-clockwise ring as a hole, so outlines go clockwise
// (the shoelace sum below is positive for a clockwise ring in x-east, y-north).
const clockwise = (ring) => {
  let sum = 0
  for (let i = 0; i < ring.length - 1; i += 1) sum += (ring[i + 1][0] - ring[i][0]) * (ring[i + 1][1] + ring[i][1])
  return sum >= 0 ? ring : [...ring].reverse()
}

/**
 * A drawn outline as `[[lng, lat], …]` rings: accepted as one closed ring with
 * its area, or refused with a message to show on the map.
 */
export function checkField(rings, country = RWANDA_RINGS) {
  if (!Array.isArray(rings) || rings.length !== 1 || rings[0].length < 3) return { ok: false, message: MESSAGES.few }
  const ring = closed(rings[0])
  if (ring.length < 4) return { ok: false, message: MESSAGES.few }
  if (ring.length - 1 > MAX_POINTS) return { ok: false, message: MESSAGES.many }
  if (crossesItself(ring)) return { ok: false, message: MESSAGES.crosses }
  if (!ring.every((point) => insideRings(point, country))) return { ok: false, message: MESSAGES.outside }
  const xs = ring.map(([x]) => x)
  const ys = ring.map(([, y]) => y)
  if (Math.max(...xs) - Math.min(...xs) > MAX_SPAN || Math.max(...ys) - Math.min(...ys) > MAX_SPAN) {
    return { ok: false, message: MESSAGES.wide }
  }
  const areaM2 = ringAreaM2(ring)
  if (areaM2 < MIN_M2 || areaM2 > MAX_M2) return { ok: false, message: MESSAGES.size }
  return { ok: true, rings: [clockwise(ring)], areaM2 }
}

/** The name the tool will store the field under (`AREA <name>`), trimmed, or null. */
export function fieldName(text) {
  if (typeof text !== 'string') return null
  const name = text.trim()
  return NAME.test(name) && !/ {2}/.test(name) ? name : null
}

const pad = (n) => String(n).padStart(2, '0')

/** A name to start from: the local day and time, e.g. "Field 07 Oct 1432". */
export const defaultFieldName = (date = new Date()) =>
  `Field ${pad(date.getDate())} ${MONTHS[date.getMonth()]} ${pad(date.getHours())}${pad(date.getMinutes())}`
