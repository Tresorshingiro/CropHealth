import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ParcelList from './ParcelList.jsx'

const SEP_25 = 1790294400000
const BANDS = 'below 0.20 bare; 0.20-0.35 very sparse; 0.35-0.55 growing; 0.55-0.75 full canopy; above 0.75 dense'
const GUIDE = { entries: ['NDVI', 'NDMI', 'NDRE'].map((code) => ({ code, thresholds: BANDS })), error: null }

const p = (upi, district, ndvi) => ({ upi, district, latestDate: SEP_25, ndvi, ndmi: 0.6, ndre: 0.6, rings: null })
const PARCELS = [
  p('5/05/10/02/2206', 'Kirehe', 0.6), // good
  p('5/05/10/02/1939', 'Kirehe', 0.1), // poor
  p('5/05/10/02/1920', 'Kirehe', 0.45), // moderate
  p('5/02/06/06/1702', 'Nyagatare', 0.1), // poor
  p('4/05/04/05/2115', 'Gicumbi', 0.63), // good
  { upi: 'AREA North field', district: null, latestDate: null, ndvi: null, ndmi: null, ndre: null, rings: null }, // not rated
]

const noop = () => {}
function renderList(props) {
  return render(
    <ParcelList status="ready" parcels={PARCELS} truncated={false} selectedUpi={null} error={null} onSelect={noop} onRetry={noop} guide={GUIDE} {...props} />,
  )
}
const upis = () => screen.getAllByTestId('upi').map((node) => node.textContent)
const groups = () => screen.getAllByRole('button', { name: /^Show|^Hide/ }).map((b) => b.textContent)

describe('ParcelList', () => {
  it('groups the areas under their district, largest first, Poor first within each', () => {
    renderList()
    expect(groups()).toEqual(['Kirehe3', 'Gicumbi1', 'Nyagatare1', 'No district1'])
    expect(upis()).toEqual([
      '5/05/10/02/1939', '5/05/10/02/1920', '5/05/10/02/2206',
      '4/05/04/05/2115',
      '5/02/06/06/1702',
      'AREA North field',
    ])
    expect(screen.getByRole('button', { name: /5\/05\/10\/02\/1939/ })).toHaveAttribute('title', 'Poor · latest clear view 25 Sep 2026')
  })

  it('filters by health with counted chips', async () => {
    renderList()
    const chips = within(screen.getByRole('group', { name: 'Health' }))
    expect(chips.getAllByRole('button').map((b) => b.textContent)).toEqual(['All6', 'Poor2', 'Moderate1', 'Good2', 'Not rated1'])
    await userEvent.click(chips.getByRole('button', { name: /^Poor/ }))
    expect(chips.getByRole('button', { name: /^Poor/ })).toHaveAttribute('aria-pressed', 'true')
    expect(upis()).toEqual(['5/05/10/02/1939', '5/02/06/06/1702'])
    await userEvent.click(chips.getByRole('button', { name: /^All/ }))
    expect(upis()).toHaveLength(6)
  })

  it('filters by district, and by UPI or district text', async () => {
    renderList()
    await userEvent.selectOptions(screen.getByLabelText('District'), 'Gicumbi')
    expect(upis()).toEqual(['4/05/04/05/2115'])
    await userEvent.selectOptions(screen.getByLabelText('District'), '')
    await userEvent.type(screen.getByLabelText('Filter areas'), 'nyag')
    expect(upis()).toEqual(['5/02/06/06/1702'])
    await userEvent.clear(screen.getByLabelText('Filter areas'))
    await userEvent.type(screen.getByLabelText('Filter areas'), 'zzz')
    expect(screen.getByText('No areas match.')).toBeInTheDocument()
  })

  it('folds and unfolds a district', async () => {
    renderList()
    const kirehe = screen.getByRole('button', { name: /Kirehe/ })
    expect(kirehe).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(kirehe)
    expect(kirehe).toHaveAttribute('aria-expanded', 'false')
    expect(upis()).not.toContain('5/05/10/02/1939')
    await userEvent.click(kirehe)
    expect(upis()).toContain('5/05/10/02/1939')
  })

  it('selects an area and marks the selected one', async () => {
    const onSelect = vi.fn()
    renderList({ onSelect, selectedUpi: '5/02/06/06/1702' })
    await userEvent.click(screen.getByRole('button', { name: /5\/05\/10\/02\/2206/ }))
    expect(onSelect).toHaveBeenCalledWith('5/05/10/02/2206')
    expect(screen.getByRole('button', { name: /5\/02\/06\/06\/1702/ })).toHaveAttribute('aria-current', 'true')
  })

  it('still lists everything, unrated, when the guide is missing', () => {
    renderList({ guide: { entries: null, error: 'Invalid query' } })
    expect(upis()).toHaveLength(6)
    expect(within(screen.getByRole('group', { name: 'Health' })).getAllByRole('button').map((b) => b.textContent)).toEqual(['All6', 'Not rated6'])
  })

  it('says when the list was cut short', () => {
    renderList({ truncated: true })
    expect(screen.getByText('Showing the first 6 areas. Search by UPI to open any other.')).toBeInTheDocument()
  })

  it('shows loading, empty and error states', async () => {
    const onRetry = vi.fn()
    const base = { truncated: false, selectedUpi: null, onSelect: noop, guide: GUIDE }
    const { rerender } = renderList({ status: 'loading', parcels: [] })
    expect(screen.getByRole('status')).toHaveTextContent('Loading areas…')
    rerender(<ParcelList {...base} status="ready" parcels={[]} error={null} onRetry={noop} />)
    expect(screen.getByText('No areas of interest yet.')).toBeInTheDocument()
    rerender(<ParcelList {...base} status="error" parcels={[]} error="Invalid query" onRetry={onRetry} />)
    expect(within(screen.getByRole('alert')).getByText('Invalid query')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
