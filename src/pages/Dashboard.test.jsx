import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PortalError, SessionExpiredError } from '../api/arcgis.js'
import { getIndexGuide, getObservations, getParcel, listParcels } from '../api/cropHealth.js'
import { startAnalysis } from '../api/analysis.js'
import { findPlotScene, measureParcel } from '../api/sentinel.js'
import { findLandParcel } from '../api/lais.js'
import { ThemeProvider } from '../theme/ThemeContext.jsx'
import Dashboard from './Dashboard.jsx'

const { expire, signOut } = vi.hoisted(() => ({ expire: vi.fn(), signOut: vi.fn() }))

vi.mock('../api/cropHealth.js', () => ({
  getParcel: vi.fn(),
  getObservations: vi.fn(),
  listParcels: vi.fn(),
  getIndexGuide: vi.fn(),
}))

vi.mock('../auth/AuthContext.jsx', () => ({
  useAuth: () => ({ user: { username: 'tresor', fullName: 'Tresor S' }, signOut, expire }),
}))

vi.mock('../api/sentinel.js', () => ({ findPlotScene: vi.fn(async () => null), measureParcel: vi.fn() }))
vi.mock('../api/analysis.js', () => ({ startAnalysis: vi.fn(), getAnalysis: vi.fn() }))
vi.mock('../api/lais.js', () => ({ findLandParcel: vi.fn(async () => null) }))

const LAND = {
  upi: '5/05/06/02/4219',
  district: 'Kirehe',
  sector: 'Mahama',
  cell: 'Mwoga',
  village: 'Gisanze',
  areaM2: 390.5,
  rings: [[[30.8, -2.2], [30.81, -2.2], [30.81, -2.19], [30.8, -2.2]]],
}

const FIELD = {
  drawn: true,
  upi: null,
  district: null,
  sector: null,
  cell: null,
  village: null,
  areaM2: 12000,
  rings: [[[30.8, -2.2], [30.801, -2.2], [30.801, -2.199], [30.8, -2.2]]],
}
vi.mock('../components/ParcelMap.jsx', () => ({
  default: ({ parcels, selected, onSelect, onLookAt, onDrawn, scene }) => (
    <div data-testid="map">
      {`${parcels.length} outlines, selected ${selected?.upi ?? 'none'}, scene ${scene?.status ?? 'none'}, quick ${selected?.quick?.status ?? 'none'}, analyse ${selected?.analyse?.status ?? 'none'}, name ${selected?.analyse?.name ?? 'none'}`}
      <button type="button" onClick={() => onLookAt(LAND)}>
        map land
      </button>      <button type="button" onClick={() => onDrawn(FIELD)}>
        map draw
      </button>
      <button type="button" onClick={() => selected?.analyse?.onStart()}>
        map analyse
      </button>
      <button type="button" onClick={() => onSelect('5/02/06/06/1702')}>
        map parcel
      </button>
      <button type="button" onClick={() => onSelect(selected?.upi)}>
        map selected
      </button>
    </div>
  ),
}))

const parcel = (upi, district) => ({
  upi,
  province: 'Eastern',
  district,
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
  rings: [[[30.7, -2.3], [30.71, -2.3], [30.71, -2.29], [30.7, -2.3]]],
})

const A = parcel('5/05/10/02/1939', 'Kirehe')
const B = parcel('5/02/06/06/1702', 'Nyagatare')
const row = (p) => ({ upi: p.upi, district: p.district, latestDate: p.latestDate, ndvi: p.ndvi, ndmi: p.ndmi, ndre: p.ndre, rings: p.rings })
const OBSERVATIONS = [{ date: 1754265600000, ndvi: 0.39, ndmi: -0.09, ndre: 0.24, clearShare: 1 }]
const GUIDE = [
  {
    code: 'NDVI',
    name: 'Normalized Difference Vegetation Index',
    meaning: 'How much green leaf is on the ground.',
    thresholds: 'below 0.20 bare; 0.20-0.35 very sparse; 0.35-0.55 growing; 0.55-0.75 full canopy; above 0.75 dense',
  },
]
const overviewTitle = () => screen.queryByRole('heading', { name: 'Overview' })

