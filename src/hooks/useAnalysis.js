import { useCallback, useEffect, useRef, useState } from 'react'
import { getAnalysis, startAnalysis } from '../api/analysis.js'
import { SessionExpiredError } from '../api/arcgis.js'

const IDLE = { id: null, status: 'idle', message: null }
const TOO_LONG = 'The analysis is taking longer than usual. Check the parcel again in a few minutes.'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * One run of the GIS team's analysis at a time: start it for a parcel
 * `{ upi }` or a drawn field `{ area: { rings }, name }`, check on it every
 * `interval` ms, and call `onDone(id)` once its rows are written. `id` is
 * the row the run writes: the UPI, or `AREA <name>`.
 * Job: `{ id, status: 'idle' | 'running' | 'succeeded' | 'failed', message }`.
 */
export function useAnalysis({ expire, onDone, interval = 4000, limit = 10 * 60 * 1000 }) {
  const [job, setJob] = useState(IDLE)
  // Each run has a number; a newer run, or leaving the page, retires the older one.
  const runRef = useRef(0)
  const onDoneRef = useRef(onDone)
  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])
  useEffect(() => () => {
    runRef.current += 1
  }, [])

  const start = useCallback(
    async (input) => {
      const id = input.upi ?? `AREA ${input.name}`
      runRef.current += 1
      const run = runRef.current
      const current = () => runRef.current === run
      const fail = (message) => {
        if (current()) setJob({ id, status: 'failed', message })
      }
      setJob({ id, status: 'running', message: null })
      try {
        let answer = await startAnalysis(input)
        const began = Date.now()
        while (answer.status === 'running') {
          await sleep(interval)
          if (!current()) return
          if (Date.now() - began > limit) return fail(TOO_LONG)
          answer = await getAnalysis(answer.jobId)
        }
        if (!current()) return
        if (answer.status === 'succeeded') {
          setJob({ id, status: 'succeeded', message: null })
          onDoneRef.current?.(id)
        } else {
          fail(answer.message || 'The analysis did not finish.')
        }
      } catch (err) {
        if (err instanceof SessionExpiredError) return expire()
        fail(err?.message || 'The analysis could not be started.')
      }
    },
    [expire, interval, limit],
  )

  return { job, start }
}
