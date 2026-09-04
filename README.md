# Magazine Rack

Magazine Rack is a discovery-first reading room for magazines, comics, newspapers, zines, and other periodicals available from public or host-authorized collections.

This repository is a ground-up reconstruction. The legacy single-file app is reference material only; its interface and monolithic architecture are not carried forward.

## Project layout

- `apps/web/` — static PWA frontend for GitHub Pages
- `apps/api/` — Cloudflare Worker API and D1 schema
- `docs/` — product and architecture decisions
- `infra/` — deployment and environment guidance
- `qa/` — acceptance and security criteria

## Local preview

The frontend is dependency-light and can be served from any static server. The API can be run with Wrangler once the Cloudflare CLI is available.

```text
pnpm install
pnpm run serve:web
pnpm run api:dev
```

The web shell runs in demo mode until `apps/web/config.js` points it at a deployed API. The Worker includes bounded route-specific rate limits; production should also use a shared edge/API limiter for cross-isolate enforcement.

## Periodical source packs

The rack is read-first: visible shelves only keep records with an in-app image, IIIF scan, or Internet Archive reading item. Catalog-only lanes such as GCD Comic Series, Open Library Subjects, and generic Google Books previews are not exposed as shelves. Newspaper racks are calendar-aware: they query the current month/day across representative historical years, so September 3 shows September 3 editions regardless of year. DPLA is optional because its search API requires a key: configure `DPLA_API_KEY` as a Worker secret for the backend, or use the setup card in the standalone build for local-only testing. The browser build never hardcodes that credential.

The DPLA adapter targets the DPLA API v2 item search; see the [DPLA API documentation](https://pro.dp.la/developers/api-codex) for account/key setup.

## Source policy

Catalog adapters are limited to sources that expose public or host-authorized access. The application does not scrape shadow-library indexes or provide unauthorized download flows.

## Status

The ground-up MVP reconstruction is live on GitHub Pages with a deployed
Cloudflare Worker API. Open Library reading items hand users to Open Library
for account sign-in; the app never collects or stores Open Library passwords.
