import { describe, expect, it } from 'vitest'
import { isTyping } from './keys.js'

describe('isTyping', () => {
  it('is true in a text field, so Escape there does not close the map card', () => {
    expect(isTyping(document.createElement('input'))).toBe(true)
    expect(isTyping(document.createElement('textarea'))).toBe(true)
    expect(isTyping(document.createElement('select'))).toBe(true)
  })
  it('is false elsewhere', () => {
    expect(isTyping(document.createElement('button'))).toBe(false)
    expect(isTyping(document.body)).toBe(false)
    expect(isTyping(null)).toBe(false)
  })
})
