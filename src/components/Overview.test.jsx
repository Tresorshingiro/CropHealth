import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Overview, { NeedsAttention } from './Overview.jsx'

const BANDS = 'below 0.20 bare; 0.20-0.35 very sparse; 0.35-0.55 growing; 0.55-0.75 full canopy; above 0.75 dense'
const GUIDE = { entries: ['NDVI', 'NDMI', 'NDRE'].map((code) => ({ code, thresholds: BANDS })), error: null }
const NO_GUIDE = { entries: null, error: 'Invalid query' }

const parcel = (upi, district, latestDate, ndvi, ndmi, ndre) => ({ upi, district, latestDate, ndvi, ndmi, ndre, rings: null })
const PARCELS = [
  parcel('5/05/10/02/1939', 'Kirehe', 1790294400000, 0.6, -0.21, 0.6), // poor: NDMI
  parcel('5/05/10/02/2206', 'Kirehe', 1789862400000, 0.62, 0.6, 0.7), // good
  parcel('5/02/06/06/1702', 'Nyagatare', 1754265600000, 0.45, 0.6, 0.6), // moderate: NDVI
  parcel('5/04/08/04/1948', 'Kayonza', null, 0.8, 0.8, 0.8), // good
  parcel('AREA North field', null, null, null, null, null), // not rated
]

const tile = (label) => screen.getByText(label).closest('div')

describe('Overview', () => {
  it('leads with crop health across the analysed parcels', () => {
    render(<Overview status="ready" parcels={PARCELS} truncated={false} guide={GUIDE} />)
    expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument()
    const strip = screen.getByRole('group', { name: 'Crop health summary' })
    expect(within(strip).getByText('Areas of interest').closest('div')).toHaveTextContent('5')
    // Beside the title, so the summary stays one line.
    expect(screen.getByText('3 districts · latest 25 Sep 2026')).toBeInTheDocument()
    expect(tile('Good')).toHaveTextContent('2')
    expect(tile('Moderate')).toHaveTextContent('1')
    expect(tile('Poor')).toHaveTextContent('1')
    expect(screen.getByText('1 not rated')).toBeInTheDocument()
    // No colour bar under the strip: the counts say it.
    expect(within(strip).queryByRole('img')).toBeNull()
  })

  it('still counts parcels when health cannot be rated, and says why', () => {
    const { container } = render(<Overview status="ready" parcels={PARCELS} truncated={false} guide={NO_GUIDE} />)
    expect(within(screen.getByRole('group', { name: 'Crop health summary' })).getByText('Areas of interest').closest('div')).toHaveTextContent('5')
    expect(screen.getByText("Health can't be rated: the index guide didn't load.")).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/NaN|undefined/)
  })

  it('says when the counts cover only part of the layer', () => {
    render(<Overview status="ready" parcels={PARCELS} truncated guide={GUIDE} />)
    expect(screen.getByText('Counts cover the first 5 parcels.')).toBeInTheDocument()
  })

  it('shows no NaN and says so when nothing is analysed yet', () => {
    const { container } = render(<Overview status="ready" parcels={[]} truncated={false} guide={GUIDE} />)
    expect(screen.getByText('No areas of interest yet.')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/NaN|Invalid|undefined|-Infinity/)
  })

  it('shows a loading state', () => {
    render(<Overview status="loading" parcels={[]} truncated={false} guide={GUIDE} />)
    expect(screen.getByRole('status', { name: 'Loading overview' })).toBeInTheDocument()
  })

  it('filters by a health chip, and clears the filter when the same chip is picked again', async () => {
    const onFilter = vi.fn()
    const { rerender } = render(
      <Overview status="ready" parcels={PARCELS} truncated={false} guide={GUIDE} filter={null} onFilter={onFilter} />,
    )
    const chip = (name) => screen.getByRole('button', { name: new RegExp(name) })
    expect(chip('Poor')).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(chip('Poor'))
    expect(onFilter).toHaveBeenLastCalledWith('poor')
    await userEvent.click(chip('Areas of interest'))
    expect(onFilter).toHaveBeenLastCalledWith('all')

    rerender(<Overview status="ready" parcels={PARCELS} truncated={false} guide={GUIDE} filter="poor" onFilter={onFilter} />)
    expect(chip('Poor')).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(chip('Poor'))
    expect(onFilter).toHaveBeenLastCalledWith(null)
  })

  it('offers no filter while health cannot be rated', () => {
    render(<Overview status="ready" parcels={PARCELS} truncated={false} guide={NO_GUIDE} onFilter={() => {}} />)
    expect(screen.queryByRole('button', { name: /Poor/ })).toBeNull()
  })
})

