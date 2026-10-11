// A leaf: the app's mark in the sidebar, on the sign-in page and as the tab icon (public/favicon.svg).
export const LEAF = 'M12 21v-9M12 12c0-4 2.5-7 7-7 0 4.5-3 7-7 7zM12 15c0-3-2-5.5-6-5.5 0 3.5 2.5 5.5 6 5.5z'

export default function BrandMark({ className = 'h-9 w-9' }) {
  return (
    <span aria-hidden="true" className={`grid shrink-0 place-items-center rounded-xl bg-accent text-accent-ink ${className}`}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={LEAF} />
      </svg>
    </span>
  )
}
