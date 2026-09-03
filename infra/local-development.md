# Local development

The helper scripts under `infra/scripts/` keep the common commands consistent
without changing application files.

## Prerequisites

- Node.js 22 or a compatible current LTS release.
- Wrangler available through the repository toolchain or via `npx wrangler`.
- The application directories present: `apps/web/` and `apps/api/`.

No Cloudflare account is required for the static web preview or local-only D1
simulation. Avoid `--remote` during routine development because it connects to
real Cloudflare resources and can incur cost or mutate shared data.

## Start services

From the repository root:

```text
# Static frontend at http://localhost:4173
infra\scripts\dev.cmd web

# Worker with local bindings at http://localhost:8787
infra\scripts\dev.cmd api
```

PowerShell users can run the script directly:

```powershell
.\infra\scripts\dev.ps1 web
.\infra\scripts\dev.ps1 api
```

Run the two commands in separate terminals. The web app's local API URL must
be configured through its existing public runtime config before testing API
calls. Keep that local value out of commits.

## Checks before opening a PR

```text
npm run check
node --check apps/api/src/index.js
```

The CI workflow runs the same checks plus a whitespace/diff check. If a check
reports missing app files, resolve that with the application owner; do not
weaken the infrastructure workflow to conceal the failure.

## D1 workflow

Use local D1 migrations first:

```text
npx wrangler d1 migrations apply margin-catalog --config apps/api/wrangler.jsonc --local
npx wrangler dev --config apps/api/wrangler.jsonc --local
```

Remote bindings and production migration commands require explicit operator
approval and the Cloudflare credentials described in
[environment.md](environment.md).
