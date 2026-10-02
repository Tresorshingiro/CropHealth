import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ParcelList from './ParcelList.jsx'

const PARCELS = [
  { upi: '5/05/10/02/2206', district: 'Kirehe', ndviLevel: 'bare ground', latestDate: 1, rings: null },
  { upi: '5/02/06/06/1702', district: 'Nyagatare', ndviLevel: 'very sparse cover', latestDate: 1, rings: null },
  { upi: '5/04/08/04/1948', district: 'Kayonza', ndviLevel: null, latestDate: 1, rings: null },
]

const noop = () => {}

function renderList(props) {
  return render(
    <ParcelList
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

const upis = () => screen.getAllByTestId('upi').map((node) => node.textContent)
const details = () => screen.getAllByTestId('detail').map((node) => node.textContent)

describe('ParcelList', () => {
  it('lists parcels by UPI with their district and level', () => {
    renderList()
    expect(upis()).toEqual(['5/02/06/06/1702', '5/04/08/04/1948', '5/05/10/02/2206'])
    expect(details()).toEqual(['Nyagatare · very sparse cover', 'Kayonza', 'Kirehe · bare ground'])
  })

  it('sorts by the chosen field and reverses', async () => {
    renderList()
    await userEvent.selectOptions(screen.getByLabelText('Sort parcels by'), 'District')
    expect(upis()).toEqual(['5/04/08/04/1948', '5/05/10/02/2206', '5/02/06/06/1702'])
    const reverse = screen.getByRole('button', { name: 'Reverse order' })
    expect(reverse).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(reverse)
    expect(reverse).toHaveAttribute('aria-pressed', 'true')
    expect(upis()).toEqual(['5/02/06/06/1702', '5/05/10/02/2206', '5/04/08/04/1948'])
  })

  it('selects a parcel and marks the selected one', async () => {
    const onSelect = vi.fn()
    renderList({ onSelect, selectedUpi: '5/04/08/04/1948' })
    await userEvent.click(screen.getByRole('button', { name: /5\/05\/10\/02\/2206/ }))
    expect(onSelect).toHaveBeenCalledWith('5/05/10/02/2206')
    expect(screen.getByRole('button', { name: /5\/04\/08\/04\/1948/ })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('button', { name: /5\/05\/10\/02\/2206/ })).not.toHaveAttribute('aria-current')
  })

  it('filters by UPI, district or level', async () => {
    renderList()
    const filter = screen.getByLabelText('Filter parcels')
    await userEvent.type(filter, 'kay')
    expect(upis()).toEqual(['5/04/08/04/1948'])
    await userEvent.clear(filter)
    await userEvent.type(filter, ' SPARSE ')
    expect(upis()).toEqual(['5/02/06/06/1702'])
    await userEvent.clear(filter)
    await userEvent.type(filter, '10/02')
    expect(upis()).toEqual(['5/05/10/02/2206'])
    await userEvent.clear(filter)
    await userEvent.type(filter, 'zzz')
    expect(screen.getByText('No parcels match.')).toBeInTheDocument()
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('says when the list was cut short', () => {
    renderList({ truncated: true })
    expect(screen.getByText('Showing the first 3 parcels. Search by UPI to open any other.')).toBeInTheDocument()
  })

  it('shows loading, empty and error states', async () => {
    const onRetry = vi.fn()
    const base = { truncated: false, selectedUpi: null, onSelect: noop }
    const { rerender } = renderList({ status: 'loading', parcels: [] })
    expect(screen.getByRole('status')).toHaveTextContent('Loading parcels…')

    rerender(<ParcelList {...base} status="ready" parcels={[]} error={null} onRetry={noop} />)
    expect(screen.getByText('No analysed parcels yet.')).toBeInTheDocument()

    rerender(<ParcelList {...base} status="error" parcels={[]} error="Invalid query" onRetry={onRetry} />)
    expect(within(screen.getByRole('alert')).getByText('Invalid query')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
