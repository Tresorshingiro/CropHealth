import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '../theme/ThemeContext.jsx'
import IndexGuideDialog from './IndexGuideDialog.jsx'
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

const noop = () => {}

function renderSummary(props) {
  return render(
    <ThemeProvider>
      <ParcelSummary onRetry={noop} onOpenGuide={noop} parcel={null} error={null} {...props} />
    </ThemeProvider>,
  )
}

describe('ParcelSummary', () => {
  it('shows the parcel, its location, the three indices and the facts', () => {
    renderSummary({ status: 'ready', parcel: PARCEL })
    expect(screen.getByRole('heading', { name: '5/05/10/02/1939 · Kirehe' })).toBeInTheDocument()
    expect(screen.getByText('Nasho · Kagese · Kagese Ii')).toBeInTheDocument()
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
    expect(screen.getByText(PARCEL.headline)).toBeInTheDocument()
  })

  it('shows a dash and no level for an index with no value', () => {
    const { container } = renderSummary({
      status: 'ready',
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
    expect(screen.getByTestId('NDMI-value')).toHaveTextContent('-0.30')
    expect(container.textContent).not.toMatch(/NaN|null|undefined|Invalid/)
  })

  it('prompts for a UPI before anything is selected', () => {
    renderSummary({ status: 'idle' })
    expect(screen.getByText('Enter a UPI and press Run to see its analysis.')).toBeInTheDocument()
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

  it('opens the guide for the index whose info button was pressed', async () => {
    const onOpenGuide = vi.fn()
    renderSummary({ status: 'ready', parcel: PARCEL, onOpenGuide })
    await userEvent.click(screen.getByRole('button', { name: 'About NDMI' }))
    expect(onOpenGuide).toHaveBeenCalledWith('NDMI')
  })
})

describe('IndexGuideDialog', () => {
  const ENTRIES = [
    {
      code: 'NDVI',
      name: 'Normalized Difference Vegetation Index',
      meaning: 'How much green leaf is on the ground.',
      howToRead: 'Rises as a crop covers the soil and falls at harvest.',
      thresholds: 'below 0.20 bare; 0.20-0.35 very sparse',
      caveats: 'A parcel is often only a few 10 m pixels.',
      formula: '(B8 - B4) / (B8 + B4)',
      bands: 'B8 near infrared, B4 red',
      reference: 'Rouse et al. 1974',
    },
  ]

  it('shows the guide entry for the index', () => {
    render(<IndexGuideDialog code="NDVI" entries={ENTRIES} error={null} onClose={noop} />)
    const dialog = screen.getByRole('dialog', { name: 'Normalized Difference Vegetation Index' })
    expect(dialog).toHaveTextContent('How much green leaf is on the ground.')
    expect(dialog).toHaveTextContent('below 0.20 bare; 0.20-0.35 very sparse')
    expect(dialog).toHaveTextContent('A parcel is often only a few 10 m pixels.')
    expect(dialog).toHaveTextContent('(B8 - B4) / (B8 + B4)')
  })

  it('shows a loading state while the guide is being fetched', () => {
    render(<IndexGuideDialog code="NDVI" entries={null} error={null} onClose={noop} />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
  })

  it('shows an error, and a note when the index has no entry', () => {
    const { rerender } = render(<IndexGuideDialog code="NDVI" entries={null} error="Invalid query" onClose={noop} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid query')
    rerender(<IndexGuideDialog code="NDRE" entries={ENTRIES} error={null} onClose={noop} />)
    expect(screen.getByText('No guide entry for NDRE.')).toBeInTheDocument()
  })

  it('closes on Escape and on the close button', async () => {
    const onClose = vi.fn()
    render(<IndexGuideDialog code="NDVI" entries={ENTRIES} error={null} onClose={onClose} />)
    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
