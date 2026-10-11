import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '../../theme/ThemeContext.jsx'
import PlotCard, { hasCard } from './PlotCard.jsx'

const PARCEL = { upi: '5/04/08/04/1948', ndvi: 0.2611, ndmi: -0.1104, ndre: null }
const READY = { status: 'ready', scene: { date: Date.UTC(2026, 3, 28), cloud: 0 } }
const GUIDE = {
  entries: [{ code: 'NDVI', thresholds: 'below 0.20 bare; 0.20-0.35 very sparse; 0.35-0.55 growing; 0.55-0.75 full canopy; above 0.75 dense' }],
  error: null,
}

function renderCard(props = {}) {
  const handlers = { onOpenReport: vi.fn(), onClose: vi.fn(), onFold: vi.fn() }
  // The chips take the index colours from the theme; `wrapper` stays on for rerender too.
  const view = render(<PlotCard parcel={PARCEL} scene={READY} guide={GUIDE} folded={false} {...handlers} {...props} />, {
    wrapper: ThemeProvider,
  })
  return { ...handlers, ...view }
}

describe('hasCard', () => {
  it('shows the map card only where there is no report: a quick look or a drawn field', () => {
    expect(hasCard({ upi: '5/05/06/02/4219', quick: { status: 'ready', values: {} } })).toBe(true)
    expect(hasCard({ drawn: true, upi: null, quick: { status: 'loading', values: null } })).toBe(true)
    // An analysed plot: its report and index cards already show these values.
    expect(hasCard(PARCEL)).toBe(false)
    expect(hasCard(null)).toBe(false)
  })
})

