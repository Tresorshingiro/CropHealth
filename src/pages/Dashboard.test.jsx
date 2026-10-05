import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PortalError, SessionExpiredError } from '../api/arcgis.js'
import { getIndexGuide, getObservations, getParcel, listParcels } from '../api/cropHealth.js'
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

vi.mock('../components/ParcelMap.jsx', () => ({
  default: ({ parcels, selected, onSelect }) => (
    <div data-testid="map">
      {`${parcels.length} outlines, selected ${selected?.upi ?? 'none'}`}
      <button type="button" onClick={() => onSelect('5/02/06/06/1702')}>
        map parcel
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
const row = (p) => ({ upi: p.upi, district: p.district, latestDate: p.latestDate, rings: p.rings })
const OBSERVATIONS = [{ date: 1754265600000, ndvi: 0.39, ndmi: -0.09, ndre: 0.24, clearShare: 1 }]
const GUIDE = [
  {
    code: 'NDVI',
    name: 'Normalized Difference Vegetation Index',
    meaning: 'How much green leaf is on the ground.',
    thresholds: 'below 0.20 bare; 0.20-0.35 very sparse; 0.35-0.55 growing; 0.55-0.75 full canopy; above 0.75 dense',
  },
]
const PROMPT = 'Search a UPI, pick a parcel on the map, or choose one from the list.'

function Search() {
  return <output data-testid="search">{useLocation().search}</output>
}
const selectedInUrl = () => new URLSearchParams(screen.getByTestId('search').textContent).get('upi')

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
const inList = (upi) => within(sidebar()).findByRole('button', { name: new RegExp(upi) })

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
    expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument()
    expect(screen.getByText(PROMPT)).toBeInTheDocument()
    noReport()
    expect(await inList(B.upi)).toBeInTheDocument()
    expect(screen.getByText('Parcels analysed').closest('div')).toHaveTextContent('2')
    await waitFor(() => expect(screen.getByTestId('map')).toHaveTextContent('2 outlines, selected none'))
    expect(getParcel).not.toHaveBeenCalled()
  })

  it('opens the parcel named in the link as a report and remembers it in history', async () => {
    renderDashboard(`/?upi=${A.upi}`)
    expect(await within(report()).findByRole('heading', { name: A.upi })).toBeInTheDocument()
    expect(within(report()).getByText('Kirehe')).toBeInTheDocument()
    expect(await screen.findByTestId('map')).toHaveTextContent(`selected ${A.upi}`)
    expect(await screen.findByText('1 clear date')).toBeInTheDocument()
    expect(screen.queryByText(PROMPT)).toBeNull()
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

  it('opens a parcel from the list', async () => {
    renderDashboard()
    await userEvent.click(await inList(B.upi))
    expect(await within(report()).findByRole('heading', { name: B.upi })).toBeInTheDocument()
    expect(selectedInUrl()).toBe(B.upi)
  })

  it('opens a drawn area from the list, like a parcel', async () => {
    const area = { ...parcel('AREA North field', 'Kirehe'), reliability: null, ndviLevel: null, headline: null }
    getParcel.mockImplementation(async (id) => [A, B, area].find((p) => p.upi === id) ?? null)
    listParcels.mockResolvedValue({ parcels: [row(A), row(B), row(area)], truncated: false })
    renderDashboard()
    await userEvent.click(await inList(area.upi))
    expect(await within(report()).findByRole('heading', { name: area.upi })).toBeInTheDocument()
    expect(within(report()).getByText('Drawn field')).toBeInTheDocument()
    expect(selectedInUrl()).toBe(area.upi)
    expect(getParcel).toHaveBeenCalledWith(area.upi, expect.anything())
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('opens the menu on a small screen, and closes it on Escape, on close and after choosing a parcel', async () => {
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
    await userEvent.click(await inList(B.upi))
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
    expect(screen.getByText(PROMPT)).toBeInTheDocument()
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

  it('signs out from the header', async () => {
    renderDashboard()
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(signOut).toHaveBeenCalledTimes(1)
  })
})
