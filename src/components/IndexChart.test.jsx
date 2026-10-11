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

  it('counts and lists only the dates in the period', async () => {
    const range = { from: Date.UTC(2025, 7, 20), to: Date.UTC(2025, 8, 1) - 1 }
    renderChart({ status: 'ready', observations: ROWS, range })
    expect(screen.getByText(/1 clear date/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Table' }))
    expect(screen.getAllByRole('row').slice(1)).toHaveLength(1)
    expect(screen.getByRole('table')).toHaveTextContent('24 Aug 2025')
  })

  it('says when no clear date falls in the period', () => {
    renderChart({ status: 'ready', observations: ROWS, range: { from: Date.UTC(2026, 0, 1), to: Date.UTC(2026, 1, 1) - 1 } })
    expect(screen.getByText('No clear dates in this period')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Table' })).toBeNull()
  })

  it('picks a date for the map image from the table, and goes back to the latest', async () => {
    const onImageDate = vi.fn()
    const { rerender } = renderChart({ status: 'ready', observations: ROWS, onImageDate })
    await userEvent.click(screen.getByRole('button', { name: 'Table' }))
    await userEvent.click(screen.getByRole('button', { name: '24 Aug 2025' }))
    expect(onImageDate).toHaveBeenCalledWith(1755993600000)
    expect(screen.queryByRole('button', { name: 'Latest in range' })).toBeNull()

    rerender(
      <ThemeProvider>
        <IndexChart status="ready" observations={ROWS} error={null} onRetry={noop} onImageDate={onImageDate} imageDate={1755993600000} />
      </ThemeProvider>,
    )
    expect(screen.getByRole('button', { name: '24 Aug 2025' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Latest in range' }))
    expect(onImageDate).toHaveBeenLastCalledWith(null)
  })

  it('draws the lines it is given, with one table column each, and extra actions', async () => {
    const lines = [{ key: 'p0', name: '5/05/10/02/1939', short: '5/05/10/02/1939', color: '#000000' }]
    renderChart({
      status: 'ready',
      observations: [{ date: 1754265600000, p0: 0.512 }],
      lines,
      title: 'NDVI by plot',
      actions: <button type="button">extra</button>,
    })
    expect(screen.getByRole('heading', { name: 'NDVI by plot' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'extra' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Table' }))
    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['Date', '5/05/10/02/1939'])
    const cells = within(screen.getAllByRole('row')[1]).getAllByRole('cell').map((cell) => cell.textContent)
    expect(cells).toEqual(['4 Aug 2025', '0.51'])
  })

  it('shows a toolbar under its title', () => {
    renderChart({ status: 'ready', observations: ROWS, toolbar: <button type="button">period</button> })
    expect(screen.getByRole('button', { name: 'period' })).toBeInTheDocument()
  })

  it('shows the error with a retry button', async () => {
    const onRetry = vi.fn()
    renderChart({ status: 'error', error: 'Invalid query', onRetry })
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid query')
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