describe('PlotCard', () => {
  it('shows the plot, its three latest values with verdicts, and the image on the map', () => {
    renderCard()
    expect(screen.getByRole('dialog', { name: 'Plot 5/04/08/04/1948' })).toBeInTheDocument()
    expect(screen.getByTestId('popup-NDVI')).toHaveTextContent('0.26')
    expect(screen.getByTestId('popup-NDVI-verdict')).toHaveTextContent('Poor')
    expect(screen.getByTestId('popup-NDMI')).toHaveTextContent('-0.11')
    expect(screen.getByTestId('popup-NDMI-verdict')).toBeEmptyDOMElement()
    expect(screen.getByTestId('popup-NDRE')).toHaveTextContent('–')
    expect(screen.getByText('Image 28 Apr 2026 · cloud 0%')).toBeInTheDocument()
  })

  it('says when the image is loading, missing or unavailable', () => {
    const { rerender } = renderCard({ scene: { status: 'loading', scene: null } })
    expect(screen.getByText('Finding the clearest image…')).toBeInTheDocument()
    rerender(<PlotCard parcel={PARCEL} scene={{ status: 'none', scene: null }} folded={false} onFold={vi.fn()} onOpenReport={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('No Sentinel-2 image of this plot in the chosen period')).toBeInTheDocument()
    rerender(<PlotCard parcel={PARCEL} scene={{ status: 'error', scene: null }} folded={false} onFold={vi.fn()} onOpenReport={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('Satellite image unavailable')).toBeInTheDocument()
  })

  it('opens the report and closes', async () => {
    const { onOpenReport, onClose } = renderCard()
    await userEvent.click(screen.getByRole('button', { name: 'Open report' }))
    expect(onOpenReport).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('folds to a one-line chip and unfolds from it', async () => {
    const { onFold, rerender } = renderCard()
    await userEvent.click(screen.getByRole('button', { name: 'Fold' }))
    expect(onFold).toHaveBeenLastCalledWith(true)
    rerender(<PlotCard parcel={PARCEL} scene={READY} guide={GUIDE} folded onFold={onFold} onOpenReport={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    const chip = screen.getByRole('button', { name: 'Show details of 5/04/08/04/1948' })
    expect(chip).toHaveTextContent('NDVI 0.26')
    await userEvent.click(chip)
    expect(onFold).toHaveBeenLastCalledWith(false)
  })

  it('shows a quick look with its place and area and no report', () => {
    const field = {
      upi: '5/05/06/02/4219',
      district: 'Kirehe',
      sector: 'Mahama',
      cell: 'Mwoga',
      village: 'Gisanze',
      areaM2: 390.5,
      quick: { status: 'ready', values: { ndvi: 0.2141, ndmi: -0.109, ndre: 0.157 } },
    }
    renderCard({ parcel: field })
    expect(screen.getByText('Kirehe · Mahama · Mwoga · Gisanze · 0.04 ha')).toBeInTheDocument()
    expect(screen.getByTestId('popup-NDVI')).toHaveTextContent('0.21')
    expect(screen.getByTestId('popup-NDRE')).toHaveTextContent('0.16')
    expect(screen.queryByRole('button', { name: 'Open report' })).toBeNull()
  })

  it('names a drawn field as one', () => {
    const field = { drawn: true, upi: null, areaM2: 12000, quick: { status: 'loading', values: null } }
    renderCard({ parcel: field })
    expect(screen.getByRole('dialog', { name: 'Plot Drawn field' })).toBeInTheDocument()
    expect(screen.getByText('1.20 ha')).toBeInTheDocument()
    expect(screen.getByText('Measuring the field…')).toBeInTheDocument()
  })

  it('says when a quick look could not be measured', () => {
    renderCard({ parcel: { upi: '5/05/06/02/4219', quick: { status: 'failed', values: null } } })
    expect(screen.getByText('The field could not be measured.')).toBeInTheDocument()
    expect(screen.getByTestId('popup-NDVI')).toHaveTextContent('–')
  })

  describe('analysing a field', () => {
    const field = (analyse) => ({
      upi: '5/05/06/02/4219',
      quick: { status: 'ready', values: { ndvi: 0.21, ndmi: -0.11, ndre: 0.16 } },
      analyse,
    })

    it("offers to run the GIS team's analysis", async () => {
      const onStart = vi.fn()
      renderCard({ parcel: field({ status: 'idle', message: null, onStart }) })
      expect(screen.getByText('A full report with 14 months of history takes about a minute.')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Analyse this field' }))
      expect(onStart).toHaveBeenCalledTimes(1)
    })

    it('shows the analysis running, then done', () => {
      const { rerender } = renderCard({ parcel: field({ status: 'running', message: null, onStart: vi.fn() }) })
      expect(screen.getByRole('status')).toHaveTextContent('Analysing this field… about a minute')
      rerender(<PlotCard parcel={field({ status: 'succeeded', message: null, onStart: vi.fn() })} scene={READY} folded={false} onFold={vi.fn()} onOpenReport={vi.fn()} onClose={vi.fn()} />)
      expect(screen.getByRole('status')).toHaveTextContent('Analysed. Opening its report…')
    })

    it('says why it failed and offers to try again', async () => {
      const onStart = vi.fn()
      renderCard({ parcel: field({ status: 'failed', message: 'UPI not found in NLA parcels.', onStart }) })
      expect(screen.getByRole('alert')).toHaveTextContent('UPI not found in NLA parcels.')
      await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
      expect(onStart).toHaveBeenCalledTimes(1)
    })

    const drawn = (analyse) => ({
      drawn: true,
      upi: null,
      areaM2: 12000,
      quick: { status: 'ready', values: { ndvi: 0.4, ndmi: 0, ndre: 0.2 } },
      analyse,
    })

    it('asks a drawn field for its name before analysing', async () => {
      const onStart = vi.fn()
      const onNameChange = vi.fn()
      renderCard({ parcel: drawn({ status: 'idle', message: null, onStart, name: 'Field 07 Oct 1432', onNameChange, valid: true, exists: false }) })
      const box = screen.getByLabelText('Name')
      expect(box).toHaveValue('Field 07 Oct 1432')
      await userEvent.type(box, 'x')
      expect(onNameChange).toHaveBeenLastCalledWith('Field 07 Oct 1432x')
      await userEvent.click(screen.getByRole('button', { name: 'Analyse this field' }))
      expect(onStart).toHaveBeenCalledTimes(1)
    })

    it('will not analyse a drawn field with a name the tool would change', () => {
      renderCard({ parcel: drawn({ status: 'idle', message: null, onStart: vi.fn(), name: 'two  spaces', onNameChange: vi.fn(), valid: false, exists: false }) })
      expect(screen.getByRole('button', { name: 'Analyse this field' })).toBeDisabled()
      expect(screen.getByText('Letters, digits, spaces, _ and -, up to 26 characters.')).toBeInTheDocument()
    })

    it('warns before replacing a field with the same name', () => {
      renderCard({ parcel: drawn({ status: 'idle', message: null, onStart: vi.fn(), name: 'North field', onNameChange: vi.fn(), valid: true, exists: true }) })
      expect(screen.getByText('A field with this name exists. Analysing replaces it.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Replace and analyse' })).toBeEnabled()
    })

    it('waits while another field is being analysed', () => {
      renderCard({ parcel: field({ status: 'busy', message: null, onStart: vi.fn() }) })
      expect(screen.getByRole('button', { name: 'Analyse this field' })).toBeDisabled()
      expect(screen.getByText('Another field is being analysed.')).toBeInTheDocument()
    })
  })
})
