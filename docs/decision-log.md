# Decision log

## 2026-09-03 — Ground-up reconstruction

- Replaced the legacy single-file UI direction with modular static frontend files.
- Separated catalog/search concerns into a backend API so upstream integrations, caching, and resilience are not browser-only concerns.
- Kept GitHub Pages as the frontend delivery target and Cloudflare Workers/D1 as the backend target.
- Preserved only domain knowledge from the previous app: public catalog adapters, in-app reading where an upstream source supports it, and graceful fallback links.
