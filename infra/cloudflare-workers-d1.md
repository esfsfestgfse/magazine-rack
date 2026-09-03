# Cloudflare Workers and D1 deployment

The application-owned source of truth is `apps/api/wrangler.jsonc`. The
infrastructure layer provides the release procedure and does not edit that
file. The current config names the Worker `margin-api`, binds D1 as `DB`, and
contains placeholders that must be resolved before production.

## Required production values

Update the application-owned Wrangler config through the normal application
change process before release:

- Replace `REPLACE_WITH_D1_DATABASE_ID` with the real production D1 database ID.
- Replace `https://REPLACE_WITH_GITHUB_OWNER.github.io` with the exact Pages
  origin (or the approved custom-domain origin).
- Confirm the Worker name `margin-api-production` is the approved public name.
- Keep `ENVIRONMENT=production` in the production environment.
- Keep observability enabled and review log retention/access with the owner.

Do not put API tokens, library keys, upstream credentials, or other secret
values in `wrangler.jsonc`. Non-secret values belong in `vars`; secrets are
managed with `wrangler secret put` or the protected CI environment.

## Local validation and deployment sequence

Run these commands from the repository root. They validate or deploy only when
the operator explicitly invokes them; the GitHub workflows do not run them on
pull requests.

```text
# Check authentication without printing credentials.
npx wrangler whoami

# Local Worker with local D1 simulation.
npx wrangler dev --config apps/api/wrangler.jsonc --local

# Validate the bundle without publishing it.
npx wrangler deploy --config apps/api/wrangler.jsonc --env production --dry-run

# Apply a reviewed migration locally first.
npx wrangler d1 migrations apply margin-catalog --config apps/api/wrangler.jsonc --local

# Back up production before a migration. Store the output outside the repo.
npx wrangler d1 export margin-catalog --config apps/api/wrangler.jsonc --remote --output <secure-backup-path>

# Apply the reviewed migration only after the backup succeeds.
npx wrangler d1 migrations apply margin-catalog --config apps/api/wrangler.jsonc --remote

# Deploy the Worker after migration compatibility is confirmed.
npx wrangler deploy --config apps/api/wrangler.jsonc --env production

# Verify the public health endpoint and inspect logs using the approved account.
# (Use the final URL from the release record; do not put tokens in curl.)
curl --fail --location https://<worker-host>/health
npx wrangler tail margin-api-production --format json
```

The `margin-catalog` name above matches the current config. If the application
team changes it, update the runbook and config together.

## D1 migration policy

- Every schema change is a numbered migration committed with the application.
- Review SQL for indexes, foreign keys, destructive operations, and query-plan
  impact before remote application.
- Prefer additive, backward-compatible changes: add columns/tables first,
  deploy code that can read both shapes, backfill, then remove old shapes in a
  later release.
- Never use a production `--local` command by mistake, and never apply an
  unreviewed SQL file from a developer workstation.
- Treat the export as sensitive if catalog metadata or library data is present;
  do not commit it or upload it to unapproved storage.

## Secrets and rollback

Use an interactive prompt so secret values do not appear in shell history:

```text
npx wrangler secret put <SECRET_NAME> --config apps/api/wrangler.jsonc --env production
npx wrangler secret list --config apps/api/wrangler.jsonc --env production
```

Worker code can be rolled back to a prior version with Wrangler, but D1 schema
changes are not automatically reversible. A rollback owner and a
forward-compatible migration plan are therefore release prerequisites.

## Application review items before production

The current Worker contains an in-memory rate-limit map. That state is not a
durable, globally coordinated rate limiter across edge isolates. Treat it as a
best-effort guard and obtain an application/security decision before claiming
strong abuse protection. Also verify that every source adapter remains limited
to public or host-authorized access; this infrastructure intentionally does not
support shadow-library or piracy sources.