describe('NeedsAttention', () => {
  it('lists Poor parcels before Moderate ones, with the index that pulls each down, and opens one', async () => {
    const onSelect = vi.fn()
    render(<NeedsAttention status="ready" parcels={PARCELS} guide={GUIDE} onSelect={onSelect} />)
    const rows = within(screen.getByRole('list', { name: 'Needs attention' })).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('5/05/10/02/1939')
    expect(rows[0]).toHaveTextContent('Kirehe')
    expect(rows[0]).toHaveTextContent('Poor')
    expect(rows[0]).toHaveTextContent('NDMI -0.21')
    expect(rows[0]).toHaveTextContent('25 Sep 2026')
    expect(rows[1]).toHaveTextContent('Moderate')
    expect(rows[1]).toHaveTextContent('NDVI 0.45')
    await userEvent.click(within(rows[1]).getByRole('button'))
    expect(onSelect).toHaveBeenCalledWith('5/02/06/06/1702')
  })

  it('says when no parcel needs attention, or when health cannot be rated', () => {
    const good = PARCELS.filter((p) => p.upi === '5/05/10/02/2206')
    const { rerender } = render(<NeedsAttention status="ready" parcels={good} guide={GUIDE} onSelect={() => {}} />)
    expect(screen.getByText('No parcel needs attention.')).toBeInTheDocument()
    rerender(<NeedsAttention status="ready" parcels={PARCELS} guide={NO_GUIDE} onSelect={() => {}} />)
    expect(screen.getByText("Health can't be rated: the index guide didn't load.")).toBeInTheDocument()
  })

  it('lists only the parcels of the picked verdict, newest reading first', () => {
    render(<NeedsAttention status="ready" parcels={PARCELS} guide={GUIDE} onSelect={() => {}} filter="good" />)
    expect(screen.getByRole('heading', { name: 'Good' })).toBeInTheDocument()
    const rows = within(screen.getByRole('list', { name: 'Good' })).getAllByRole('listitem')
    expect(rows.map((row) => row.textContent.slice(0, 15))).toEqual(['5/05/10/02/2206', '5/04/08/04/1948'])
  })

  it('lists every area, worst first and unrated last, and offers the way back', async () => {
    const onClearFilter = vi.fn()
    render(<NeedsAttention status="ready" parcels={PARCELS} guide={GUIDE} onSelect={() => {}} filter="all" onClearFilter={onClearFilter} />)
    const rows = within(screen.getByRole('list', { name: 'All areas of interest' })).getAllByRole('listitem')
    expect(rows).toHaveLength(5)
    expect(rows[0]).toHaveTextContent('Poor')
    expect(rows[4]).toHaveTextContent('AREA North field')
    expect(rows[4]).toHaveTextContent('Not rated')
    await userEvent.click(screen.getByRole('button', { name: 'Back to needs attention' }))
    expect(onClearFilter).toHaveBeenCalled()
  })

  it('says when no parcel has the picked verdict', () => {
    const good = PARCELS.filter((p) => p.upi === '5/05/10/02/2206')
    render(<NeedsAttention status="ready" parcels={good} guide={GUIDE} onSelect={() => {}} filter="poor" />)
    expect(screen.getByText('No parcel is Poor.')).toBeInTheDocument()
  })
})
