import { render, screen, within } from '@testing-library/react'
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
  headline: 'On 25 Sep 2026: NDVI 0.14 (bare ground), NDMI -0.30 (very dry), NDRE 0.07 (very little chlorophyll).',
  usableDates: 87,
  lastRefreshed: 1790778688448,
  rings: null,
}

const ENTRIES = [
  {
    code: 'NDVI',
    name: 'Normalized Difference Vegetation Index',
    meaning: 'How much green leaf is on the ground.',
    howToRead: 'Rises as a crop covers the soil and falls at harvest.',
    thresholds: 'below 0.20 bare; 0.20-0.35 very sparse; 0.35-0.55 growing; 0.55-0.75 full canopy; above 0.75 dense',
    caveats: 'A parcel is often only a few 10 m pixels.',
    formula: '(B8 - B4) / (B8 + B4)',
    bands: 'B8 near infrared, B4 red',
    reference: 'Rouse et al. 1974',
  },
  {
    code: 'NDMI',
    name: 'Normalized Difference Moisture Index',
    meaning: 'How much water the leaves and the soil surface hold.',
    howToRead: 'Falls days before NDVI does.',
    thresholds: 'not a list of bands',
    caveats: null,
    formula: null,
    bands: null,
    reference: null,
  },
]

const noop = () => {}
const READY_GUIDE = { entries: ENTRIES, error: null }

function renderSummary(props) {
  return render(
    <ThemeProvider>
      <ParcelSummary onRetry={noop} parcel={null} error={null} guide={{ entries: null, error: null }} {...props} />
    </ThemeProvider>,
  )
}

