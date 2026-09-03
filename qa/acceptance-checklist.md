# Magazine Rack QA acceptance checklist

Status: release-gating checklist for the current reconstruction snapshot.

Scope: public/host-authorized catalog discovery, reading links, optional per-user library, the static PWA, and the Cloudflare Worker/D1 API. Shadow-library indexes, piracy sources, and unauthorized download flows are out of scope and must remain absent.

## Evidence and test setup

- [ ] Run `npm run check` from the repository root in CI and attach the output to the release record.
- [ ] Test the deployed static site and API over HTTPS from a clean browser profile.
- [ ] Test with one healthy upstream, one slow upstream, one malformed upstream, and all upstreams unavailable.
- [ ] Run API tests with D1 configured and with D1 intentionally absent/unavailable.
- [ ] Use a fresh browser profile for accessibility and offline tests; repeat browser tests at 200%, 400%, keyboard-only, and narrow mobile widths.
- [ ] Capture request/response headers, status codes, timing, console errors, and screenshots for every failed gate.
- [ ] Confirm the test fixture source list contains only Internet Archive, Library of Congress, and Open Library (or another explicitly approved host-authorized source).

## Functional and data acceptance

- [ ] `/health` returns a small JSON health response without secrets, stack traces, request headers, or upstream payloads.
- [ ] Catalog search handles an empty query, normal text, Unicode, punctuation, long input, empty result, and page boundaries deterministically.
- [ ] `source` accepts only the approved source identifiers; an unknown source is rejected rather than silently broadening the search.
- [ ] Search results have stable IDs and include title, creator, year, genre, source attribution, description, cover URL, source URL, reader URL, and page count with documented null/empty semantics.
- [ ] An item lookup returns the item, `404` for a valid-but-unknown ID, and `400` for malformed IDs. Malformed percent-encoding must not become a `500`.
- [ ] Results from a failed source do not erase successful sources. The response visibly identifies degraded/stale results.
- [ ] An all-upstream outage produces an honest empty/stale/degraded state or cached result; it must not look like a healthy zero-result search.
- [ ] Library reads, saves, updates, and deletes are scoped to the presented library credential; repeating the same operation is safe and idempotent.
- [ ] Invalid JSON, oversized notes, unknown item IDs, missing library credentials, unsupported methods, and unavailable D1 return documented client-safe errors.
- [ ] Source attribution and links are preserved in the UI. No test fixture or production adapter references shadow libraries, pirate indexes, or unauthorized download flows.
- [ ] Offline/demo fallback is clearly labelled as demo/local data and never presented as a live catalog result.

## Release gates

- [ ] Accessibility criteria in `accessibility-performance-criteria.md` pass.
- [ ] API contract cases in `api-contract-tests.md` pass, or each exception has an approved issue, owner, and expiry date.
- [ ] Security review findings in `security-review.md` have no open release blockers.
- [ ] No application or infrastructure change is included in a QA-only change set.
- [ ] A rollback path exists for the Worker, static site, and any D1 migration.

## Defect severity

- **Blocker:** exploitable SSRF or secret exposure; unsafe CORS for library operations; cross-user library access; unauthorized/piracy source; release cannot be tested; or a critical accessibility failure that prevents a primary task.
- **High:** bypassable rate limit on upstream fan-out; invalid/untrusted external URL accepted; data loss or misleading healthy state during outage; API contract break for a primary flow.
- **Medium:** degraded keyboard/screen-reader flow, performance budget miss, incomplete error semantics, or non-critical observability gap.
- **Low:** cosmetic or documentation issue that does not impair the primary flow or safety controls.
