import { useEffect, useMemo, useState } from 'react'
import { findPlotScene } from '../api/sentinel.js'

const IDLE = { status: 'idle', scene: null }
const LOADING = { status: 'loading', scene: null }

/**
 * Which Sentinel-2 scene the map shows inside the plots. Each answer is kept
 * with the request it belongs to, so a slow answer for plots the user has
 * left is never shown for the new ones.
 */
export function usePlotScene(rings, range, imageDate) {
  const ringsKey = useMemo(() => (rings ? JSON.stringify(rings) : ''), [rings])
  const from = range?.from ?? null
  const to = range?.to ?? null
  const key = `${ringsKey}|${from}|${to}|${imageDate}`
  const [answer, setAnswer] = useState({ key: '', ...IDLE })

  useEffect(() => {
    if (!ringsKey) return undefined
    const controller = new AbortController()
    let active = true
    findPlotScene({
      rings: JSON.parse(ringsKey),
      range: from === null ? null : { from, to },
      imageDate,
      signal: controller.signal,
    })
      .then((scene) => {
        if (active) setAnswer({ key, status: scene ? 'ready' : 'none', scene })
      })
      .catch((err) => {
        if (active && err?.name !== 'AbortError') setAnswer({ key, status: 'error', scene: null })
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [key, ringsKey, from, to, imageDate])

  if (!ringsKey) return IDLE
  return answer.key === key ? { status: answer.status, scene: answer.scene } : LOADING
}
