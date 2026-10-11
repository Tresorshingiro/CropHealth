import { VERDICT_LABELS } from '../lib/verdict.js'

// Good green, Moderate yellow, Poor red: the health dots' colours, from the
// --status-* variables in index.css. The word is always written out, so
// colour is never the only signal.
const TONE = {
  good: 'text-[rgb(var(--status-good))]',
  moderate: 'text-[rgb(var(--status-moderate))]',
  poor: 'text-[rgb(var(--status-poor))]',
}
export const VERDICT_STROKE = {
  good: 'stroke-[rgb(var(--status-good))]',
  moderate: 'stroke-[rgb(var(--status-moderate))]',
  poor: 'stroke-[rgb(var(--status-poor))]',
}

export default function Verdict({ verdict, testId, className = '' }) {
  if (!verdict) return testId ? <span data-testid={testId} /> : null
  return (
    <span data-testid={testId} className={`font-semibold ${TONE[verdict]} ${className}`}>
      {VERDICT_LABELS[verdict]}
    </span>
  )
}