function Search() {
  return <output data-testid="search">{useLocation().search}</output>
}
const selectedInUrl = () => new URLSearchParams(screen.getByTestId('search').textContent).get('upi')
const paramInUrl = (key) => new URLSearchParams(screen.getByTestId('search').textContent).get(key)

function renderDashboard(initial = '/') {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/" element={<><Dashboard /><Search /></>} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  )
}

const report = () => screen.getByRole('region', { name: 'Parcel analysis' })
const noReport = () => expect(screen.queryByRole('region', { name: 'Parcel analysis' })).toBeNull()
const sidebar = () => screen.getByRole('complementary', { name: 'Parcels and account' })
// The chart card's title and count: the season chips in the same card count clear dates too.
const chartCard = async () => (await screen.findByRole('heading', { name: 'Index history' })).parentElement
// The sidebar's recent parcels and its districts.
const inList = (upi) => within(sidebar()).findByRole('button', { name: new RegExp(upi) })
const districtButton = (name) => within(sidebar()).findByRole('button', { name: new RegExp(`^${name}`) })

beforeEach(() => {
  for (const fn of [getParcel, getObservations, listParcels, getIndexGuide, expire, signOut]) fn.mockReset()
  getParcel.mockImplementation(async (upi) => [A, B].find((p) => p.upi === upi) ?? null)
  getObservations.mockResolvedValue(OBSERVATIONS)
  listParcels.mockResolvedValue({ parcels: [row(A), row(B)], truncated: false })
  getIndexGuide.mockResolvedValue(GUIDE)
})

