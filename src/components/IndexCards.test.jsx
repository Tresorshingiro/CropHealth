import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ThemeProvider } from '../theme/ThemeContext.jsx'
import IndexCards from './IndexCards.jsx'

const NDVI_BANDS = 'below 0.20 bare; 0.20-0.35 very sparse; 0.35-0.55 growing; 0.55-0.75 full canopy; above 0.75 dense'
const ENTRIES = [
  {
    code: 'NDVI',
    name: 'Normalized Difference Vegetation Index',
    meaning: 'How much green leaf is on the ground.',
    howToRead: 'Rises as a crop covers the soil and falls at harvest.',
    thresholds: NDVI_BANDS,
    caveats: 'A parcel is often only a few 10 m pixels.',
    formula: '(B8 - B4) / (B8 + B4)',
    bands: 'B8 near infrared, B4 red',
    reference: null,
  },
  { code: 'NDMI', name: null, meaning: 'How much water the leaves hold.', howToRead: null, thresholds: 'not a list of bands', caveats: null, formula: null, bands: null, reference: null },
]
const READY = { entries: ENTRIES, error: null }
const PARCEL = { upi: '5/05/10/02/1939', ndvi: 0.6, ndmi: -0.2968, ndre: 0.0684, ndviLevel: 'full canopy', ndmiLevel: 'very dry', ndreLevel: null }
const ROWS = [
  { date: Date.UTC(2026, 2, 10), ndvi: 0.4, ndmi: 0, ndre: 0.2 },
  { date: Date.UTC(2026, 3, 10), ndvi: 0.6, ndmi: 0.1, ndre: null },
]

function renderCards(props = {}) {
  return render(
    <ThemeProvider>
      <IndexCards parcel={PARCEL} guide={READY} observations={ROWS} range={null} {...props} />
    </ThemeProvider>,
  )
}

describe('IndexCards', () => {
  it('shows each latest value with its verdict, what it means, and the layer level', () => {
    renderCards()
    expect(screen.getByRole('group', { name: 'Indices' })).toBeInTheDocument()
    expect(screen.getByTestId('NDVI-value')).toHaveTextContent('0.60')
    expect(screen.getByTestId('NDVI-verdict')).toHaveTextContent('Good')
    expect(screen.getByText('Dense green cover: the crop is growing well.')).toBeInTheDocument()
    expect(screen.getByTestId('NDVI-level')).toHaveTextContent('GIS level: full canopy')
    const ring = screen.getByRole('img', { name: 'NDVI scale: bare, very sparse, growing, full canopy, dense. This parcel: full canopy.' })
    expect(Number(ring.dataset.position)).toBeCloseTo(0.65)
  })

  it('treats a value on a band edge as the band above it', () => {
    renderCards({ parcel: { ...PARCEL, ndvi: 0.2 } })
    expect(screen.getByTestId('NDVI-verdict')).toHaveTextContent('Poor')
    expect(screen.getByText('Little green cover: bare soil, a recent harvest, or crops under stress.')).toBeInTheDocument()
  })

  it('gives no verdict and no ring when the bands cannot be read or are missing', () => {
    renderCards()
    expect(screen.getByTestId('NDMI-value')).toHaveTextContent('-0.30')
    expect(screen.getByTestId('NDMI-verdict')).toBeEmptyDOMElement()
    expect(screen.queryByRole('img', { name: /^NDMI scale/ })).toBeNull()
    expect(screen.getByTestId('NDRE-verdict')).toBeEmptyDOMElement()
    expect(screen.getByTestId('NDRE-level')).toBeEmptyDOMElement()
  })

  it('shows a dash and no verdict for a missing value', () => {
    const { container } = renderCards({ parcel: { ...PARCEL, ndvi: null } })
    expect(screen.getByTestId('NDVI-value')).toHaveTextContent('–')
    expect(screen.getByTestId('NDVI-verdict')).toBeEmptyDOMElement()
    expect(screen.getByTestId('NDVI-level')).toBeEmptyDOMElement()
    expect(container.textContent).not.toMatch(/NaN|null|undefined|Invalid/)
  })

  it('shows the average over the period with its verdict', () => {
    const { rerender } = renderCards()
    expect(screen.getByTestId('NDVI-average')).toHaveTextContent('Period average 0.50 · Moderate')
    expect(screen.getByTestId('NDMI-average')).toHaveTextContent('Period average 0.05')
    const april = { from: Date.UTC(2026, 3, 1), to: Date.UTC(2026, 4, 1) - 1 }
    rerender(
      <ThemeProvider>
        <IndexCards parcel={PARCEL} guide={READY} observations={ROWS} range={april} />
      </ThemeProvider>,
    )
    expect(screen.getByTestId('NDVI-average')).toHaveTextContent('Period average 0.60 · Good')
    expect(screen.getByTestId('NDRE-average')).toHaveTextContent('No clear dates in this period')
  })

  it('leaves the average out while the history loads', () => {
    renderCards({ observations: null })
    expect(screen.queryByTestId('NDVI-average')).toBeNull()
  })

  it('explains an index in place when its info button is pressed', async () => {
    renderCards()
    const button = screen.getByRole('button', { name: 'About NDVI' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('How much green leaf is on the ground.')).toBeInTheDocument()
    expect(screen.getByText('(B8 - B4) / (B8 + B4) · B8 near infrared, B4 red')).toBeInTheDocument()
  })

  it('says so when the explanation is loading, failed, or missing', async () => {
    const { rerender } = renderCards({ guide: { entries: null, error: null } })
    await userEvent.click(screen.getByRole('button', { name: 'About NDRE' }))
    expect(screen.getByText('Loading the explanation…')).toBeInTheDocument()
    const withGuide = (guide) => (
      <ThemeProvider>
        <IndexCards parcel={PARCEL} guide={guide} observations={ROWS} range={null} />
      </ThemeProvider>
    )
    rerender(withGuide({ entries: null, error: 'Invalid query' }))
    expect(screen.getByText('The explanation could not be loaded.')).toBeInTheDocument()
    rerender(withGuide(READY))
    expect(screen.getByText('No explanation is available for NDRE.')).toBeInTheDocument()
  })
})
