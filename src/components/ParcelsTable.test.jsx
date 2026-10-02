import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ParcelsTable from './ParcelsTable.jsx'

const PARCELS = [
  { upi: '5/05/10/02/2206', district: 'Kirehe', ndviLevel: 'bare ground', latestDate: 1, rings: null },
  { upi: '5/02/06/06/1702', district: 'Nyagatare', ndviLevel: 'very sparse cover', latestDate: 1, rings: null },
  { upi: '5/04/08/04/1948', district: 'Kayonza', ndviLevel: null, latestDate: 1, rings: null },
]

const noop = () => {}

function renderTable(props) {
  return render(
    <ParcelsTable
      status="ready"
      parcels={PARCELS}
      truncated={false}
      selectedUpi={null}
      error={null}
      onSelect={noop}
      onRetry={noop}
      {...props}
    />,
  )
}

const column = (index) =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[index].textContent)

describe('ParcelsTable', () => {
  it('lists parcels sorted by UPI, with a dash for a missing level', () => {
    renderTable()
    expect(column(0)).toEqual(['5/02/06/06/1702', '5/04/08/04/1948', '5/05/10/02/2206'])
    expect(column(2)).toEqual(['very sparse cover', '–', 'bare ground'])
  })

  it('sorts by a column and reverses on a second press', async () => {
    renderTable()
    await userEvent.click(screen.getByRole('button', { name: 'District' }))
    expect(column(1)).toEqual(['Kayonza', 'Kirehe', 'Nyagatare'])
    expect(screen.getByRole('columnheader', { name: 'District' })).toHaveAttribute('aria-sort', 'ascending')
    await userEvent.click(screen.getByRole('button', { name: 'District' }))
    expect(column(1)).toEqual(['Nyagatare', 'Kirehe', 'Kayonza'])
    expect(screen.getByRole('columnheader', { name: 'District' })).toHaveAttribute('aria-sort', 'descending')
  })

  it('selects a parcel and marks the selected row', async () => {
    const onSelect = vi.fn()
    renderTable({ onSelect, selectedUpi: '5/04/08/04/1948' })
    await userEvent.click(screen.getByRole('button', { name: '5/05/10/02/2206' }))
    expect(onSelect).toHaveBeenCalledWith('5/05/10/02/2206')
    expect(screen.getByRole('button', { name: '5/04/08/04/1948' }).closest('tr')).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('button', { name: '5/05/10/02/2206' }).closest('tr')).not.toHaveAttribute('aria-current')
  })

  it('says when the list was cut short', () => {
    renderTable({ truncated: true })
    expect(screen.getByText('Showing the first 3 parcels. Search by UPI to open any other.')).toBeInTheDocument()
  })

  it('shows loading, empty and error states', async () => {
    const onRetry = vi.fn()
    const { rerender } = renderTable({ status: 'loading', parcels: [] })
    expect(screen.getByRole('status')).toHaveTextContent('Loading parcels…')

    rerender(
      <ParcelsTable status="ready" parcels={[]} truncated={false} selectedUpi={null} error={null} onSelect={noop} onRetry={noop} />,
    )
    expect(screen.getByText('No analysed parcels yet.')).toBeInTheDocument()

    rerender(
      <ParcelsTable status="error" parcels={[]} truncated={false} selectedUpi={null} error="Invalid query" onSelect={noop} onRetry={onRetry} />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid query')
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
