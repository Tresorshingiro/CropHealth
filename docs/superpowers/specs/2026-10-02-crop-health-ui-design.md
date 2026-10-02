# Crop Health Monitoring web app: design

Date: 2026-10-02
Status: awaiting review

## Purpose

A custom web app that replaces the GIS team's ArcGIS Experience Builder
dashboard ("Crop Health Monitoring Updated"). A signed-in user types the UPI of
a land parcel and sees that parcel's crop health analysis: its location on the
map, the latest NDVI, NDMI and NDRE readings with plain-language levels, and
how the three indices changed over the last 14 months.

The GIS team's services on GeoHub (`gh.space.gov.rw`) remain the source of
truth. This app computes no indices and no interpretation of its own.

## Decisions made with the user

- Stack: React, Vite, Tailwind CSS.
- Data: live ArcGIS services from the start, no mock data.
- Appearance: both a light and a dark theme, switchable by the user.
- Sign-in: a form in the app takes GeoHub credentials; a small server exchanges
  them for a portal token. Same pattern as the `Natural-resource` project.
- Map: ArcGIS Maps SDK for JavaScript (`@arcgis/core`).
- The status badge, season, narrative and crop-cycle count shown in the
  existing dashboard are left out until the GIS team says where they come from.

## Data sources

### GeoHub feature service (token required)

`https://gh.space.gov.rw/server/rest/services/Hosted/RW_CropHealth_V2_View/FeatureServer`

| Id | Name | Used for |
|---|---|---|
| 0 | `WatchedParcels` (polygon layer) | Parcel lookup, index cards, parcels table, map outlines |
| 1 | `ParcelObservations` (table) | Time-series chart |
| 2 | `IndexGuide` (table) | Index help text |
| 3–5 | `SceneLog`, `RunLog`, `RasterRegistry` | Not used |

Spatial reference is WGS84 (4326). `maxRecordCount` is 1000.

`WatchedParcels` fields used: `upi`, `province`, `district`, `sector`, `cell`,
`village`, `area_m2`, `reliability`, `latest_date`, `ndvi`, `ndmi`, `ndre`,
`ndvi_level`, `ndmi_level`, `ndre_level`, `headline`, `usable_dates`,
`last_refreshed`.

`WatchedParcels` fields that exist but are empty in the sample record, and are
not shown in version one: `status`, `season_label`, `season_peak`,
`prev_season_peak`, `note`, `ndvi_dir`, `ndmi_dir`, `ndre_dir`.

`ParcelObservations` fields used: `upi`, `obs_date`, `ndvi`, `ndmi`, `ndre`,
`clear_share`. One row per clear Sentinel-2 date for a parcel.

`IndexGuide` fields used: `code`, `name`, `meaning`, `how_to_read`,
`thresholds`, `caveats`, `formula`, `bands`, `reference`, `sort_order`.

### Sentinel-2 imagery (public)

`https://sentinel.arcgis.com/arcgis/rest/services/Sentinel2/ImageServer`

Used as the map background through its built-in raster functions:
`NDVI Colormap`, `NDMI Colorized` and `Natural Color with DRA`. The browser
loads it directly; no token and no proxy.

## Architecture

```
Browser (React app)
  ├─ /api/auth/*            ─┐
  ├─ /api/gh/server/rest/…  ─┤→ Access server (Node) → gh.space.gov.rw
  └─ sentinel.arcgis.com  (direct, public)
```

### Access server

A small Node module with no framework, mounted as a Vite plugin for
`npm run dev` and `npm run preview`, and run standalone in front of `dist/` in
production. It is adapted from `Natural-resource/server/access-server.js`,
keeping only what this app needs.

Routes:

- `POST /api/auth/login`: body `{ username, password }`. Calls the portal's
  `generateToken` (or the OAuth password grant when `PORTAL_CLIENT_ID` and
  `PORTAL_CLIENT_SECRET` are set). On success sets a signed, HttpOnly,
  SameSite=Lax session cookie holding the token, user name and expiry, and
  returns `{ authenticated: true, user }`. On failure returns 401 with the
  portal's own message, including its `details` (for example the lockout
  message).
