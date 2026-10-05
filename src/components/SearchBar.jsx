import { useState } from 'react'
import { parseParcelId, UPI_FORMAT_MESSAGE } from '../lib/upi.js'

// A drawn area's id (AREA …) is accepted too; the message names only the UPI,
// which is what people type.
const formatError = (text) => (text && !parseParcelId(text) ? UPI_FORMAT_MESSAGE : null)

/** The UPI search: field and Run, with recently opened parcels offered while the field has focus. */
export default function SearchBar({ selected = '', history, onSubmit }) {
  const [value, setValue] = useState(selected)
  const [error, setError] = useState(formatError(selected))
  const [recentOpen, setRecentOpen] = useState(false)

  // Follow the selection when it changes elsewhere (map, list, link, back).
  const [seen, setSeen] = useState(selected)
  if (selected !== seen) {
    setSeen(selected)
    setValue(selected)
    setError(formatError(selected))
  }

  const submit = (event) => {
    event.preventDefault()
    const upi = parseParcelId(value)
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
      className="relative w-full max-w-xl"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setRecentOpen(false)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setRecentOpen(false)
      }}
    >
      <form
        role="search"
        onSubmit={submit}
        noValidate
        className={`flex items-center gap-2 rounded-xl border bg-page py-1 pl-3 pr-1 transition focus-within:border-accent ${
          error ? 'border-danger' : 'border-line'
        }`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="shrink-0 text-ink-2">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
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
          className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-ink placeholder:text-muted focus:outline-none"
        />
        <button type="submit" className="btn-primary rounded-lg px-5 py-1.5">
          Run
        </button>
      </form>

      {/* Both float below the field so the header keeps its height. */}
      {error && (
        <p id="upi-error" role="alert" className="panel absolute inset-x-0 top-full z-20 mt-2 px-4 py-2 text-sm text-danger shadow-float">
          {error}
        </p>
      )}

      {!error && recentOpen && history.length > 0 && (
        <div className="panel absolute inset-x-0 top-full z-20 mt-2 p-2 shadow-float">
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
