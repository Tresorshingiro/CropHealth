import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '../theme/ThemeContext.jsx'
import IndexChart from './IndexChart.jsx'

const ROWS = [
  { date: 1754265600000, ndvi: 0.3931, ndmi: -0.0896, ndre: null, clearShare: 1 },
  { date: 1755993600000, ndvi: 0.4959, ndmi: -0.0734, ndre: 0.284, clearShare: 1 },
]

const noop = () => {}

function renderChart(props) {
  return render(
    <ThemeProvider>
      <IndexChart observations={[]} error={null} onRetry={noop} {...props} />
    </ThemeProvider>,
  )
}

describe('IndexChart', () => {
  it('prompts before a parcel is selected', () => {
    renderChart({ status: 'idle' })
    expect(screen.getByText('Select a parcel to see its history.')).toBeInTheDocument()
  })

  it('shows a loading state', () => {
    renderChart({ status: 'loading' })
    expect(screen.getByRole('status', { name: 'Loading history' })).toBeInTheDocument()
  })

  it('says when a parcel has no observations', () => {
    renderChart({ status: 'ready', observations: [] })
    expect(screen.getByText('No clear observations yet')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Table' })).toBeNull()
  })

  it('offers the same numbers as a table, newest first, with a dash for a missing value', async () => {
    const { container } = renderChart({ status: 'ready', observations: ROWS })
    expect(screen.getByText(/2 clear dates/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Table' }))

    const rows = screen.getAllByRole('row').slice(1)
    expect(rows).toHaveLength(2)
    const cells = (row) => within(row).getAllByRole('cell').map((cell) => cell.textContent)
    expect(cells(rows[0])).toEqual(['24 Aug 2025', '0.50', '-0.07', '0.28'])
    expect(cells(rows[1])).toEqual(['4 Aug 2025', '0.39', '-0.09', '–'])
    expect(container.textContent).not.toMatch(/NaN|null|undefined|Invalid/)

    await userEvent.click(screen.getByRole('button', { name: 'Chart' }))
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('shows the error with a retry button', async () => {
    const onRetry = vi.fn()
    renderChart({ status: 'error', error: 'Invalid query', onRetry })
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid query')
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