- `GET /api/auth/session`: returns `{ authenticated, user }`.
- `POST /api/auth/logout`: clears the cookie.
- `GET /api/gh/server/rest/services/Hosted/RW_CropHealth_V2_View/FeatureServer/**`:
  forwards to the ArcGIS Server with the session token attached and the
  referer the token was bound to. Any `token` parameter sent by the browser is
  dropped. Paths outside this one service get 404, so the proxy cannot be used
  to reach anything else. Other methods get 405: the app only reads. With no
  valid session it returns 401.

Not carried over from Natural-resource: response body rewriting, the portal
and Survey123 proxies, the frame-referer routing and the TLS dev certificate
setup. Those exist there to embed whole ArcGIS apps in iframes, which this app
does not do.

ArcGIS reports auth failures as HTTP 200 with `{ "error": { "code": 498|499 } }`
in the body. The proxy converts those to HTTP 401 so the client has one signal
for "session no longer valid".

Configuration (`.env`, server-side only, never `VITE_`-prefixed):
`PORTAL_URL`, `SERVER_URL`, `SESSION_SECRET`, optional `PORTAL_CLIENT_ID` and
`PORTAL_CLIENT_SECRET`. `SESSION_SECRET` must be set in production or the
server refuses to start.

### Frontend structure

```
src/
  main.jsx, App.jsx           routing and providers
  auth/                       AuthContext, AuthGate, LoginPage
  api/
    arcgis.js                 query helper: fetch, paging, error mapping
    cropHealth.js             getParcel, getObservations, listParcels, getIndexGuide
  theme/                      ThemeProvider, ThemeToggle
  lib/
    upi.js                    normalise and validate a UPI
    history.js                recent UPIs in localStorage
  pages/Dashboard.jsx         layout and selected-parcel state
  components/
    UpiSearch.jsx             input, Run button, History tab
    ParcelMap.jsx             ArcGIS map
    ParcelSummary.jsx         title, location, index cards, headline
    IndexCard.jsx             one index value and level
    IndexGuideDialog.jsx      help text for one index
    IndexChart.jsx            time-series chart
    ParcelsTable.jsx          analysed parcels
```

Components receive plain objects from `api/cropHealth.js` and never build
ArcGIS REST requests themselves. Adding the Analyse UPI tool later means one
new function in that module.

### Data layer contract

- `getParcel(upi)` → parcel object with attributes and polygon geometry, or
  `null` when no row matches. Query: layer 0, `where upi = '<upi>'`,
  `outFields=*`, `returnGeometry=true`, `outSR=4326`.
- `getObservations(upi)` → array of `{ date, ndvi, ndmi, ndre, clearShare }`
  sorted by date ascending. Query: table 1, `where upi = '<upi>'`,
  `orderByFields=obs_date`.
- `listParcels()` → `{ parcels, truncated }`, where each parcel is
  `{ upi, district, ndviLevel, latestDate, rings }`. One call feeds both the
  table and the map outlines. Paged with `resultOffset` until
  `exceededTransferLimit` is false, stopping after 5 pages (5,000 parcels);
  `truncated` is true when more remain, and the table says so.
- `getIndexGuide()` → array of the three guide entries sorted by `sort_order`,
  fetched once and cached for the session.

The UPI is validated before it is placed in a `where` clause (see below), so
no user text reaches the query unescaped.

Errors are raised as typed errors: `SessionExpiredError` (HTTP 401),
`PortalError` (an ArcGIS error body or a non-2xx status) and `NetworkError`.

## Screens

### Sign-in page

Username and password fields, a Sign in button with a busy state, and the
error message from the server. A signed-in user who visits it is redirected to
the dashboard. Any other route without a session redirects here and returns to
the original location after sign-in.

### Dashboard

Laid out like the existing dashboard: header on top; a row with the search
panel, the map and the result panel; a row with the parcels table and the
chart. On narrow screens the areas stack in one column.

**Header:** app title, theme toggle, signed-in user's name, Sign out.

**Search panel:**
- Tools tab: UPI input and Run button. Enter submits.
- History tab: the last 20 UPIs opened in this browser, most recent first;
  clicking one opens it.

**Map:**
- Sentinel-2 background with a switcher: NDVI (default), NDMI, natural colour.
- `WatchedParcels` outlines, drawn from the `listParcels()` result.
- The selected parcel is highlighted and the view zooms to it.
- Clicking a parcel on the map selects it.
- Before any parcel is selected the map shows the layer's full extent
  (Rwanda).

