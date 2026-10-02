import { useState } from 'react'
import { parseUpi, UPI_FORMAT_MESSAGE } from '../lib/upi.js'

const formatError = (text) => (text && !parseUpi(text) ? UPI_FORMAT_MESSAGE : null)

/**
 * The floating search pill: parcels-list button, UPI field and Run, with the
 * recently opened parcels offered while the field has focus.
 */
export default function SearchBar({ selected = '', history, onSubmit, onOpenParcels }) {
  const [value, setValue] = useState(selected)
  const [error, setError] = useState(formatError(selected))
  const [recentOpen, setRecentOpen] = useState(false)

  // Follow the selection when it changes elsewhere (map, list, link, close).
  const [seen, setSeen] = useState(selected)
  if (selected !== seen) {
    setSeen(selected)
    setValue(selected)
    setError(formatError(selected))
  }

  const submit = (event) => {
    event.preventDefault()
    const upi = parseUpi(value)
    if (!upi) {
      setError(UPI_FORMAT_MESSAGE)
      return
    }
    setError(null)
    setValue(upi)
    setRecentOpen(false)
    onSubmit(upi)
  }

  return (
    <div
      className="relative w-full max-w-md"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setRecentOpen(false)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setRecentOpen(false)
      }}
    >
      <form role="search" onSubmit={submit} noValidate className="glass flex items-center gap-1 rounded-full p-1.5 shadow-float">
        <button type="button" onClick={onOpenParcels} aria-label="Analysed parcels" className="icon-btn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 6h16M4 12h16M4 18h10" />
          </svg>
        </button>
        <label htmlFor="upi" className="sr-only">
          UPI
        </label>
        <input
          id="upi"
          name="upi"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          spellCheck="false"
          placeholder="Search a UPI, e.g. 5/05/10/02/1939"
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? 'upi-error' : undefined}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onFocus={() => setRecentOpen(true)}
          // A field that already has focus gets no focus event on a second click.
          onClick={() => setRecentOpen(true)}
          className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-sm text-ink placeholder:text-muted focus:outline-none"
        />
        <button type="submit" className="btn-primary rounded-full px-5">
          Run
        </button>
      </form>

      {error && (
        <p id="upi-error" role="alert" className="glass mt-2 rounded-2xl px-4 py-2 text-sm text-danger shadow-float">
          {error}
        </p>
      )}

      {recentOpen && history.length > 0 && (
        <div className="glass absolute inset-x-0 top-full z-10 mt-2 rounded-2xl p-2 shadow-float">
          <p className="px-2 pb-1 pt-0.5 text-xs font-medium text-ink-2">Recent parcels</p>
          <ul>
            {history.map((upi) => (
              <li key={upi}>
                <button
                  type="button"
                  onClick={() => {
                    setRecentOpen(false)
                    onSubmit(upi)
                  }}
                  className="w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-raised"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {upi}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
