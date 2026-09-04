# Magazine Rack

Magazine Rack is a discovery-first reading room for magazines, comics, newspapers, zines, and other periodicals available from public or host-authorized collections.

The current GitHub Pages release is the stable standalone shell in `apps/web/index.html`, backed by the Worker in `apps/api/`. The modular files in `apps/web/src/` are maintained as migration/test material and are not loaded by the deployed entrypoint until a build step is introduced and verified.

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

### Production Worker deployment

The GitHub Actions Worker workflow expects these two GitHub settings:

- Repository or `cloudflare-production` environment secret: `CLOUDFLARE_API_TOKEN`
- Repository or `cloudflare-production` environment variable: `CLOUDFLARE_ACCOUNT_ID`

The API token must be allowed to deploy Workers and apply migrations to the `margin-catalog` D1 database. The workflow validates both names before installing Wrangler, then runs the production migration and deploy commands from `apps/api/wrangler.jsonc`.

## Periodical source packs

The rack is read-first: visible shelves only keep records with an in-app image, IIIF scan, sequential scan, or Internet Archive reading item. Catalog-only lanes such as GCD Comic Series, Open Library Subjects, generic Google Books previews, DPLA, and LOC/ChronAm are not exposed as primary shelves until their reader contracts are reliable. The remaining newspaper rack is calendar-aware: it queries the current month/day across representative historical years, so September 3 shows September 3 editions regardless of year.

Comic Book Plus is included for comics because its public issue pages expose sequential scan images and page counts, allowing the app's in-app reader to turn pages instead of opening catalog metadata.

## Source policy

Catalog adapters are limited to sources that expose public or host-authorized access. The application does not scrape shadow-library indexes or provide unauthorized download flows.

## Status

The ground-up MVP reconstruction is live on GitHub Pages with a deployed
Cloudflare Worker API. Open Library reading items hand users to Open Library
for account sign-in; the app never collects or stores Open Library passwords.
