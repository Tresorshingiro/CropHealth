# Crop Health Monitoring

A web app for looking up a land parcel by UPI and viewing its crop health
analysis (NDVI, NDMI, NDRE) from the GIS team's GeoHub services.

## Run it

```
npm install
npm run dev
```

Open http://localhost:5173 and sign in with a GeoHub account that can see the
`WatchedParcels`, `ParcelObservations` and `IndexGuide` services. No `.env`
file is needed for development.

## Test

```
npm test
```

## Production

```
copy .env.example .env     # then set SESSION_SECRET to a real value
npm run build
npm start
```

`npm start` runs `server/index.js`, which serves `dist/` and the API routes on
one port. It speaks plain HTTP: put it behind an HTTPS reverse proxy that sets
`X-Forwarded-Proto` and `X-Forwarded-Host`, so the session cookie is marked
Secure and the portal token is bound to the public address.

The app cannot be hosted as static files only. Sign-in (`/api/auth/*`) and the
GeoHub proxy (`/api/data/*`) are routes on the Node process.

### On Vercel

`vercel.json` sends every `/api/*` request to the function in `api/index.js`
(the same access server) and every other path to `index.html`. Set
`SESSION_SECRET` (and any other `.env` values) in the project's Environment
Variables, then redeploy.

## How access works

1. The sign-in form posts the GeoHub username and password to this server.
2. The server exchanges them for a portal token and stores it in an
   encrypted, HttpOnly cookie. Neither page scripts nor the user can read the
   token from it. Changing `SESSION_SECRET` signs everyone out.
3. Data requests go to `/api/data/<table>/query`, where the table is
   `parcels`, `observations` or `guide`. The server picks the GeoHub layer,
   adds the token and forwards the `GET` query; every other path is answered
   with 404. `DATA_SOURCE` picks the layers: `referenced` (default) reads the
   GIS team's `WatchedParcels`, `ParcelObservations` and `IndexGuide`
   services in their geodatabase, which the analysis notebook writes to;
   `hosted` reads the notebook's earlier `RW_CropHealth_V2_View`. The app
   must read where the notebook writes, or new analyses will not appear: use
   `hosted` only if the GIS team sets the notebook back to its hosted service.
4. `POST /api/analysis` runs the GIS team's analysis tool (about a minute) for
   either a parcel, `{ "upi": "5/05/10/02/1939" }`, or a field drawn on the
   map, `{ "area": { "rings": [[[lng, lat], …]] }, "name": "North field" }`.
   `GET /api/analysis/<jobId>` reports `running`, `succeeded` or `failed`. The
   server checks both again: a UPI must be well formed; a field must be one
   closed ring of at most 500 points inside Rwanda, about 5 km across at
   most, with a name of letters, digits, spaces, `_` and `-` (up to 26). The
   tool writes the parcel, or the field as `AREA <name>`, into the feature
   service, so it then appears in the list with a full report. A report's
   "Update with new images" sends its id again, `{ "upi": "5/05/10/02/1939" }`
   or `{ "upi": "AREA North field" }`: the tool re-reads all 14 months, so new
   Sentinel-2 dates join the history. Whether a
   user may run it is decided by their GeoHub permissions.

Sentinel-2 imagery is public and loaded by the browser directly.
