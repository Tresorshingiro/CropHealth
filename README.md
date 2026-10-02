# Crop Health Monitoring

A web app for looking up a land parcel by UPI and viewing its crop health
analysis (NDVI, NDMI, NDRE) from the GIS team's GeoHub services.

## Run it

```
npm install
npm run dev
```

Open http://localhost:5173 and sign in with a GeoHub account that can see the
`RW_CropHealth_V2_View` layer. No `.env` file is needed for development.

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
GeoHub proxy (`/api/gh/server/*`) are routes on the Node process.

## How access works

1. The sign-in form posts the GeoHub username and password to this server.
2. The server exchanges them for a portal token and stores it in an
   encrypted, HttpOnly cookie. Neither page scripts nor the user can read the
   token from it. Changing `SESSION_SECRET` signs everyone out.
3. Data requests go to `/api/gh/server/...`. The server adds the token and
   forwards them to GeoHub. Only `GET` queries on the parcel layer and the
   observation and index-guide tables of the `RW_CropHealth_V2_View` feature
   service are forwarded; every other path is answered with 404.

Sentinel-2 imagery is public and loaded by the browser directly.
