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

The rack includes dedicated Comic Series, Trove Papers, and DPLA Periodicals shelves. Trove and DPLA are optional because their search APIs require keys: configure `TROVE_API_KEY` and `DPLA_API_KEY` as Worker secrets for the backend, or use the setup card in the standalone build for local-only testing. The browser build never hardcodes those credentials.

The adapters target Trove API v3 and the DPLA API v2 item search; see the [Trove API v3 overview](https://trove.nla.gov.au/sites/default/files/2023-02/Introducing%20Trove%20API%20v3.pdf) and [DPLA API documentation](https://pro.dp.la/developers/api-codex) for account/key setup.

## Source policy

Catalog adapters are limited to sources that expose public or host-authorized access. The application does not scrape shadow-library indexes or provide unauthorized download flows.

## Status

The ground-up MVP reconstruction is live on GitHub Pages in self-contained
demo mode. Production API deployment remains an operator step because the
Cloudflare account and D1 ID are not available in this workspace.