describe('ParcelSummary', () => {
  it('shows the parcel, its location, the headline, the three indices and the facts', () => {
    renderSummary({ status: 'ready', parcel: PARCEL, guide: READY_GUIDE })
    expect(screen.getByRole('heading', { name: '5/05/10/02/1939' })).toBeInTheDocument()
    expect(screen.getByText('Kirehe')).toBeInTheDocument()
    expect(screen.getByText('Nasho · Kagese · Kagese Ii')).toBeInTheDocument()
    expect(screen.getByText(PARCEL.headline)).toBeInTheDocument()
    expect(screen.getByTestId('NDVI-value')).toHaveTextContent('0.14')
    expect(screen.getByTestId('NDVI-level')).toHaveTextContent('bare ground')
    expect(screen.getByTestId('NDMI-value')).toHaveTextContent('-0.30')
    expect(screen.getByTestId('NDMI-level')).toHaveTextContent('very dry')
    expect(screen.getByTestId('NDRE-value')).toHaveTextContent('0.07')
    expect(screen.getByTestId('NDRE-level')).toHaveTextContent('very little chlorophyll')
    expect(screen.getByText('25 Sep 2026')).toBeInTheDocument()
    expect(screen.getByText('1.85 ha')).toBeInTheDocument()
    expect(screen.getByText('good')).toBeInTheDocument()
    expect(screen.getByText('87')).toBeInTheDocument()
  })

  it('draws a scale from the guide thresholds and marks the band the value falls in', () => {
    renderSummary({ status: 'ready', parcel: PARCEL, guide: READY_GUIDE })
    const scale = screen.getByRole('img', { name: 'NDVI scale: bare, very sparse, growing, full canopy, dense. This parcel: bare.' })
    const bands = within(scale).getAllByTestId('band')
    expect(bands).toHaveLength(5)
    expect(bands.map((b) => b.dataset.active)).toEqual(['true', 'false', 'false', 'false', 'false'])
    expect(within(scale).getByTestId('marker')).toBeInTheDocument()
    expect(within(scale).getByText('0.2')).toBeInTheDocument()
    expect(within(scale).getByText('0.75')).toBeInTheDocument()
  })

  it('shows value and level without a scale when the thresholds cannot be read or the guide is missing', () => {
    renderSummary({ status: 'ready', parcel: PARCEL, guide: READY_GUIDE })
    expect(screen.queryByRole('img', { name: /^NDMI scale/ })).toBeNull()
    expect(screen.queryByRole('img', { name: /^NDRE scale/ })).toBeNull()
    expect(screen.getByTestId('NDMI-value')).toHaveTextContent('-0.30')
    expect(screen.getByTestId('NDRE-level')).toHaveTextContent('very little chlorophyll')
  })

  it('shows a dash, no level and no marker for an index with no value', () => {
    const { container } = renderSummary({
      status: 'ready',
      guide: READY_GUIDE,
      parcel: {
        ...PARCEL,
        district: null,
        sector: null,
        cell: null,
        village: null,
        ndvi: null,
        latestDate: null,
        areaM2: null,
        reliability: null,
        usableDates: null,
        headline: null,
      },
    })
    expect(screen.getByRole('heading', { name: '5/05/10/02/1939' })).toBeInTheDocument()
    expect(screen.getByTestId('NDVI-value')).toHaveTextContent('–')
    expect(screen.getByTestId('NDVI-level')).toBeEmptyDOMElement()
    expect(screen.queryByTestId('marker')).toBeNull()
    expect(screen.getByTestId('NDMI-value')).toHaveTextContent('-0.30')
    expect(container.textContent).not.toMatch(/NaN|null|undefined|Invalid/)
  })

  it('leaves out reliability when the layer has none, as the analysis tool writes it', () => {
    renderSummary({ status: 'ready', guide: READY_GUIDE, parcel: { ...PARCEL, reliability: null } })
    expect(screen.queryByText('Reliability')).toBeNull()
    expect(screen.getByText('Clear dates')).toBeInTheDocument()
  })

  it('marks a drawn area as a drawn field', () => {
    renderSummary({ status: 'ready', guide: READY_GUIDE, parcel: { ...PARCEL, upi: 'AREA North field' } })
    expect(screen.getByRole('heading', { name: 'AREA North field' })).toBeInTheDocument()
    expect(screen.getByText('Drawn field')).toBeInTheDocument()
  })

  it('does not mark a parcel as drawn', () => {
    renderSummary({ status: 'ready', guide: READY_GUIDE, parcel: PARCEL })
    expect(screen.queryByText('Drawn field')).toBeNull()
  })

  it('explains an index in place when its info button is pressed', async () => {
    renderSummary({ status: 'ready', parcel: PARCEL, guide: READY_GUIDE })
    const button = screen.getByRole('button', { name: 'About NDVI' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('How much green leaf is on the ground.')).toBeNull()
    await userEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('How much green leaf is on the ground.')).toBeInTheDocument()
    expect(screen.getByText('A parcel is often only a few 10 m pixels.')).toBeInTheDocument()
    expect(screen.getByText('(B8 - B4) / (B8 + B4) · B8 near infrared, B4 red')).toBeInTheDocument()
    await userEvent.click(button)
    expect(screen.queryByText('How much green leaf is on the ground.')).toBeNull()
  })

  it('says so when the explanation is loading, failed, or missing', async () => {
    const { rerender } = renderSummary({ status: 'ready', parcel: PARCEL })
    await userEvent.click(screen.getByRole('button', { name: 'About NDRE' }))
    expect(screen.getByText('Loading the explanation…')).toBeInTheDocument()

    const withGuide = (guide) => (
      <ThemeProvider>
        <ParcelSummary status="ready" parcel={PARCEL} error={null} onRetry={noop} guide={guide} />
      </ThemeProvider>
    )
    rerender(withGuide({ entries: null, error: 'Invalid query' }))
    expect(screen.getByText('The explanation could not be loaded.')).toBeInTheDocument()
    rerender(withGuide(READY_GUIDE))
    expect(screen.getByText('No explanation is available for NDRE.')).toBeInTheDocument()
  })

  it('shows a loading state', () => {
    renderSummary({ status: 'loading' })
    expect(screen.getByRole('status', { name: 'Loading parcel' })).toBeInTheDocument()
  })

  it('says when the parcel has not been analysed', () => {
    renderSummary({ status: 'not-found' })
    expect(screen.getByText('This parcel has not been analysed yet.')).toBeInTheDocument()
  })

  it('shows the error with a retry button', async () => {
    const onRetry = vi.fn()
    renderSummary({ status: 'error', error: 'Could not reach GeoHub. Try again in a moment.', onRetry })
    expect(screen.getByRole('alert')).toHaveTextContent('Could not reach GeoHub. Try again in a moment.')
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
