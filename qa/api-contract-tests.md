# API contract test cases

These cases define the release contract for the current routes. The response names below are based on `apps/api/src/index.js`; product/engineering must ratify any route or field change before implementation. Tests must assert status, JSON shape, headers, side effects, and that no secret or upstream stack trace is returned.

## Common assertions

- JSON responses use `Content-Type: application/json; charset=utf-8`.
- Error bodies use a stable snake-case `error` code and contain no stack, secret, upstream URL, request header, or raw provider payload.
- IDs, query strings, page values, genre values, notes, and source identifiers obey documented limits; oversized input is rejected or safely bounded according to the approved contract.
- A response never includes an unapproved source or a link that violates the external-URL policy in `security-review.md`.
- For browser requests, CORS headers are present only for an exact approved origin. `Vary: Origin` is present when origin-dependent headers are used.

## Health and catalog

| ID | Request / fixture | Expected result |
|---|---|---|
| API-001 | `GET /health` with no DB | `200`; `{ ok: true, service, environment, time }`; no credentials, stack, or provider data. |
| API-002 | `GET /api/catalog?q=radio&page=1` with all approved providers healthy | `200`; bounded `items`; numeric `total`/`page`; `sources` contains only approved identifiers; each item matches the public item schema. |
| API-003 | Empty query, Unicode query, punctuation, repeated query, and query of 121+ characters | Valid bounded inputs are deterministic; oversized input has a documented `400` (preferred) or documented truncation; no query injection or malformed upstream URL. |
| API-004 | `source=archive`, `source=loc`, `source=openlibrary` | Only the selected approved provider is called; response identifies that source. |
| API-005 | `source=unknown`, mixed case, blank, duplicate parameters | Unknown source is `400` (or an explicitly approved behavior); it must not silently expand to all providers or create extra upstream load. |
| API-006 | `page=0`, `page=-1`, `page=101`, decimal, non-numeric, and very large value | Contract-defined `400` or safe documented clamp; no negative/huge upstream page; returned `page` matches the contract. |
| API-007 | Provider returns 500, timeout, invalid JSON, oversized JSON, and valid empty result | Healthy providers still contribute; response is explicitly `stale`/`degraded`; malformed records are dropped safely; no stack trace. |
| API-008 | All providers timeout or fail | Fast, honest empty/stale/degraded response or cached result; UI can distinguish outage from a valid zero-result search; no unbounded wait. |
| API-009 | Provider payload contains untrusted title, description, URL, image URL, control characters, or huge metadata | Public fields are bounded/normalized; URLs pass allowlist validation; no active HTML/script is rendered; no raw provider object is returned. |
| API-010 | `GET /api/catalog/{valid-id}` with D1 configured and item present | `200`; `{ item: publicItem }`; only documented public fields. |
| API-011 | Valid-but-unknown ID, malformed ID, encoded slash, invalid percent-encoding | `404` for unknown; `400` for invalid/undecodable IDs; never a `500`; no SQL error details. |
| API-012 | `GET /api/catalog/{id}` with D1 unavailable | `503` with stable `database_not_configured`/approved equivalent; no misleading empty success. |

## Library contract and isolation

| ID | Request / fixture | Expected result |
|---|---|---|
| API-013 | Any library route without `X-Library-Key`, with short/long/invalid characters | `401` with stable `library_key_required`; no DB query or mutation. |
| API-014 | `GET /api/library` with key A, then key B | Each key sees only its own entries; results are bounded and not shared through browser/proxy caching. |
| API-015 | `PUT /api/library/{id}` with valid `{ "note": "..." }` and with `{ "saved": false }` | `200`; save/update/delete semantics are idempotent; note is bounded and safely stored. |
| API-016 | Malformed JSON, array/null body, oversized note, unknown item ID | Stable `400`/`404` according to contract; no accidental save with an empty note; no raw D1 foreign-key error. |
| API-017 | `DELETE /api/library/{id}` repeated and unsupported `PATCH`/`POST` | Delete is idempotent; unsupported methods return `405` with an `Allow` header. |
| API-018 | Same item and key concurrently from two requests | Final state follows documented last-write/idempotency semantics; no cross-key or partial-write leakage. |

## CORS and preflight

| ID | Request / fixture | Expected result |
|---|---|---|
| API-019 | `OPTIONS /api/catalog` from the exact configured web origin with requested `Content-Type` | `204`; exact `Access-Control-Allow-Origin`, approved methods/headers, bounded max-age, and `Vary: Origin`. |
| API-020 | Same preflight from `https://evil.example`, `null`, a lookalike host, and an origin with a malicious port | No `Access-Control-Allow-Origin`; no credentialed access; response does not reflect the attacker origin. |
| API-021 | Production config with `ALLOWED_ORIGIN=*` or unresolved placeholder | Deployment validation fails; wildcard/reflection is not permitted for library operations; placeholder is a release blocker. |

## Rate limiting and abuse

| ID | Request / fixture | Expected result |
|---|---|---|
| API-022 | Requests 1 through limit and limit+1 from one client | Boundary is deterministic; over-limit returns `429`, stable `rate_limited`, numeric `Retry-After`, and no provider call for the rejected request. |
| API-023 | Requests across Worker isolates/locations and with multiple concurrent connections | Limit is enforced by a shared/edge-backed mechanism, not only per-isolate memory; one client cannot multiply its budget through fan-out. |
| API-024 | Rotate spoofable headers, IPv6 forms, missing IP, and many unique client keys | Client identity follows the trusted edge deployment contract; the limiter cannot be exhausted by unbounded key allocation or bypassed by a simple header change. |
| API-025 | Rate-limit `OPTIONS`, `/health`, catalog fan-out, and library mutation separately | Health/preflight behavior is documented; expensive catalog and mutation operations have appropriate stricter budgets; an attacker cannot starve the primary flow with cheap requests. |

## Contract-test exit criteria

All cases pass against a deployed staging Worker with deterministic approved-provider fixtures, D1 configured, D1 unavailable, and the production CORS configuration. Current implementation deviations and required fixes are tracked in `security-review.md`.
