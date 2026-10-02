import { useEffect, useRef } from 'react'
import ParcelsTable from './ParcelsTable.jsx'

/** The analysed-parcels list, sliding in from the left over the map. */
export default function ParcelsDrawer({ onClose, ...table }) {
  const closeRef = useRef(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const count = table.status === 'ready' ? table.parcels.length : null

  return (
    <div className="absolute inset-0 z-30" onClick={onClose}>
      <div
        role="dialog"
        aria-labelledby="parcels-title"
        onClick={(event) => event.stopPropagation()}
        className="absolute inset-y-0 left-0 flex border-r border-line bg-surface w-[24rem] max-w-[92vw] animate-slide-in-left flex-col gap-4 rounded-r-3xl p-5 shadow-float motion-reduce:animate-none"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <h2 id="parcels-title" className="font-display text-lg font-semibold tracking-tight">
              Analysed parcels
            </h2>
            {count !== null && <span className="text-sm text-ink-2">{count}</span>}
          </div>
          <button ref={closeRef} type="button" className="icon-btn" onClick={onClose} aria-label="Close list">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <ParcelsTable {...table} />
      </div>
    </div>
  )
}
