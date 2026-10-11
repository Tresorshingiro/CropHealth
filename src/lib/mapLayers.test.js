import { describe, expect, it } from 'vitest'
import { BASEMAPS, RWANDA_EXTENT, RWANDA_RINGS } from './mapLayers.js'

// Twice the signed area: positive for a clockwise ring with y pointing up.
const clockwise = (ring) =>
  ring.slice(1).reduce((sum, [x, y], i) => sum + (x - ring[i][0]) * (y + ring[i][1]), 0) > 0

describe('Rwanda on the map', () => {
  it('frames the country, with a little room around it', () => {
    expect(RWANDA_EXTENT.spatialReference).toEqual({ wkid: 4326 })
    expect(RWANDA_EXTENT.xmin).toBeLessThan(28.86)
    expect(RWANDA_EXTENT.xmax).toBeGreaterThan(30.89)
    expect(RWANDA_EXTENT.ymin).toBeLessThan(-2.83)
    expect(RWANDA_EXTENT.ymax).toBeGreaterThan(-1.05)
    expect(RWANDA_EXTENT.xmax - RWANDA_EXTENT.xmin).toBeLessThan(2.4)
  })

  it('has one closed border ring, outer ring clockwise', () => {
    expect(RWANDA_RINGS).toHaveLength(1)
    const ring = RWANDA_RINGS[0]
    expect(ring.at(0)).toEqual(ring.at(-1))
    expect(clockwise(ring)).toBe(true)
  })

  it('no longer fades the land around the country', async () => {
    expect(await import('./mapLayers.js')).not.toHaveProperty('rwandaMask')
  })

  it('draws no other country borders or place names over the base maps', () => {
    for (const basemap of BASEMAPS) expect(basemap.reference('light')).toEqual([])
  })
})
