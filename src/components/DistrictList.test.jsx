import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import DistrictList from './DistrictList.jsx'

const BANDS = 'below 0.20 bare; 0.20-0.35 very sparse; 0.35-0.55 growing; 0.55-0.75 full canopy; above 0.75 dense'
const GUIDE = { entries: ['NDVI', 'NDMI', 'NDRE'].map((code) => ({ code, thresholds: BANDS })), error: null }
const parcel = (upi, district, v) => ({ upi, district, ndvi: v, ndmi: v, ndre: v })
const PARCELS = [
  parcel('5/05/10/02/1939', 'Kirehe', 0.1), // poor
  parcel('5/05/10/02/2206', 'Kirehe', 0.6), // good
  parcel('5/02/06/06/1702', 'Nyagatare', 0.4), // moderate
]

function renderList(props = {}) {
  const onDistrict = vi.fn()
  const onSelect = vi.fn()
  render(
    <DistrictList
      status="ready"
      parcels={PARCELS}
      guide={GUIDE}
      onDistrict={onDistrict}
      onSelect={onSelect}
      onRetry={() => {}}
      {...props}
    />,
  )
  return { onDistrict, onSelect }
}

const districts = () => within(screen.getByRole('list', { name: 'Districts' })).getAllByRole('button')

describe('DistrictList', () => {
  it('lists the districts, largest first, each with its count and health split', () => {
    renderList()
    expect(districts().map((b) => b.textContent)).toEqual(['All districts3', 'Kirehe2', 'Nyagatare1'])
    expect(screen.getByRole('img', { name: 'Kirehe: Good 1, Moderate 0, Poor 1, Not rated 0' })).toBeInTheDocument()
    expect(districts()[0]).toHaveAttribute('aria-pressed', 'true')
  })

  it('picks a district, and picking it again shows all', async () => {
    const { onDistrict } = renderList()
    await userEvent.click(screen.getByRole('button', { name: /^Kirehe/ }))
    expect(onDistrict).toHaveBeenLastCalledWith('Kirehe')
  })

  it('marks the picked district; picking it again, or All districts, clears it', async () => {
    const { onDistrict } = renderList({ district: 'Kirehe' })
    const kirehe = screen.getByRole('button', { name: /^Kirehe/ })
    expect(kirehe).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /^All districts/ })).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(kirehe)
    expect(onDistrict).toHaveBeenLastCalledWith(null)
    await userEvent.click(screen.getByRole('button', { name: /^All districts/ }))
    expect(onDistrict).toHaveBeenLastCalledWith(null)
  })

  it('shows the last five parcels opened, marks the open one, and opens one', async () => {
    const recent = Array.from({ length: 6 }, (_, i) => `5/05/10/02/${i + 1}`)
    const { onSelect } = renderList({ recent, selectedUpi: recent[1] })
    const items = within(screen.getByRole('list', { name: 'Recent' })).getAllByRole('button')
    expect(items).toHaveLength(5)
    expect(items[1]).toHaveAttribute('aria-current', 'true')
    await userEvent.click(items[2])
    expect(onSelect).toHaveBeenCalledWith(recent[2])
  })

  it('has no recent section before anything is opened', () => {
    renderList()
    expect(screen.queryByRole('heading', { name: 'Recent' })).toBeNull()
  })

  it('shows loading, error with retry, and empty states', async () => {
    const onRetry = vi.fn()
    const { rerender } = render(<DistrictList status="loading" parcels={[]} onDistrict={() => {}} onRetry={onRetry} />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading areas')
    rerender(<DistrictList status="error" error="The GIS service could not answer." parcels={[]} onDistrict={() => {}} onRetry={onRetry} />)
    expect(screen.getByRole('alert')).toHaveTextContent('The GIS service could not answer.')
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalled()
    rerender(<DistrictList status="ready" parcels={[]} onDistrict={() => {}} onRetry={onRetry} />)
    expect(screen.getByText('No areas of interest yet.')).toBeInTheDocument()
  })
})
