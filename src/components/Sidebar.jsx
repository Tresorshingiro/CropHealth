import ThemeToggle from '../theme/ThemeToggle.jsx'
import BrandMark from './BrandMark.jsx'
import DistrictList from './DistrictList.jsx'

const initials = (name) =>
  String(name || '?')
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')

/**
 * Brand, the districts with areas of interest, the parcels opened last, and the account. A fixed column on wide
 * screens; on small ones it slides in over the page when `open`.
 */
export default function Sidebar({ open, hidden, onClose, user, onSignOut, list }) {
  const name = user?.fullName || user?.username

  return (
    <aside
      aria-label="Parcels and account"
      data-open={open}
      // Off-screen on a small display: keep it out of the tab order too.
      inert={hidden}
      className={`fixed inset-y-0 left-0 z-40 flex w-64 max-w-[88vw] flex-col border-r border-line bg-surface transition-transform duration-300 motion-reduce:transition-none lg:static lg:z-auto lg:max-w-none lg:translate-x-0 ${
        open ? 'translate-x-0 shadow-float' : '-translate-x-full'
      }`}
    >
      <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <BrandMark />
          <p className="font-display text-[0.9375rem] font-semibold leading-tight tracking-tight">Crop Health Monitoring</p>
        </div>
        <button type="button" className="icon-btn lg:hidden" onClick={onClose} aria-label="Close menu">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-2">
        <DistrictList {...list} />
      </div>

      <div className="mt-3 flex items-center gap-3 border-t border-line px-4 py-3">
        <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-raised text-xs font-semibold text-ink-2">
          {initials(name)}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
        <ThemeToggle />
        <button type="button" className="icon-btn" onClick={onSignOut} aria-label="Sign out" title="Sign out">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
          </svg>
        </button>
      </div>
    </aside>
  )
}
