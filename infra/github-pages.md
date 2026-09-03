# GitHub Pages deployment

The repository workflow at `.github/workflows/pages.yml` publishes the
contents of `apps/web/` as a static GitHub Pages artifact. There is no frontend
build toolchain in the current app, so the workflow intentionally does not run
an install step or execute untrusted scripts from the repository.

## One-time GitHub setup

1. In repository Settings → Pages, select **GitHub Actions** as the source.
2. Create repository variable `PUBLIC_API_BASE_URL` with the final HTTPS Worker
   URL, for example `https://margin-api-production.<account-subdomain>.workers.dev`.
   This is public configuration, not a secret.
3. If a custom domain is used later, set the Pages domain and change the
   Worker `ALLOWED_ORIGIN` to the exact HTTPS origin. Do not use `*` for the
   production API.
4. Protect the `github-pages` environment if the repository requires an
   approval gate for production publication.

## Workflow behavior

- Pull requests run validation only; they do not publish Pages.
- Pushes to `main` and manual dispatch publish Pages.
- A clean `config.js` is generated inside the runner workspace from
  `PUBLIC_API_BASE_URL`. The tracked application file is not changed.
- The workflow fails when the variable is missing, malformed, or not HTTPS.
- `contents: read`, `pages: write`, and `id-token: write` are granted only at
  the workflow/job that needs them.
- A concurrency group cancels superseded deployments so an older artifact does
  not win a race with a newer one.

## Recovery

If a bad frontend is published, revert the responsible commit and rerun the
workflow. The backend and D1 data are independent of the Pages artifact.
