import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import LayersPanel from './LayersPanel.jsx'

const SETTINGS = { basemap: 'satellite', sentinel: 'none', opacity: 1, analysed: true, land: true }

function renderPanel(settings = {}) {
  const onChange = vi.fn()
  render(<LayersPanel settings={{ ...SETTINGS, ...settings }} onChange={onChange} />)
  return onChange
}

describe('LayersPanel', () => {
  it('shows the current choices', () => {
    renderPanel({ basemap: 'streets', sentinel: 'ndvi' })
    const base = screen.getByRole('radiogroup', { name: 'Base map' })
    expect(within(base).getByRole('radio', { name: /Streets/ })).toBeChecked()
    expect(within(base).getByRole('radio', { name: /Satellite/ })).not.toBeChecked()
    const sentinel = screen.getByRole('radiogroup', { name: 'Sentinel-2 layer' })
    expect(within(sentinel).getByRole('radio', { name: /NDVI/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Analysed parcels' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Land parcels/ })).toBeChecked()
  })

  it('reports a new base map and a new Sentinel-2 layer', async () => {
    const onChange = renderPanel()
    await userEvent.click(screen.getByRole('radio', { name: /Plain/ }))
    expect(onChange).toHaveBeenLastCalledWith({ basemap: 'plain' })
    await userEvent.click(screen.getByRole('radio', { name: /NDMI/ }))
    expect(onChange).toHaveBeenLastCalledWith({ sentinel: 'ndmi' })
  })

  it('reports the outline toggles', async () => {
    const onChange = renderPanel()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Analysed parcels' }))
    expect(onChange).toHaveBeenLastCalledWith({ analysed: false })
    await userEvent.click(screen.getByRole('checkbox', { name: /Land parcels/ }))
    expect(onChange).toHaveBeenLastCalledWith({ land: false })
  })

  it('sets the opacity of the Sentinel-2 layer, and only when one is shown', () => {
    renderPanel({ sentinel: 'none' })
    expect(screen.getByRole('slider', { name: 'Opacity' })).toBeDisabled()
  })

  it('reports the opacity as a fraction', () => {
    const onChange = renderPanel({ sentinel: 'natural', opacity: 0.8 })
    const slider = screen.getByRole('slider', { name: 'Opacity' })
    expect(slider).toBeEnabled()
    expect(slider).toHaveValue('80')
    expect(screen.getByText('80%')).toBeInTheDocument()
    fireEvent.change(slider, { target: { value: '60' } })
    expect(onChange).toHaveBeenLastCalledWith({ opacity: 0.6 })
  })
})
