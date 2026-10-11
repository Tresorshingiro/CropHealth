import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '../theme/ThemeContext.jsx'
import ParcelSummary from './ParcelSummary.jsx'

const PARCEL = {
  upi: '5/05/10/02/1939',
  province: 'Eastern',
  district: 'Kirehe',
  sector: 'Nasho',
  cell: 'Kagese',
  village: 'Kagese Ii',
  areaM2: 18477.8,
  reliability: 'good',
  latestDate: 1790294400000,
  ndvi: 0.1394,
  ndmi: -0.2968,
  ndre: 0.0684,
  ndviLevel: 'bare ground',
  ndmiLevel: 'very dry',
  ndreLevel: 'very little chlorophyll',
  headline: 'On 25 Sep 2026: NDVI 0.14 (bare ground).',
  usableDates: 87,
  lastRefreshed: 1790778688448,
  rings: null,
}
const GUIDE = {
  entries: [{ code: 'NDVI', thresholds: 'below 0.20 bare; 0.20-0.35 very sparse; 0.35-0.55 growing; 0.55-0.75 full canopy; above 0.75 dense' }],
  error: null,
}
const noop = () => {}

function renderSummary(props) {
  return render(
    <ThemeProvider>
      <ParcelSummary onRetry={noop} parcel={null} error={null} guide={{ entries: null, error: null }} {...props} />
    </ThemeProvider>,
  )
}

describe('ParcelSummary: updating an analysed parcel with new images', () => {
  it('shows when it was last updated, and runs the analysis again', async () => {
    const onStart = vi.fn()
    renderSummary({ status: 'ready', parcel: PARCEL, refresh: { status: 'idle', message: null, onStart } })
    expect(screen.getByText('Last updated').closest('div')).toHaveTextContent('Last updated30 Sep 2026')
    await userEvent.click(screen.getByRole('button', { name: 'Update with new images' }))
    expect(onStart).toHaveBeenCalled()
  })

  it('says it is reading, then that it is done; waits for another run; offers a retry with the reason', () => {
    const { rerender } = renderSummary({ status: 'ready', parcel: PARCEL, refresh: { status: 'running', message: null, onStart: noop } })
    expect(screen.getByRole('status')).toHaveTextContent('Reading new images')
    expect(screen.queryByRole('button', { name: /Update/ })).toBeNull()

    const again = (refresh) =>
      rerender(
        <ThemeProvider>
          <ParcelSummary onRetry={noop} error={null} guide={{ entries: null, error: null }} status="ready" parcel={PARCEL} refresh={refresh} />
        </ThemeProvider>,
      )
    again({ status: 'succeeded', message: null, onStart: noop })
    expect(screen.getByText('Updated with the latest images.')).toBeInTheDocument()
    again({ status: 'busy', message: null, onStart: noop })
    expect(screen.getByRole('button', { name: 'Update with new images' })).toBeDisabled()
    again({ status: 'failed', message: 'The analysis did not finish.', onStart: noop })
    expect(screen.getByRole('alert')).toHaveTextContent('The analysis did not finish.')
    expect(screen.getByRole('button', { name: 'Try the update again' })).toBeEnabled()
  })
})

describe('ParcelSummary', () => {
  it('shows the parcel, its location, the headline and the facts', () => {
    renderSummary({ status: 'ready', parcel: PARCEL })
    expect(screen.getByRole('heading', { name: '5/05/10/02/1939' })).toBeInTheDocument()
    expect(screen.getByText('Kirehe')).toBeInTheDocument()
    expect(screen.getByText('Nasho · Kagese · Kagese Ii')).toBeInTheDocument()
    expect(screen.getByText(PARCEL.headline)).toBeInTheDocument()
    expect(screen.getByText('25 Sep 2026')).toBeInTheDocument()
    expect(screen.getByText('1.85 ha')).toBeInTheDocument()
    expect(screen.getByText('good')).toBeInTheDocument()
    expect(screen.getByText('87')).toBeInTheDocument()
    expect(screen.queryByTestId('NDVI-value')).toBeNull()
  })

  it('sums up crop health from the indices the guide can place, with the season note', () => {
    renderSummary({ status: 'ready', parcel: PARCEL, guide: GUIDE })
    const line = screen.getByTestId('crop-health')
    expect(line).toHaveTextContent('Crop health: Poor. Green cover is poor.')
    expect(line).toHaveTextContent('Values are naturally low just after planting and after harvest.')
  })

  it('gives no crop-health line without a readable guide', () => {
    renderSummary({ status: 'ready', parcel: PARCEL })
    expect(screen.queryByTestId('crop-health')).toBeNull()
  })

  it('leaves out reliability when the layer has none, as the analysis tool writes it', () => {
    renderSummary({ status: 'ready', parcel: { ...PARCEL, reliability: null } })
    expect(screen.queryByText('Reliability')).toBeNull()
    expect(screen.getByText('Clear dates')).toBeInTheDocument()
  })

  it('marks a drawn area as a drawn field', () => {
    renderSummary({ status: 'ready', parcel: { ...PARCEL, upi: 'AREA North field' } })
    expect(screen.getByRole('heading', { name: 'AREA North field' })).toBeInTheDocument()
    expect(screen.getByText('Drawn field')).toBeInTheDocument()
  })

  it('shows a loading state', () => {
    renderSummary({ status: 'loading' })
    expect(screen.getByRole('status', { name: 'Loading parcel' })).toBeInTheDocument()
  })

  it('says when the parcel has not been analysed', () => {
    renderSummary({ status: 'not-found' })
    expect(screen.getByText('This parcel has not been analysed yet.')).toBeInTheDocument()
  })

  describe('a parcel that has not been analysed, found in the land records', () => {
    it('says it is being looked up, then that it is not in the records', () => {
      const { rerender } = renderSummary({ status: 'not-found', lookup: 'searching' })
      expect(screen.getByRole('status')).toHaveTextContent('Finding it in the land parcel records…')
      rerender(
        <ThemeProvider>
          <ParcelSummary status="not-found" parcel={null} error={null} onRetry={noop} guide={{ entries: null, error: null }} lookup="missing" />
        </ThemeProvider>,
      )
      expect(screen.getByText('No land parcel with this UPI in the NLA records. Check the UPI.')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Analyse this parcel' })).toBeNull()
    })

    it('offers to analyse it once it is on the map', async () => {
      const onStart = vi.fn()
      renderSummary({ status: 'not-found', lookup: 'found', analyse: { status: 'idle', message: null, onStart } })
      expect(screen.getByText(/shown on the map with a quick look/)).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Analyse this parcel' }))
      expect(onStart).toHaveBeenCalledTimes(1)
    })

    it('shows the run, and why it failed', () => {
      const { rerender } = renderSummary({ status: 'not-found', lookup: 'found', analyse: { status: 'running', message: null, onStart: noop } })
      expect(screen.getByRole('status')).toHaveTextContent('Analysing this parcel… about a minute')
      rerender(
        <ThemeProvider>
          <ParcelSummary status="not-found" parcel={null} error={null} onRetry={noop} guide={{ entries: null, error: null }} lookup="found" analyse={{ status: 'failed', message: 'UPI not found in NLA parcels.', onStart: noop }} />
        </ThemeProvider>,
      )
      expect(screen.getByRole('alert')).toHaveTextContent('UPI not found in NLA parcels.')
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    })
  })

  it('shows the error with a retry button', async () => {
    const onRetry = vi.fn()
    renderSummary({ status: 'error', error: 'Could not reach the GIS service. Try again in a moment.', onRetry })
    expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the GIS service. Try again in a moment.')
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
