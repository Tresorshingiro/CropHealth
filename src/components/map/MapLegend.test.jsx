import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import MapLegend from './MapLegend.jsx'

const SETTINGS = { basemap: 'satellite', sentinel: 'none', opacity: 1, analysed: true, land: true }

function renderLegend(props = {}) {
  const onToggle = vi.fn()
  const view = render(
    <MapLegend open settings={SETTINGS} hasSelected={false} onToggle={onToggle} {...props} />,
  )
  return { onToggle, ...view }
}

describe('MapLegend', () => {
  it('is a button that opens and closes the legend', async () => {
    const { onToggle, rerender } = renderLegend({ open: false })
    const button = screen.getByRole('button', { name: 'Legend' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Analysed parcel')).toBeNull()
    await userEvent.click(button)
    expect(onToggle).toHaveBeenCalledTimes(1)
    rerender(<MapLegend open settings={SETTINGS} hasSelected={false} onToggle={onToggle} />)
    expect(screen.getByRole('button', { name: 'Legend' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('names the outlines that are on the map', () => {
    const { rerender } = renderLegend({ hasSelected: true })
    expect(screen.getByText('Analysed parcel')).toBeInTheDocument()
    expect(screen.getByText('Selected')).toBeInTheDocument()
    expect(screen.getByText('Land parcel (NLA)')).toBeInTheDocument()
    expect(screen.getByText('shown when zoomed in')).toBeInTheDocument()

    rerender(<MapLegend open settings={{ ...SETTINGS, analysed: false, land: false }} hasSelected={false} onToggle={() => {}} />)
    expect(screen.queryByText('Analysed parcel')).toBeNull()
    expect(screen.queryByText('Selected')).toBeNull()
    expect(screen.queryByText('Land parcel (NLA)')).toBeNull()
  })

  it('draws the NDVI colour scale from -1 to 1 with what each end means', () => {
    renderLegend({ settings: { ...SETTINGS, sentinel: 'ndvi' } })
    const scale = screen.getByRole('img', { name: 'NDVI colour scale from -1 to 1, Bare or sparse to Dense green' })
    expect(scale.style.backgroundImage).toMatch(/^linear-gradient/)
    expect(screen.getByText('Bare or sparse')).toBeInTheDocument()
    expect(screen.getByText('Dense green')).toBeInTheDocument()
    expect(screen.getByText('-1')).toBeInTheDocument()
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('draws the NDMI scale for NDMI', () => {
    renderLegend({ settings: { ...SETTINGS, sentinel: 'ndmi' } })
    expect(screen.getByRole('img', { name: 'NDMI colour scale from -1 to 1, Dry to Moist' })).toBeInTheDocument()
  })

  it('describes the natural-colour picture, which has no scale', () => {
    renderLegend({ settings: { ...SETTINGS, sentinel: 'natural' } })
    expect(screen.getByText('Natural colour')).toBeInTheDocument()
    expect(screen.getByText('Recent Sentinel-2 picture, 10 m pixels')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /colour scale/ })).toBeNull()
  })
})
