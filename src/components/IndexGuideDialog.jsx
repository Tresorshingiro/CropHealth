import { useEffect, useRef } from 'react'

const Section = ({ label, children }) =>
  children ? (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-2">{label}</dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  ) : null

export default function IndexGuideDialog({ code, entries, error, onClose }) {
  const closeRef = useRef(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const entry = entries?.find((item) => item.code === code) ?? null

  let body
  if (error) {
    body = (
      <p role="alert" className="text-sm text-danger">
        {error}
      </p>
    )
  } else if (!entries) {
    body = (
      <p role="status" className="text-sm text-ink-2">
        Loading…
      </p>
    )
  } else if (!entry) {
    body = <p className="text-sm text-ink-2">{`No guide entry for ${code}.`}</p>
  } else {
    body = (
      <>
        {entry.meaning && <p className="text-sm">{entry.meaning}</p>}
        <dl className="mt-4 space-y-3">
          <Section label="How to read">{entry.howToRead}</Section>
          <Section label="Levels">{entry.thresholds}</Section>
          <Section label="Keep in mind">{entry.caveats}</Section>
          <Section label="Formula">{[entry.formula, entry.bands].filter(Boolean).join(' · ')}</Section>
          <Section label="Reference">{entry.reference}</Section>
        </dl>
      </>
    )
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-title"
        className="panel max-h-[85vh] w-full max-w-lg overflow-y-auto p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-4">
          <h2 id="guide-title" className="text-base font-semibold">
            {entry?.name || code}
          </h2>
          <button ref={closeRef} type="button" className="btn-ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {body}
      </div>
    </div>
  )
}
