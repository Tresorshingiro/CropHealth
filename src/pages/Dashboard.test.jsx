import { act, render, screen, waitFor } from '@testing-library/react'
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
  default: ({ parcels, selected }) => (
    <div data-testid="map">{`${parcels.length} outlines, selected ${selected?.upi ?? 'none'}`}</div>
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
const row = (p) => ({ upi: p.upi, district: p.district, ndviLevel: p.ndviLevel, latestDate: p.latestDate, rings: p.rings })
const OBSERVATIONS = [{ date: 1754265600000, ndvi: 0.39, ndmi: -0.09, ndre: 0.24, clearShare: 1 }]

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

const title = (p) => `${p.upi} · ${p.district}`

beforeEach(() => {
  for (const fn of [getParcel, getObservations, listParcels, getIndexGuide, expire, signOut]) fn.mockReset()
  getParcel.mockImplementation(async (upi) => [A, B].find((p) => p.upi === upi) ?? null)
  getObservations.mockResolvedValue(OBSERVATIONS)
  listParcels.mockResolvedValue({ parcels: [row(A), row(B)], truncated: false })
})

describe('Dashboard', () => {
  it('starts with a prompt, the parcels table and the user name', async () => {
    renderDashboard()
    expect(screen.getByText('Tresor S')).toBeInTheDocument()
    expect(screen.getByText('Enter a UPI and press Run to see its analysis.')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: B.upi })).toBeInTheDocument()
    expect(await screen.findByTestId('map')).toHaveTextContent('2 outlines, selected none')
    expect(getParcel).not.toHaveBeenCalled()
  })

  it('opens the parcel named in the link and remembers it in history', async () => {
    renderDashboard(`/?upi=${A.upi}`)
    expect(await screen.findByRole('heading', { name: title(A) })).toBeInTheDocument()
    expect(await screen.findByTestId('map')).toHaveTextContent(`selected ${A.upi}`)
    expect(await screen.findByText(/1 clear dates/)).toBeInTheDocument()
    expect(JSON.parse(window.localStorage.getItem('crophealth-history'))).toEqual([A.upi])
    expect(screen.getByLabelText('UPI')).toHaveValue(A.upi)
  })

  it('runs a search, puts the UPI in the link and shows the result', async () => {
    renderDashboard()
    await userEvent.type(screen.getByLabelText('UPI'), ` ${A.upi} `)
    await userEvent.click(screen.getByRole('button', { name: 'Run' }))
    expect(await screen.findByRole('heading', { name: title(A) })).toBeInTheDocument()
    expect(selectedInUrl()).toBe(A.upi)
  })

  it('says when the parcel has not been analysed, and leaves the chart idle', async () => {
    renderDashboard('/?upi=5/05/10/02/1')
    expect(await screen.findByText('This parcel has not been analysed yet.')).toBeInTheDocument()
    expect(screen.getByText('Select a parcel to see its history.')).toBeInTheDocument()
    expect(window.localStorage.getItem('crophealth-history')).toBeNull()
  })

  it('shows the format message for a malformed UPI in the link and requests nothing', async () => {
    renderDashboard('/?upi=abc')
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a UPI in the form 5/05/10/02/1939')
    await screen.findByRole('button', { name: B.upi })
    expect(getParcel).not.toHaveBeenCalled()
  })

  it('shows an error with Retry, and recovers when Retry succeeds', async () => {
    getParcel.mockRejectedValueOnce(new PortalError('Could not reach GeoHub. Try again in a moment.'))
    renderDashboard(`/?upi=${A.upi}`)
    expect(await screen.findByText('Could not reach GeoHub. Try again in a moment.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('heading', { name: title(A) })).toBeInTheDocument()
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
    await userEvent.click(await screen.findByRole('button', { name: B.upi }))
    expect(await screen.findByRole('heading', { name: title(B) })).toBeInTheDocument()

    await act(async () => finishA(A))
    expect(screen.getByRole('heading', { name: title(B) })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: title(A) })).toBeNull()
    expect(selectedInUrl()).toBe(B.upi)
  })

  it('opens the index guide from a card', async () => {
    getIndexGuide.mockResolvedValue([
      { code: 'NDVI', name: 'Normalized Difference Vegetation Index', meaning: 'How much green leaf is on the ground.' },
    ])
    renderDashboard(`/?upi=${A.upi}`)
    await userEvent.click(await screen.findByRole('button', { name: 'About NDVI' }))
    const dialog = await screen.findByRole('dialog', { name: 'Normalized Difference Vegetation Index' })
    expect(dialog).toHaveTextContent('How much green leaf is on the ground.')
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('signs out from the header', async () => {
    renderDashboard()
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(signOut).toHaveBeenCalledTimes(1)
  })
})
