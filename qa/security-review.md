# Magazine Rack security review

Review basis: read-only inspection of the reconstructed application, especially `apps/api/src/index.js`, `apps/api/src/http.js`, `apps/api/src/rate-limit.js`, `apps/api/src/sources/common.js`, `apps/api/src/sources/request.js`, `apps/api/wrangler.jsonc`, and the Pages workflows. This is a QA/security gate, not an application-code change.

## Executive assessment

The Worker now has hard-coded approved provider names, parameterized D1 queries, bounded text and upstream bodies, redirect rejection, centralized outbound URL validation, partial-result handling, exact-origin CORS, and an active `429` path. Release is not security-ready until the production placeholders are replaced, a shared edge limiter is configured, and the pilot library credential model is accepted. Browser smoke checks and repository checks are now runnable; staging evidence is still required.

## Findings

| ID | Severity | Finding and evidence | Required disposition |
|---|---|---|---|
| SEC-01 | **High / blocker** | CORS now returns an origin only when it exactly matches the configured allowlist, with localhost limited to non-production. Production config still contains `https://REPLACE_WITH_GITHUB_OWNER.github.io`; library operations accept a bearer-like `X-Library-Key`. | Replace the production origin placeholder before deploy; fail the release if it is missing, wildcard, or unresolved. Keep credentials disabled unless a reviewed auth design changes it. |
| SEC-02 | **High** | Rate limiting is now bounded and route-specific in `apps/api/src/rate-limit.js`, but it is still per Worker isolate and therefore cannot be the global production quota. | Put a shared edge/API limiter in front of the Worker for production and keep the in-process guard as defense in depth. Preserve trusted client identity and source fan-out budgets. |
| SEC-03 | **High** | `apps/api/src/sources/common.js` validates provider-returned source, reader, and cover URLs against exact HTTPS hosts/path prefixes; `fetchJson` rejects redirects and bounds response bodies. | Keep the allowlist centralized, add staging fixtures for malformed URLs, and review every new adapter before registration. |
| SEC-04 | **High** | The library key is accepted if it matches a length/character regex (`libraryKey`) but there is no issuance, rotation, expiry, ownership, or server-side authentication beyond possession. It is a namespace/bearer credential, not a verified identity. | Treat it as a secret: generate cryptographically random keys server-side, never derive from user input, support rotation/revocation, apply per-key and per-IP limits, avoid putting it in URLs/logs, and document loss/recovery. Do not claim account-level privacy until an auth model exists. |
| SEC-05 | **Medium** | No hard-coded API secret was observed; `wrangler.jsonc` contains deployment placeholders, not credentials. Source metadata is now projected to a bounded allowlist before persistence, and request logs contain request IDs plus safe error codes. | Keep credentials only in platform secrets/bindings; scan repository, bundles, sourcemaps, logs, and CI artifacts. Add retention and access controls for D1. |
| SEC-06 | **Medium** | `sourceUrl` for Library of Congress is derived from upstream `record.id`, and `cover` may be an upstream `image_url`. These values are returned to the browser without a host/scheme policy. | Enforce approved host/path validation for every external URL and test malformed values such as `javascript:`, `data:`, `file:`, `http://127.0.0.1`, userinfo, encoded host tricks, and open redirects. Render links with safe external-link behavior and never inject as HTML. |
| SEC-07 | **Medium** | Invalid `source` now returns `400` before any upstream call; page values are intentionally clamped to a bounded range. | Keep the enum validation and document the page clamp in the public contract. |
| SEC-08 | **Medium** | Graceful degradation returns `stale: true` plus per-source `ok`/`unavailable` status; the reconstructed frontend has explicit loading, empty, and degraded states. | Add deployed staging outage evidence and keep provider internals out of user-facing copy. |

## Control requirements by topic

### CORS

- Production permits only the exact deployed web origin(s); development localhost exceptions are environment-scoped and cannot leak into production.
- Reject `null`, lookalike domains, arbitrary ports, and wildcard origins for any operation involving `X-Library-Key`.
- Preflight allows only documented methods and headers, returns no credentials, and is covered by automated positive/negative tests.
- Keep `Vary: Origin` when the response varies by origin; do not use CORS as an authentication mechanism.

### Upstream URL validation and SSRF

- User input selects an enum, never a raw upstream URL. Provider base URLs live in code/config as approved exact origins.
- Validate redirects, URL scheme, hostname, port, path, and resolved address before any server-side fetch. Block loopback, link-local, private, multicast, metadata-service, and non-routable targets.
- Treat provider-returned links as untrusted output. Allow only approved `https` hosts and paths for source, reader, and cover links, or omit the field.
- Do not persist or return arbitrary provider payloads; cap response size, metadata size, and record count.
- Do not add adapters for shadow libraries, piracy indexes, or unauthorized download endpoints.

### Rate limiting

- Enforce at the edge/shared store with TTL eviction and bounded cardinality; process memory can be a local optimization only.
- Separate cheap health/preflight from expensive catalog fan-out and library mutations. Cap concurrent upstream fetches and total upstream requests per caller/time window.
- Return `429` with `Retry-After`; avoid disclosing internal quotas or provider credentials. Monitor limit hits, upstream latency, and failure ratios.

### Secrets and data handling

- No secrets in source, `vars`, frontend bundles, localStorage, query strings, URLs, screenshots, logs, or D1 metadata.
- Platform secrets/bindings are least-privilege, rotated, and absent from client-visible responses. Treat the library key as a bearer secret until replaced by an authenticated identity model.
- Redact `Authorization`, `Cookie`, `X-Library-Key`, and provider query values from logs. Apply retention and access controls to D1.
- Add repository and CI secret scanning plus a production bundle/sourcemap scan before release.

### Graceful degradation

- Partial provider failure returns successful approved-source results plus a clearly machine-readable degraded/stale signal.
- All-provider failure returns cached or explicit unavailable state within the API budget; it never leaks stack traces or implies a healthy zero-result search.
- D1 unavailability does not prevent catalog discovery if designed as optional, but library reads/writes must disclose unavailable configuration and never claim persistence.
- Offline/demo content is clearly labelled and cannot be confused with live availability or reading rights.

## Release blockers and owner decisions

1. Replace the production CORS and D1 placeholders, then deploy only with the final Pages origin and database ID.
2. Put a shared edge/API limiter in front of the Worker for multi-isolate production coverage; retain the in-process guard as a fallback.
3. Ratify the library credential/authentication, rotation, and privacy model.
4. Ratify the URL allowlist and link policy for each approved provider.
5. Run the accessibility/performance evidence plan against the deployed Pages origin and staging API.
6. Ratify the invalid-parameter and degraded-response API contract before treating the contract tests as final release gates.
