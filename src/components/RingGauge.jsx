import { formatIndex } from '../lib/format.js'

const R = 22
const CIRCUMFERENCE = 2 * Math.PI * R

/**
 * A ring whose arc shows where a value sits on its scale (`position`, 0 to 1,
 * or null for no arc), with the value in the middle. The arc takes `arcClass`
 * (a stroke class) or else `color`. `label` names the scale for assistive
 * technology; without it the ring is decoration.
 */
export default function RingGauge({ value, position, color, arcClass = '', label, testId }) {
  const named = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': 'true' }
  return (
    <div className="relative h-14 w-14 shrink-0">
      <svg viewBox="0 0 56 56" className="h-full w-full -rotate-90" data-position={position ?? ''} {...named}>
        <circle cx="28" cy="28" r={R} fill="none" strokeWidth="5" className="stroke-ink/10" />
        {position !== null && (
          <circle
            cx="28"
            cy="28"
            r={R}
            fill="none"
            stroke={arcClass ? undefined : color}
            className={arcClass}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${CIRCUMFERENCE * position} ${CIRCUMFERENCE}`}
          />
        )}
      </svg>
      <span
        data-testid={testId}
        className="absolute inset-0 grid place-items-center text-sm font-semibold"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {formatIndex(value)}
      </span>
    </div>
  )
}