**Result panel:**
- Title: UPI and district. Below it: sector, cell, village.
- Three cards for NDVI, NDMI and NDRE: value to two decimals and the level
  text from the layer.
- Latest clear date, area (shown in hectares, from `area_m2`), reliability and
  number of clear dates.
- The `headline` text.
- An info button on each card opens the `IndexGuide` entry for that index.

**Chart:** NDVI, NDMI and NDRE as three lines over the observation dates, with
a shared hover tooltip showing date and the three values, and a legend. The
three indices keep the same colours here as on the cards.

**Analysed parcels table:** UPI, district, NDVI level. Sortable by column,
clicking a row selects that parcel. The selected row is highlighted.

The selected UPI is kept in the URL (`?upi=…`), so a parcel view can be
reloaded or shared with another signed-in user.

## Themes

The app has a light theme and a dark theme, covering the sign-in page and the
dashboard.

- On first visit the theme follows the operating system setting
  (`prefers-color-scheme`).
- The header toggle switches between light and dark. The choice is stored in
  `localStorage` and wins over the system setting on later visits. The sign-in
  page has the same toggle.
- The theme is applied before the first paint (a small inline script in
  `index.html` sets the class on `<html>`), so the page does not flash the
  wrong theme on load.
- Implementation: Tailwind's class-based dark mode. Interface colours are
  defined once as CSS variables for each theme (page, surface, border, text,
  accent) and referenced through Tailwind theme tokens, so components do not
  carry per-theme colour values.
- The three index colours are chosen separately for each theme so they stay
  distinguishable against both backgrounds, including for colour-blind
  readers. They live in one palette module keyed by theme, together with the
  chart's grid, axis and tooltip colours, because the chart library takes
  colours as values, not CSS variables.
- Index values and labels are written in the normal text colour; the index
  colour appears as a line or a swatch beside them.
- The chart has a table view of the same numbers.
- The ArcGIS map widgets (zoom, layer switcher) use the SDK's matching light
  or dark stylesheet. The Sentinel-2 imagery itself is the same in both
  themes; the parcel outline and highlight colours are picked to stay visible
  over it.

## UPI handling

A UPI looks like `5/05/10/02/1939`: province, district, sector, cell, parcel
number. Input is trimmed and inner whitespace removed, then checked against
`^\d/\d{2}/\d{2}/\d{2}/\d+$`. Anything else shows "Enter a UPI in the form
5/05/10/02/1939" and no request is sent.

## States and errors

| Situation | Behaviour |
|---|---|
| Nothing selected yet | Result panel and chart show a prompt to enter a UPI |
| Loading | Skeleton placeholders in the result panel and chart |
| UPI format wrong | Inline message under the input, no request |
| UPI not in the layer | "This parcel has not been analysed yet." No placeholder values |
| Parcel found, no observations | Cards shown, chart shows "No clear observations yet" |
| Session expired | Redirect to sign-in, then back to the same UPI |
| Portal unreachable or returns an error | Error message with a Retry button; the rest of the page stays usable |
| Null index value | Card shows "–" and no level |

## Out of scope for version one

- Status badge, season, narrative, trend line and crop-cycle count. Waiting for
  the GIS team to say where these come from. The result panel is built so this
  block can be added below the cards.
- Running a new analysis for a UPI that is not in the layer. Needs the REST URL
  of the "Crop Health V2 - Analyse UPI" tool.
- Drawing a field on the map.
- The "This year vs last year" and "Imagery by date" web maps.

## Testing

Vitest with Testing Library.

- `lib/upi.js`: valid, invalid and whitespace cases.
- `api/cropHealth.js`: mapping of ArcGIS responses to app objects, paging,
  not-found, and the three error types, using stubbed `fetch`.
- Access server: login success and failure, session cookie signing and
  expiry, proxy path restriction, dropped client `token` parameter, 498/499
  converted to 401.
- Components: not-found, loading, error-with-retry and null-value states of
  the result panel; table row selection; history list.
- Theme: follows the system setting when nothing is stored, the toggle
  switches and persists the choice, and a stored choice overrides the system
  setting.

The map component is checked by running the app, not by unit tests.

## Open items with the GIS team

1. Where the status, season, narrative and crop-cycle values come from, and
   the rules or code behind them.
2. The REST URL of the Analyse UPI tool, and its inputs and outputs.
3. Whether a registered OAuth app (client ID and secret) should be used for
   sign-in instead of `generateToken`.
