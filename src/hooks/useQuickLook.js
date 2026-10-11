import { useEffect, useState } from 'react'
import { measureParcel } from '../api/sentinel.js'

const IDLE = { status: 'idle', values: null }
const LOADING = { status: 'loading', values: null }

/**
 * NDVI, NDMI and NDRE of a land parcel that has not been analysed, measured
 * from the Sentinel-2 scene the map shows. Status: idle, loading, ready,
 * none / error (no image, passed on from the scene) or failed (measuring).
 */
export function useQuickLook(look, scene) {
  const date = scene.status === 'ready' ? scene.scene.date : null
  const ringsKey = look ? JSON.stringify(look.rings) : ''
  const key = `${ringsKey}|${date}`
  const [answer, setAnswer] = useState({ key: '', ...IDLE })

  useEffect(() => {
    if (!ringsKey || date === null) return undefined
    const controller = new AbortController()
    let active = true
    measureParcel({ rings: JSON.parse(ringsKey), date, signal: controller.signal })
      .then((values) => {
        if (active) setAnswer({ key, status: 'ready', values })
      })
      .catch((err) => {
        if (active && err?.name !== 'AbortError') setAnswer({ key, status: 'failed', values: null })
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [key, ringsKey, date])

  if (!look) return IDLE
  if (scene.status === 'none' || scene.status === 'error') return { status: scene.status, values: null }
  if (date === null) return LOADING
  return answer.key === key ? { status: answer.status, values: answer.values } : LOADING
}
