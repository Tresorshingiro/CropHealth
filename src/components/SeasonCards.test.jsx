import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '../theme/ThemeContext.jsx'
import SeasonCards from './SeasonCards.jsx'

const GUIDE = {
  entries: [{ code: 'NDVI', thresholds: 'below 0.20 bare; 0.20-0.35 very sparse; 0.35-0.55 growing; 0.55-0.75 full canopy; above 0.75 dense' }],
  error: null,
}
const ROWS = [
  { date: Date.UTC(2025, 9, 20), ndvi: 0.3, ndmi: 0, ndre: 0.2 },
  { date: Date.UTC(2026, 3, 10), ndvi: 0.6, ndmi: 0.1, ndre: 0.3 },
  { date: Date.UTC(2026, 4, 10), ndvi: 0.4, ndmi: 0, ndre: 0.2 },
  { date: Date.UTC(2026, 6, 15), ndvi: 0.15, ndmi: -0.2, ndre: 0.1 },
]
const NOW = Date.UTC(2026, 9, 7)
const B = { from: Date.UTC(2026, 2, 1), to: Date.UTC(2026, 6, 1) - 1 }

function renderCards(props = {}) {
  const onSelect = vi.fn()
  const view = render(
    <ThemeProvider>
      <SeasonCards observations={ROWS} range={null} onSelect={onSelect} guide={GUIDE} now={NOW} {...props} />
    </ThemeProvider>,
  )
  return { onSelect, ...view }
}

describe('SeasonCards', () => {
  it('shows every season with readings, oldest first, named by the year it starts, with averages and verdicts', () => {
    renderCards()
    const cards = screen.getAllByRole('button', { name: /^Season / })
    expect(cards.map((c) => c.textContent)).toEqual([
      expect.stringContaining('Season A 2025-2026'),
      expect.stringContaining('Season B 2026'),
      expect.stringContaining('Season C 2026'),
    ])
    expect(cards[0]).toHaveTextContent('Sep – Feb')
    expect(cards[1]).toHaveTextContent('Mar – Jun')
    expect(cards[1]).toHaveTextContent('2 clear dates')
    expect(screen.getByTestId('2026B-NDVI')).toHaveTextContent('0.50')
    expect(screen.getByTestId('2026B-NDVI')).toHaveTextContent('Moderate')
    expect(screen.getByTestId('2026C-NDVI')).toHaveTextContent('Poor')
    expect(screen.queryByText('In progress')).toBeNull()
  })

  it('sets the period to a season when its card is clicked, and marks it', async () => {
    const { onSelect, rerender } = renderCards()
    await userEvent.click(screen.getByRole('button', { name: /^Season B 2026/ }))
    expect(onSelect).toHaveBeenCalledWith(B)
    rerender(
      <ThemeProvider>
        <SeasonCards observations={ROWS} range={B} onSelect={onSelect} guide={GUIDE} now={NOW} />
      </ThemeProvider>,
    )
    expect(screen.getByRole('button', { name: /^Season B 2026/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /^Season C 2026/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('marks the season in progress', () => {
    renderCards({ now: Date.UTC(2026, 6, 20) })
    expect(screen.getByRole('button', { name: /^Season C 2026/ })).toHaveTextContent('In progress')
  })

  it('says so when no season has readings', () => {
    renderCards({ observations: [] })
    expect(screen.getByText('No clear dates in the last seasons')).toBeInTheDocument()
  })
})
