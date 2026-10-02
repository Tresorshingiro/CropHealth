import { useState } from 'react'
import { parseUpi, UPI_FORMAT_MESSAGE } from '../lib/upi.js'

const TABS = [
  ['tools', 'Tools'],
  ['history', 'History'],
]

export default function UpiSearch({ defaultValue = '', history, busy, onSubmit }) {
  const [tab, setTab] = useState('tools')
  const [value, setValue] = useState(defaultValue)
  const [error, setError] = useState(defaultValue && !parseUpi(defaultValue) ? UPI_FORMAT_MESSAGE : null)

  const submit = (event) => {
    event.preventDefault()
    const upi = parseUpi(value)
    if (!upi) {
      setError(UPI_FORMAT_MESSAGE)
      return
    }
    setError(null)
    setValue(upi)
    onSubmit(upi)
  }

  return (
    <section className="panel flex flex-col" aria-label="Find a parcel">
      <div role="tablist" className="grid grid-cols-2 border-b border-line">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            onClick={() => setTab(id)}
            className={`border-b-2 px-4 py-3 text-sm font-semibold ${
              tab === id ? 'border-accent text-ink' : 'border-transparent text-ink-2 hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'tools' ? (
        <form role="tabpanel" id="panel-tools" aria-labelledby="tab-tools" onSubmit={submit} noValidate className="space-y-3 p-4">
          <div className="space-y-1">
            <label htmlFor="upi" className="text-sm font-medium">
              UPI
            </label>
            <input
              id="upi"
              name="upi"
              type="text"
              className="field"
              inputMode="numeric"
              autoComplete="off"
              spellCheck="false"
              placeholder="5/05/10/02/1939"
              aria-invalid={error ? 'true' : undefined}
              aria-describedby={error ? 'upi-error' : undefined}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            {error && (
              <p id="upi-error" role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
          </div>
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            Run
          </button>
        </form>
      ) : (
        <div role="tabpanel" id="panel-history" aria-labelledby="tab-history" className="p-4">
          {history.length === 0 ? (
            <p className="text-sm text-ink-2">No parcels opened yet.</p>
          ) : (
            <ul className="space-y-1">
              {history.map((upi) => (
                <li key={upi}>
                  <button
                    type="button"
                    onClick={() => onSubmit(upi)}
                    className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-raised"
                  >
                    {upi}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
