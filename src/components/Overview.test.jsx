import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Overview from './Overview.jsx'

const parcel = (upi, district, latestDate) => ({ upi, district, latestDate, rings: null })

const PARCELS = [
  parcel('5/05/10/02/1939', 'Kirehe', 1790294400000),
  parcel('5/05/10/02/2206', 'Kirehe', 1789862400000),
  parcel('5/02/06/06/1702', 'Nyagatare', 1754265600000),
  parcel('5/04/08/04/1948', 'Kayonza', null),
  parcel('AREA North field', null, null),
]

const stat = (label) => screen.getByText(label).closest('div')

describe('Overview', () => {
  it('summarises the analysed parcels', () => {
    render(<Overview status="ready" parcels={PARCELS} truncated={false} />)
    expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument()
    expect(screen.getByText('Search a UPI, pick a parcel on the map, or choose one from the list.')).toBeInTheDocument()
    expect(stat('Parcels analysed')).toHaveTextContent('5')
    expect(stat('Districts')).toHaveTextContent('3')
    expect(stat('Latest clear view')).toHaveTextContent('25 Sep 2026')
  })

  it('counts parcels by district, largest first, then by name, with parcels that have none last', () => {
    render(<Overview status="ready" parcels={PARCELS} truncated={false} />)
    const rows = within(screen.getByRole('list', { name: 'Parcels by district' })).getAllByRole('listitem')
    expect(rows.map((row) => row.textContent)).toEqual(['Kirehe2', 'Kayonza1', 'Nyagatare1', 'No district1'])
  })

  it('says when the counts cover only part of the layer', () => {
    render(<Overview status="ready" parcels={PARCELS} truncated />)
    expect(screen.getByText('Counts cover the first 5 parcels.')).toBeInTheDocument()
  })

  it('shows dashes, not zeros or NaN, when there is nothing to count', () => {
    const { container } = render(<Overview status="ready" parcels={[]} truncated={false} />)
    expect(stat('Parcels analysed')).toHaveTextContent('0')
    expect(stat('Districts')).toHaveTextContent('0')
    expect(stat('Latest clear view')).toHaveTextContent('–')
    expect(screen.queryByRole('list', { name: 'Parcels by district' })).toBeNull()
    expect(container.textContent).not.toMatch(/NaN|Invalid|undefined|-Infinity/)
  })

  it('shows a loading state and an unavailable state', () => {
    const { rerender } = render(<Overview status="loading" parcels={[]} truncated={false} />)
    expect(screen.getByRole('status', { name: 'Loading overview' })).toBeInTheDocument()
    rerender(<Overview status="error" parcels={[]} truncated={false} />)
    expect(stat('Parcels analysed')).toHaveTextContent('–')
  })
})
