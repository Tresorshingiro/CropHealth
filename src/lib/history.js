import { parseParcelId } from './upi.js'

const STORAGE_KEY = 'crophealth-history'
const LIMIT = 20

export function readHistory() {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]')
    if (!Array.isArray(value)) return []
    return value.filter((item) => typeof item === 'string' && parseParcelId(item) === item).slice(0, LIMIT)
  } catch {
    return []
  }
}

export function addToHistory(upi) {
  const next = [upi, ...readHistory().filter((item) => item !== upi)].slice(0, LIMIT)
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage blocked: history lasts for this page only.
  }
  return next
}
