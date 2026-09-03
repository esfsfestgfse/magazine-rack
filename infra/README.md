# Magazine Rack infrastructure

This directory owns deployment, environment, and local-operations guidance for
Magazine Rack. Application code remains under `apps/`; this directory does not
create or modify application behavior.

## Deployment topology

- `apps/web/` is a dependency-light static site deployed to GitHub Pages.
- `apps/api/` is a Cloudflare Worker deployed with Wrangler.
- The Worker uses a Cloudflare D1 binding named `DB` for catalog and library
  persistence.
- GitHub Pages receives the public API URL through the repository variable
  `PUBLIC_API_BASE_URL`; it is written into the Pages artifact at build time.

## Runbooks

- [GitHub Pages](github-pages.md)
- [Cloudflare Workers and D1](cloudflare-workers-d1.md)
- [Environment contract](environment.md)
- [Local development](local-development.md)
- [CI security](ci-security.md)

## Ownership and safety boundaries

1. No deployment is performed by these files when they are added to a branch.
   The Worker workflow is manual and protected by a GitHub environment.
2. Production credentials belong in GitHub environment secrets or Wrangler's
   secret store, never in source, JSONC, logs, or command arguments.
3. D1 migrations are forward-only release artifacts. A backup and a migration
   review are required before applying one remotely.
4. Catalog adapters may use public or host-authorized sources only. This
   infrastructure does not add, enable, or document shadow-library or piracy
   integrations.

## Release gate

The lead should not approve production until all of the following are true:

- `apps/web/` and `apps/api/` pass the repository checks.
- The production D1 ID replaces the placeholder in
  `apps/api/wrangler.jsonc`.
- The production `ALLOWED_ORIGIN` is the final GitHub Pages origin.
- GitHub variable `PUBLIC_API_BASE_URL` points to the deployed Worker over
  HTTPS.
- Cloudflare credentials are configured in a protected environment with the
  minimum required permissions.
- A D1 backup, migration review, health check, and Worker rollback owner are
  recorded for the release.
