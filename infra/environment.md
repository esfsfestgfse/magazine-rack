# Environment contract

This document is the contract between local development, GitHub Actions, the
static frontend, and the Cloudflare Worker. Values shown as examples are
placeholders and must not be copied as production credentials.

| Name | Where | Secret? | Required | Purpose |
| --- | --- | --- | --- | --- |
| `PUBLIC_API_BASE_URL` | GitHub repository variable | No | Pages deploy | Public HTTPS origin used by the frontend |
| `CLOUDFLARE_API_TOKEN` | `cloudflare-production` environment secret | Yes | Worker deploy | Least-privilege Wrangler authentication |
| `CLOUDFLARE_ACCOUNT_ID` | `cloudflare-production` environment variable | No | Worker deploy | Explicit Cloudflare account selection |
| `ALLOWED_ORIGIN` | `apps/api/wrangler.jsonc` `vars` | No | Production | Exact browser origin accepted by the API |
| `ENVIRONMENT` | `apps/api/wrangler.jsonc` `vars` | No | All environments | Runtime environment label |
| `DB` | `apps/api/wrangler.jsonc` D1 binding | No | Production | In-process D1 binding name; the ID is infrastructure metadata |

## Local files

- Keep API-only local secrets in `apps/api/.dev.vars`; the repository
  `.gitignore` excludes `.dev.vars`.
- Keep local non-secret Worker values in the Wrangler config or a documented
  local environment override.
- Do not create a root `.env` containing production credentials.
- The frontend's API URL is public configuration. For local API testing, set
  the local frontend config to `http://localhost:8787` through the app team's
  normal development process; never use a production token in the browser.

Example local `.dev.vars` shape (names only; use developer-owned values):

```dotenv
ENVIRONMENT=development
ALLOWED_ORIGIN=http://localhost:4173
```

## GitHub environment policy

Create these environments only if the release process requires them:

- `github-pages`: optional approval gate for static publication.
- `cloudflare-production`: required approval gate for Worker production
  deployment and holder of `CLOUDFLARE_API_TOKEN`.

The Cloudflare token should be scoped to the target account and only the
permissions needed to deploy Workers and manage the target D1 database. Do not
use a global account owner token. Rotate it if a maintainer, repository, or
workflow trust boundary changes.

## Rotation and incident response

If a credential may have been exposed, pause deployment, revoke/rotate it in
the owning service, review GitHub Actions logs and audit events, then issue a
replacement secret. Never paste the old value into an issue, PR, or chat while
investigating.