describe('Dashboard', () => {
  it('starts with an overview of the analysed parcels, the list and the map', async () => {
    renderDashboard()
    expect(within(sidebar()).getByText('Tresor S')).toBeInTheDocument()
    expect(within(sidebar()).getByText('Crop Health Monitoring')).toBeInTheDocument()
    expect(within(sidebar()).getByRole('heading', { name: 'Districts' })).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/GeoHub/)
    expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument()
    expect(overviewTitle()).toBeInTheDocument()
    noReport()
    expect(await districtButton('Nyagatare')).toBeInTheDocument()
    expect(screen.getByText('Areas of interest', { selector: 'span' }).closest('div')).toHaveTextContent('2')
    await waitFor(() => expect(screen.getByTestId('map')).toHaveTextContent('2 outlines, selected none'))
    expect(getParcel).not.toHaveBeenCalled()
  })

  it('lists the parcels needing attention on the overview and opens one', async () => {
    renderDashboard()
    const list = await screen.findByRole('list', { name: 'Needs attention' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('Poor')
    expect(rows[0]).toHaveTextContent('NDVI 0.14')
    await userEvent.click(within(list).getByRole('button', { name: new RegExp(B.upi) }))
    expect(await within(report()).findByRole('heading', { name: B.upi })).toBeInTheDocument()
  })
  it('opens the parcel named in the link as a report and remembers it in history', async () => {
    renderDashboard(`/?upi=${A.upi}`)
    expect(await within(report()).findByRole('heading', { name: A.upi })).toBeInTheDocument()
    expect(within(report()).getByText('Kirehe')).toBeInTheDocument()
    expect(await screen.findByTestId('map')).toHaveTextContent(`selected ${A.upi}`)
    expect(await within(await chartCard()).findByText('1 clear date')).toBeInTheDocument()
    expect(overviewTitle()).toBeNull()
    expect(await inList(A.upi)).toHaveAttribute('aria-current', 'true')
    expect(JSON.parse(window.localStorage.getItem('crophealth-history'))).toEqual([A.upi])
    expect(screen.getByLabelText('UPI')).toHaveValue(A.upi)
  })

  it('runs a search, puts the UPI in the link and shows the result', async () => {
    renderDashboard()
    await userEvent.type(screen.getByLabelText('UPI'), ` ${A.upi} `)
    await userEvent.click(screen.getByRole('button', { name: 'Run' }))
    expect(await screen.findByRole('heading', { name: A.upi })).toBeInTheDocument()
    expect(selectedInUrl()).toBe(A.upi)
    expect(getParcel).toHaveBeenCalledTimes(1)
  })

  it('draws the index scale from the guide', async () => {
    renderDashboard(`/?upi=${A.upi}`)
    expect(await screen.findByRole('img', { name: /^NDVI scale: bare, very sparse/ })).toBeInTheDocument()
  })

  it('opens a parcel from the recent ones in the sidebar', async () => {
    window.localStorage.setItem('crophealth-history', JSON.stringify([B.upi]))
    renderDashboard()
    await userEvent.click(await inList(B.upi))
    expect(await within(report()).findByRole('heading', { name: B.upi })).toBeInTheDocument()
    expect(selectedInUrl()).toBe(B.upi)
  })

  it('narrows the overview to a district picked in the sidebar, and back to all', async () => {
    renderDashboard()
    await userEvent.click(await districtButton('Kirehe'))
    expect(paramInUrl('district')).toBe('Kirehe')
    expect(await districtButton('Kirehe')).toHaveAttribute('aria-pressed', 'true')
    const list = await screen.findByRole('list', { name: 'Needs attention' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)
    expect(list).toHaveTextContent(A.upi)
    expect(within(screen.getByRole('group', { name: 'Crop health summary' })).getByText('Areas of interest').closest('div')).toHaveTextContent('1')

    await userEvent.click(screen.getByRole('button', { name: 'Show all districts (now Kirehe)' }))
    expect(paramInUrl('district')).toBeNull()
    expect(within(await screen.findByRole('list', { name: 'Needs attention' })).getAllByRole('listitem')).toHaveLength(2)
  })

  it('filters the list and the map by a health chip, kept in the link', async () => {
    renderDashboard()
    await districtButton('Nyagatare')
    const summary = screen.getByRole('group', { name: 'Crop health summary' })
    await userEvent.click(within(summary).getByRole('button', { name: /Good/ }))
    expect(paramInUrl('health')).toBe('good')
    expect(await screen.findByText('No parcel is Good.')).toBeInTheDocument()
    expect(screen.getByTestId('map')).toHaveTextContent('0 outlines')

    await userEvent.click(within(summary).getByRole('button', { name: /Poor/ }))
    expect(paramInUrl('health')).toBe('poor')
    expect(within(await screen.findByRole('list', { name: 'Poor' })).getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByTestId('map')).toHaveTextContent('2 outlines')

    await userEvent.click(within(summary).getByRole('button', { name: /Poor/ }))
    expect(paramInUrl('health')).toBeNull()
    expect(await screen.findByRole('list', { name: 'Needs attention' })).toBeInTheDocument()
  })

  it('runs the analysis again for an open report, reloads it with the new dates and says what it added', async () => {
    startAnalysis.mockImplementationOnce(async () => ({ jobId: 'j8', status: 'succeeded' }))
    renderDashboard(`/?upi=${A.upi}`)
    await within(report()).findByRole('heading', { name: A.upi })
    const parcelReads = getParcel.mock.calls.length
    // After the run the layer has a newer clear view (8 Oct 2026) and one more date.
    getParcel.mockImplementation(async (upi) => (upi === A.upi ? { ...A, latestDate: Date.UTC(2026, 9, 8) } : B))
    getObservations.mockResolvedValue([...OBSERVATIONS, { date: Date.UTC(2026, 9, 8), ndvi: 0.5, ndmi: 0.1, ndre: 0.3, clearShare: 1 }])

    await userEvent.click(screen.getByRole('button', { name: 'Update with new images' }))
    expect(startAnalysis).toHaveBeenCalledWith({ upi: A.upi })
    await waitFor(() => expect(getParcel.mock.calls.length).toBeGreaterThan(parcelReads))
    expect(await within(await chartCard()).findByText('2 clear dates')).toBeInTheDocument()
    expect(await screen.findByText('New clear images added, up to 8 Oct 2026.')).toBeInTheDocument()
    expect(selectedInUrl()).toBe(A.upi)
  })

  it('says so when the update finds no new clear image, and the history stays as it was', async () => {
    startAnalysis.mockImplementationOnce(async () => ({ jobId: 'j9', status: 'succeeded' }))
    renderDashboard(`/?upi=${A.upi}`)
    await within(report()).findByRole('heading', { name: A.upi })
    await userEvent.click(screen.getByRole('button', { name: 'Update with new images' }))
    expect(
      await screen.findByText('No new clear image since 25 Sep 2026: cloud cover, or no satellite pass yet. The history is unchanged.'),
    ).toBeInTheDocument()
    expect(await within(await chartCard()).findByText('1 clear date')).toBeInTheDocument()
  })

  it('closes an open report when a district is picked', async () => {
    renderDashboard(`/?upi=${A.upi}`)
    await within(report()).findByRole('heading', { name: A.upi })
    await userEvent.click(await districtButton('Nyagatare'))
    noReport()
    expect(selectedInUrl()).toBeNull()
    expect(paramInUrl('district')).toBe('Nyagatare')
  })

  it('opens a drawn area from the overview, like a parcel', async () => {
    const area = { ...parcel('AREA North field', 'Kirehe'), reliability: null, ndviLevel: null, headline: null }
    getParcel.mockImplementation(async (id) => [A, B, area].find((p) => p.upi === id) ?? null)
    listParcels.mockResolvedValue({ parcels: [row(A), row(B), row(area)], truncated: false })
    renderDashboard()
    const list = await screen.findByRole('list', { name: 'Needs attention' })
    await userEvent.click(within(list).getByRole('button', { name: new RegExp(area.upi) }))
    expect(await within(report()).findByRole('heading', { name: area.upi })).toBeInTheDocument()
    expect(within(report()).getByText('Drawn field')).toBeInTheDocument()
    expect(selectedInUrl()).toBe(area.upi)
    expect(getParcel).toHaveBeenCalledWith(area.upi, expect.anything())
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('opens the menu on a small screen, and closes it on Escape, on close and after choosing a district', async () => {
    renderDashboard()
    expect(sidebar()).toHaveAttribute('data-open', 'false')
    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    expect(sidebar()).toHaveAttribute('data-open', 'true')
    await userEvent.keyboard('{Escape}')
    expect(sidebar()).toHaveAttribute('data-open', 'false')

    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    await userEvent.click(screen.getByRole('button', { name: 'Close menu' }))
    expect(sidebar()).toHaveAttribute('data-open', 'false')

    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    await userEvent.click(await districtButton('Nyagatare'))
    expect(sidebar()).toHaveAttribute('data-open', 'false')
  })

  it('opens a parcel picked on the map', async () => {
    renderDashboard()
    await userEvent.click(await screen.findByRole('button', { name: 'map parcel' }))
    expect(await screen.findByRole('heading', { name: B.upi })).toBeInTheDocument()
  })

  it('goes back to the overview and clears the selection', async () => {
    renderDashboard(`/?upi=${A.upi}`)
    await screen.findByRole('heading', { name: A.upi })
    expect(screen.queryByRole('heading', { name: 'Overview' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Back to overview' }))
    noReport()
    expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument()
    expect(selectedInUrl()).toBeNull()
    expect(overviewTitle()).toBeInTheDocument()
    expect(screen.getByLabelText('UPI')).toHaveValue('')
  })

  it('says when the parcel has not been analysed, with no chart', async () => {
    renderDashboard('/?upi=5/05/10/02/1')
    expect(await within(report()).findByText('This parcel has not been analysed yet.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Index history' })).toBeNull()
    expect(window.localStorage.getItem('crophealth-history')).toBeNull()
  })

  it('shows the format message for a malformed UPI in the link and requests nothing', async () => {
    renderDashboard('/?upi=abc')
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a UPI in the form 5/05/10/02/1939')
    noReport()
    await waitFor(() => expect(listParcels).toHaveBeenCalled())
    expect(getParcel).not.toHaveBeenCalled()
  })

  it('shows an error with Retry, and recovers when Retry succeeds', async () => {
    getParcel.mockRejectedValueOnce(new PortalError('Could not reach GeoHub. Try again in a moment.'))
    renderDashboard(`/?upi=${A.upi}`)
    expect(await screen.findByText('Could not reach GeoHub. Try again in a moment.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('heading', { name: A.upi })).toBeInTheDocument()
  })

  it('signs the user out of the page when the session has expired', async () => {
    getParcel.mockRejectedValue(new SessionExpiredError())
    renderDashboard(`/?upi=${A.upi}`)
    await waitFor(() => expect(expire).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('keeps the newest parcel when an older request finishes last', async () => {
    let finishA
    getParcel.mockImplementation((upi) =>
      upi === A.upi ? new Promise((resolve) => (finishA = resolve)) : Promise.resolve(B),
    )
    renderDashboard(`/?upi=${A.upi}`)
    await userEvent.click(await screen.findByRole('button', { name: 'map parcel' }))
    expect(await screen.findByRole('heading', { name: B.upi })).toBeInTheDocument()

    await act(async () => finishA(A))
    expect(screen.getByRole('heading', { name: B.upi })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: A.upi })).toBeNull()
    expect(selectedInUrl()).toBe(B.upi)
  })

  it('still shows the parcel when the index guide cannot be loaded', async () => {
    getIndexGuide.mockRejectedValue(new PortalError('Invalid query'))
    renderDashboard(`/?upi=${A.upi}`)
    expect(await screen.findByRole('heading', { name: A.upi })).toBeInTheDocument()
    expect(screen.getByTestId('NDVI-value')).toHaveTextContent('0.14')
    expect(screen.queryByRole('img', { name: /^NDVI scale/ })).toBeNull()
  })

  it('limits the report to the period in the link, and resets it', async () => {
    getObservations.mockResolvedValue([
      { date: Date.UTC(2025, 7, 4), ndvi: 0.39, ndmi: -0.09, ndre: 0.24, clearShare: 1 },
      { date: Date.UTC(2026, 3, 28), ndvi: 0.81, ndmi: 0.3, ndre: 0.5, clearShare: 1 },
    ])
    renderDashboard(`/?upi=${A.upi}&from=2026-03-01&to=2026-04-30`)
    expect(await within(await chartCard()).findByText(/^1 clear date/)).toBeInTheDocument()
    expect(screen.getByLabelText('From')).toHaveValue('2026-03-01')
    expect(screen.getByLabelText('To')).toHaveValue('2026-04-30')
    expect(screen.getByTestId('NDVI-average')).toHaveTextContent('Period average 0.81')

    await userEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(await within(await chartCard()).findByText(/^2 clear dates/)).toBeInTheDocument()
    expect(paramInUrl('from')).toBeNull()
    expect(paramInUrl('upi')).toBe(A.upi)
  })

  it('puts the map first on the parcel page, then the indices and the chart, with no period table', async () => {
    renderDashboard(`/?upi=${A.upi}`)
    const map = await screen.findByTestId('map')
    const chart = await screen.findByRole('heading', { name: 'Index history' })
    const indices = screen.getByRole('group', { name: 'Indices' })
    expect(map.compareDocumentPosition(indices) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(indices.compareDocumentPosition(chart) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByRole('table', { name: 'Period summary' })).toBeNull()
  })

  it('sets the period to a season picked from its card', async () => {
    getObservations.mockResolvedValue([{ date: Date.UTC(2026, 3, 28), ndvi: 0.81, ndmi: 0.3, ndre: 0.5, clearShare: 1 }])
    renderDashboard(`/?upi=${A.upi}`)
    await userEvent.click(await screen.findByRole('button', { name: /^Season B 2026/ }))
    expect(paramInUrl('from')).toBe('2026-03-01')
    expect(paramInUrl('to')).toBe('2026-06-30')
    expect(screen.getByRole('button', { name: /^Season B 2026/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('puts a preset period in the link', async () => {
    renderDashboard(`/?upi=${A.upi}`)
    await screen.findByRole('heading', { name: A.upi })
    await userEvent.click(screen.getByRole('button', { name: '12 months' }))
    expect(paramInUrl('from')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(paramInUrl('to')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(screen.getByRole('button', { name: '12 months' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('keeps the period when another parcel is opened', async () => {
    renderDashboard(`/?upi=${A.upi}&from=2026-03-01&to=2026-04-30`)
    await screen.findByRole('heading', { name: A.upi })
    await userEvent.click(screen.getByRole('button', { name: 'map parcel' }))
    expect(await screen.findByRole('heading', { name: B.upi })).toBeInTheDocument()
    expect(paramInUrl('from')).toBe('2026-03-01')
    expect(paramInUrl('to')).toBe('2026-04-30')
  })

  it('asks for the satellite image of the opened plot', async () => {
    renderDashboard(`/?upi=${A.upi}`)
    await screen.findByRole('heading', { name: A.upi })
    await waitFor(() => expect(findPlotScene).toHaveBeenCalledWith(expect.objectContaining({ rings: A.rings })))
  })

  it('does not reload the report when the selected plot is clicked again on the map', async () => {
    renderDashboard(`/?upi=${A.upi}`)
    await screen.findByRole('heading', { name: A.upi })
    await userEvent.click(screen.getByRole('button', { name: 'map selected' }))
    expect(screen.getByRole('heading', { name: A.upi })).toBeInTheDocument()
    expect(getParcel).toHaveBeenCalledTimes(1)
  })

  it('ignores the compare parts of an old link and opens the report', async () => {
    renderDashboard(`/?upi=${A.upi}&compare=${A.upi},${B.upi}&view=compare`)
    expect(await within(report()).findByRole('heading', { name: A.upi })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Compare tray' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Compare' })).toBeNull()
  })

  it('takes a quick look at a land parcel clicked on the map, measured from its image', async () => {
    renderDashboard(`/?upi=${A.upi}`)
    await screen.findByRole('heading', { name: A.upi })
    // The report asks for its own image first; these answers are for the land parcel.
    await waitFor(() => expect(screen.getByTestId('map')).toHaveTextContent('scene none'))
    const scene = { date: Date.UTC(2026, 8, 25), cloud: 0.1, window: { from: 0, to: 1 } }
    findPlotScene.mockResolvedValueOnce(scene)
    measureParcel.mockResolvedValueOnce({ ndvi: 0.21, ndmi: -0.11, ndre: 0.16 })

    await userEvent.click(screen.getByRole('button', { name: 'map land' }))
    await waitFor(() => expect(screen.getByTestId('map')).toHaveTextContent(`selected ${LAND.upi}`))
    await waitFor(() => expect(screen.getByTestId('map')).toHaveTextContent('quick ready'))
    expect(findPlotScene).toHaveBeenCalledWith(expect.objectContaining({ rings: LAND.rings }))
    expect(measureParcel).toHaveBeenCalledWith(expect.objectContaining({ rings: LAND.rings, date: scene.date }))
    // The quick look closes the report.
    noReport()
    expect(paramInUrl('upi')).toBeNull()

    // Opening an analysed plot ends the quick look.
    await userEvent.click(screen.getByRole('button', { name: 'map parcel' }))
    expect(await within(report()).findByRole('heading', { name: B.upi })).toBeInTheDocument()
    expect(screen.getByTestId('map')).toHaveTextContent(`selected ${B.upi}`)
  })

  it("runs the GIS team's analysis on a clicked field and opens its full report", async () => {
    const analysed = parcel(LAND.upi, 'Kirehe')
    getParcel.mockImplementation(async (...args) => [A, B, analysed].find((p) => p.upi === args[0]) ?? null)
    startAnalysis.mockImplementationOnce(async () => ({ jobId: 'j1', status: 'succeeded' }))
    renderDashboard()
    await districtButton('Nyagatare')
    expect(listParcels).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('button', { name: 'map land' }))
    await waitFor(() => expect(screen.getByTestId('map')).toHaveTextContent('analyse idle'))
    await userEvent.click(screen.getByRole('button', { name: 'map analyse' }))
    expect(startAnalysis).toHaveBeenCalledWith({ upi: LAND.upi })

    expect(await screen.findByRole('heading', { name: LAND.upi })).toBeInTheDocument()
    expect(within(report()).getByText('Kirehe')).toBeInTheDocument()
    expect(paramInUrl('upi')).toBe(LAND.upi)
    // The list is read again, so the new plot joins it.
    await waitFor(() => expect(listParcels).toHaveBeenCalledTimes(2))
  })

  it('analyses a field drawn on the map under its name and opens its report', async () => {
    getParcel.mockImplementation(async (id) =>
      id.startsWith('AREA ') ? { ...parcel(id, 'Kirehe'), reliability: null } : ([A, B].find((p) => p.upi === id) ?? null),
    )
    startAnalysis.mockImplementationOnce(async () => ({ jobId: 'j3', status: 'succeeded' }))
    renderDashboard()
    await districtButton('Nyagatare')

    await userEvent.click(await screen.findByRole('button', { name: 'map draw' }))
    await waitFor(() => expect(screen.getByTestId('map')).toHaveTextContent(/name Field \d{2} [A-Z][a-z]{2} \d{4}/))
    expect(findPlotScene).toHaveBeenCalledWith(expect.objectContaining({ rings: FIELD.rings }))

    await userEvent.click(screen.getByRole('button', { name: 'map analyse' }))
    expect(startAnalysis).toHaveBeenCalledWith({ area: { rings: FIELD.rings }, name: expect.stringMatching(/^Field /) })
    expect(await screen.findByRole('heading', { name: /^AREA Field / })).toBeInTheDocument()
    expect(within(report()).getByText('Drawn field')).toBeInTheDocument()
    expect(paramInUrl('upi')).toMatch(/^AREA Field /)
    await waitFor(() => expect(listParcels).toHaveBeenCalledTimes(2))
  })

  it('finds a searched UPI that is not analysed, shows it on the map, and analyses it in one click', async () => {
    const NEW = '2/05/09/01/15'
    const field = { upi: NEW, district: 'Nyamagabe', sector: 'Kitabi', cell: 'Mujuga', village: 'Kibilizi', areaM2: 4200, rings: LAND.rings }
    let done = false
    getParcel.mockImplementation(async (id) => (id === NEW ? (done ? parcel(NEW, 'Nyamagabe') : null) : ([A, B].find((p) => p.upi === id) ?? null)))
    findLandParcel.mockResolvedValueOnce(field)
    startAnalysis.mockImplementationOnce(async () => {
      done = true
      return { jobId: 'j4', status: 'succeeded' }
    })
    renderDashboard()
    await userEvent.type(screen.getByLabelText('UPI'), NEW)
    await userEvent.click(screen.getByRole('button', { name: 'Run' }))

    expect(await within(report()).findByText(/shown on the map with a quick look/)).toBeInTheDocument()
    expect(findLandParcel).toHaveBeenCalledWith(NEW, expect.anything())
    await waitFor(() => expect(screen.getByTestId('map')).toHaveTextContent(`selected ${NEW}`))

    await userEvent.click(within(report()).getByRole('button', { name: 'Analyse this parcel' }))
    expect(startAnalysis).toHaveBeenCalledWith({ upi: NEW })
    expect(await screen.findByRole('heading', { name: NEW })).toBeInTheDocument()
    expect(paramInUrl('upi')).toBe(NEW)
  })

  it('says when a searched UPI is not in the land records, and leaves the map alone', async () => {
    renderDashboard('/?upi=5/05/10/02/1')
    expect(await within(report()).findByText('No land parcel with this UPI in the NLA records. Check the UPI.')).toBeInTheDocument()
    expect(within(report()).queryByRole('button', { name: 'Analyse this parcel' })).toBeNull()
    expect(screen.getByTestId('map')).toHaveTextContent('selected none')
  })

  it('signs out from the header', async () => {
    renderDashboard()
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(signOut).toHaveBeenCalledTimes(1)
  })
})
