import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ParcelList from './ParcelList.jsx'

const SEP_25 = 1790294400000
const AUG_4 = 1754265600000

const PARCELS = [
  { upi: '5/05/10/02/2206', district: 'Kirehe', latestDate: SEP_25, rings: null },
  { upi: '5/02/06/06/1702', district: 'Nyagatare', latestDate: AUG_4, rings: null },
  { upi: '5/04/08/04/1948', district: 'Kayonza', latestDate: null, rings: null },
  { upi: 'AREA North field', district: null, latestDate: SEP_25 + 86400000, rings: null },
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
  it('lists parcels by UPI with their district and latest clear view', () => {
    renderList()
    expect(upis()).toEqual(['5/02/06/06/1702', '5/04/08/04/1948', '5/05/10/02/2206', 'AREA North field'])
    expect(details()).toEqual(['Nyagatare · 4 Aug 2025', 'Kayonza', 'Kirehe · 25 Sep 2026', '26 Sep 2026'])
  })

  it('sorts by the chosen field and reverses, with parcels missing that field last either way', async () => {
    renderList()
    await userEvent.selectOptions(screen.getByLabelText('Sort parcels by'), 'District')
    expect(upis()).toEqual(['5/04/08/04/1948', '5/05/10/02/2206', '5/02/06/06/1702', 'AREA North field'])
    const reverse = screen.getByRole('button', { name: 'Reverse order' })
    expect(reverse).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(reverse)
    expect(reverse).toHaveAttribute('aria-pressed', 'true')
    expect(upis()).toEqual(['5/02/06/06/1702', '5/05/10/02/2206', '5/04/08/04/1948', 'AREA North field'])
  })

  it('sorts by latest clear view, newest first, with parcels that have none last either way', async () => {
    renderList()
    await userEvent.selectOptions(screen.getByLabelText('Sort parcels by'), 'Latest clear view')
    expect(upis()).toEqual(['AREA North field', '5/05/10/02/2206', '5/02/06/06/1702', '5/04/08/04/1948'])
    await userEvent.click(screen.getByRole('button', { name: 'Reverse order' }))
    expect(upis()).toEqual(['5/02/06/06/1702', '5/05/10/02/2206', 'AREA North field', '5/04/08/04/1948'])
  })

  it('selects a parcel and marks the selected one', async () => {
    const onSelect = vi.fn()
    renderList({ onSelect, selectedUpi: '5/04/08/04/1948' })
    await userEvent.click(screen.getByRole('button', { name: /5\/05\/10\/02\/2206/ }))
    expect(onSelect).toHaveBeenCalledWith('5/05/10/02/2206')
    expect(screen.getByRole('button', { name: /5\/04\/08\/04\/1948/ })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('button', { name: /5\/05\/10\/02\/2206/ })).not.toHaveAttribute('aria-current')
  })

  it('opens a drawn area like a parcel', async () => {
    const onSelect = vi.fn()
    renderList({ onSelect })
    await userEvent.click(screen.getByRole('button', { name: /AREA North field/ }))
    expect(onSelect).toHaveBeenCalledWith('AREA North field')
  })

  it('filters by UPI or district', async () => {
    renderList()
    const filter = screen.getByLabelText('Filter parcels')
    await userEvent.type(filter, 'kay')
    expect(upis()).toEqual(['5/04/08/04/1948'])
    await userEvent.clear(filter)
    await userEvent.type(filter, ' north ')
    expect(upis()).toEqual(['AREA North field'])
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
    expect(screen.getByText('Showing the first 4 parcels. Search by UPI to open any other.')).toBeInTheDocument()
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
