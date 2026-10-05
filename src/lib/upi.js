// province / district / sector / cell / parcel number, e.g. 5/05/10/02/1939.
// The same rule as the GIS team's analysis tool, which stores 5/5/10/2/1939
// as 5/05/10/02/1939, so a search finds what the tool wrote.
const UPI_PATTERN = /^(\d)\s*\/\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{1,6})$/

// A field drawn on the map is stored by the tool under `AREA <name>` (the
// name cut to letters, digits, spaces, `_` and `-`, at most 26 characters)
// or, with no name, `AREA-` and eight hex digits made from its outline.
const AREA_HASH = /^area-([0-9a-f]{8})$/i
const AREA_NAMED = /^area\s+([A-Za-z0-9_-][A-Za-z0-9 _-]{0,25})$/i

export const UPI_FORMAT_MESSAGE = 'Enter a UPI in the form 5/05/10/02/1939'

const pad = (part) => part.padStart(2, '0')

/**
 * The UPI as the layer stores it, or null when the input is not one. Only
 * digits and slashes come out, so the value is safe to place in a query.
 */
export function parseUpi(input) {
  if (typeof input !== 'string') return null
  const m = UPI_PATTERN.exec(input.trim())
  if (!m) return null
  const [, province, district, sector, cell, parcel] = m
  return `${province}/${pad(district)}/${pad(sector)}/${pad(cell)}/${Number(parcel)}`
}

/**
 * The id of a drawn area as the layer stores it, or null. Only letters,
 * digits, spaces, `_` and `-` come out, so it is safe to place in a query.
 */
export function parseAreaId(input) {
  if (typeof input !== 'string') return null
  const text = input.trim()
  const hash = AREA_HASH.exec(text)
  if (hash) return `AREA-${hash[1].toUpperCase()}`
  const named = AREA_NAMED.exec(text)
  return named ? `AREA ${named[1]}` : null
}

/** A parcel's UPI or a drawn area's id: whatever the layer keys its rows by. */
export function parseParcelId(input) {
  return parseUpi(input) ?? parseAreaId(input)
}

export const isAreaId = (id) => typeof id === 'string' && /^AREA[ -]/.test(id)
