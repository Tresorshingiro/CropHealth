import { describe, expect, it } from 'vitest'
import { SEASON_NOTE, sentence, summary } from './explain.js'

describe('sentence', () => {
  it('says what each index and verdict means', () => {
    expect(sentence('ndvi', 'good')).toBe('Dense green cover: the crop is growing well.')
    expect(sentence('ndmi', 'poor')).toBe('Dry: the crop may be short of water.')
    expect(sentence('ndre', 'moderate')).toBe('Medium chlorophyll.')
    expect(sentence('ndvi', null)).toBeNull()
  })
})

describe('summary', () => {
  it('names the lowest verdict and groups the indices by verdict', () => {
    expect(summary({ ndvi: 'good', ndmi: 'moderate', ndre: 'good' })).toEqual({
      verdict: 'moderate',
      text: 'Green cover and chlorophyll are good; moisture is moderate.',
    })
    expect(summary({ ndvi: 'poor', ndmi: 'poor', ndre: 'poor' })).toEqual({
      verdict: 'poor',
      text: 'Green cover, moisture and chlorophyll are poor.',
    })
  })
  it('uses only the indices that have a verdict', () => {
    expect(summary({ ndvi: 'poor', ndmi: null, ndre: null })).toEqual({ verdict: 'poor', text: 'Green cover is poor.' })
  })
  it('gives nothing without any verdict', () => {
    expect(summary({ ndvi: null, ndmi: null, ndre: null })).toBeNull()
  })
  it('reminds the reader that low values are normal at planting and harvest', () => {
    expect(SEASON_NOTE).toMatch(/after planting and after harvest/)
  })
})
