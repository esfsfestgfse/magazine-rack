# Magazine Rack Architecture

Status: proposed target architecture
Owner: Architecture Lead
Date: 2026-09-03

## 1. Decision summary

Magazine Rack will be a static PWA delivered by GitHub Pages and a separately deployed Cloudflare Worker API backed by Cloudflare D1.

The browser is responsible for presentation, local caching, and resilient navigation. The Worker is the only public application boundary: it validates requests, applies policy, reads canonical catalog data, records user-library changes, and exposes source-neutral JSON. D1 is the system of record for normalized catalog and library metadata. Source adapters run on scheduled Worker invocations and write through the same normalization path.

This preserves a small deployment surface while keeping ingestion, provenance, and persistence out of the frontend. Cloudflare Workers supports API handlers, bindings, scheduled jobs, queues, caching, and observability; D1 supplies the relational SQL store used by this design.

Reference documentation: [Workers](https://developers.cloudflare.com/workers/), [D1](https://developers.cloudflare.com/d1/), [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/), and [Queues](https://developers.cloudflare.com/queues/).

## 2. System shape

```text
User browser
    |
    | static assets
    v
GitHub Pages ------------------------------+
    |                                       |
    | HTTPS JSON                            | outbound source fetches
    v                                       v
Cloudflare Worker API <--- scheduled ingest Worker jobs ---> public/authorized sources
    |
    +--> D1: canonical catalog, provenance, libraries, run state
    +--> Cache: short-lived public query responses
    +--> optional Queue: source work when ingestion exceeds one request
```

### Frontend: GitHub Pages PWA

- Build output is static HTML, CSS, JavaScript, icons, manifest, and service worker.
- The frontend is configured with an environment-specific API base URL; it never contains D1 credentials, source secrets, or admin capabilities.
- The service worker caches the application shell and safe, versioned static assets. It may cache recent public responses with explicit freshness metadata, but D1 remains authoritative.
- The MVP stores saved IDs, reading progress, and view preferences in bounded `localStorage`, while the service worker caches the shell. When an API base is configured, the browser also mirrors catalog saves to D1 using a randomly generated client-held library key. This is pilot persistence, not account authentication or guaranteed cross-device recovery.
- Deep links must work on GitHub Pages through the selected routing strategy (hash routes or a committed fallback page). The decision should be made before adding client-side routes.

### Backend: Cloudflare Worker API

The Worker is a modular application with four logical modules, even if initially deployed as one Worker:

1. **Public catalog** — search, filters, detail, source attribution, freshness, and outbound reader links.
2. **Library** — anonymous or authenticated saved items, notes, and deletion; the initial scaffold uses a client-held library key and this must be threat-modeled before production.
3. **Ingestion** — source adapters, normalization, deduplication, provenance, and run status.
4. **Operations** — health, metrics, admin-only reindex controls, and structured error handling.

Use D1 through its Worker binding and parameterized statements. Keep request-scoped state inside the request handler. Use `ctx.waitUntil` only for non-critical follow-up work, such as telemetry or a bounded cache write; ingestion that must be retried or observed should move to a scheduled job, Queue, or Workflow rather than being hidden behind a user response.

### Persistence and supporting services

**D1 (required):** canonical relational data, source mappings, library records, and ingestion run state.

**Workers Cache (optional, safe to evict):** short-lived caching for identical public search/detail responses. Cache keys include API version and all query filters. No user-private response may enter a shared cache.

**R2 (phase 2, optional):** immutable raw source snapshots, large cover assets where rights permit, or replay fixtures. The first release may store only bounded source metadata in D1, but the schema must retain a raw-payload reference rather than embedding unbounded payloads in response objects.

**Queues (phase 2):** decouple source fetch and normalization when a source has many partitions, rate limits, or retryable failures. Do not introduce a queue merely to disguise a small synchronous job.

**Durable Objects (not required for MVP):** reserve for a concrete coordination requirement such as a single-flight reindex lock or collaborative live state. D1 plus scheduled work is sufficient for the initial catalog.

## 3. Request and data flows

### Public search

1. The PWA sends `GET /api/search` with a bounded query, filters, sort, and cursor.
2. The Worker validates and normalizes parameters, applies rate limits, and checks the public response cache.
3. The Worker queries D1 indexes only; it does not fan out to three upstreams on the user's critical path.
4. The response returns canonical items, pagination, source attribution, freshness, and partial-data indicators.
5. The UI may render stale cached results while showing the last-known refresh time.

### Scheduled ingestion

1. A Cron Trigger starts a bounded source run, or enqueues source partitions when the run is larger.
2. The adapter fetches only public or host-authorized endpoints, with timeouts, backoff, and source-specific rate limits.
3. The normalizer maps the source record to the canonical model and computes a stable source-scoped identifier.
4. Duplicates are merged only when deterministic identity rules match; uncertain matches remain separate and are flagged for review.
5. D1 upserts the canonical record, source mapping, freshness timestamps, and run outcome.
6. Failed records remain observable and retryable. A source failure does not erase the last known good record.

### Saved library

1. The MVP saves the item ID locally so the primary flow works without an account.
2. When configured, the browser sends an anonymous library key to the API; the Worker checks that the item exists and writes an idempotent D1 mutation.
3. A library read hydrates the local shelf with full catalog records from D1, while failed writes remain usable locally and surface an explicit status message.
4. Account-backed identity, key rotation, and durable offline mutation reconciliation remain follow-on auth milestones rather than implied MVP capabilities.

## 4. Canonical data model

The current migration has `catalog_items`, `library_entries`, and `source_runs`. Those are a useful starting point, but the target model separates canonical identity from source observations.

### Entities

| Entity | Purpose | Important fields |
|---|---|---|
| `publications` | A canonical periodical or serial title | `id`, `title`, `normalized_title`, `publisher`, `language`, `cadence`, `subjects`, `status` |
| `issues` | A dated or numbered issue/edition | `id`, `publication_id`, `volume`, `issue_number`, `published_at`, `cover_url`, `availability` |
| `items` | Searchable item, issue entry, or reading target | `id`, `publication_id`, `issue_id`, `title`, `creator`, `summary`, `year`, `kind`, `reader_url` |
| `source_records` | One source's observation of a canonical entity | `id`, `source`, `source_id`, `entity_type`, `entity_id`, `source_url`, `raw_ref`, `observed_at`, `rights_status`, `checksum` |
| `topics` | Controlled discovery vocabulary | `id`, `slug`, `label` |
| `item_topics` | Many-to-many topic assignment | `item_id`, `topic_id`, `confidence`, `origin` |
| `libraries` | A user's saved collection boundary | `id`, `credential_hash` or account subject, `created_at`, `updated_at` |
| `library_entries` | Saved item and optional note | `library_id`, `item_id`, `note`, `saved_at`, `updated_at` |
| `source_runs` | Ingestion observability and replay state | `id`, `source`, `started_at`, `finished_at`, `status`, `item_count`, `error`, `cursor` |

Every public record carries provenance and freshness in the API representation. Raw source fields are retained only for audit/replay needs and are never allowed to define the public contract.

### Identity and deduplication

- Source identity is always unique within a source: `(source, source_id)`.
- Canonical IDs are opaque and stable; URLs must not be used as the sole identity unless the source guarantees their stability.
- Exact identifier matches merge automatically.
- Normalized title, publisher, date, and issue number may produce a candidate match, never an invisible merge. Ambiguous candidates require review or remain distinct.
- A source withdrawal marks a record unavailable or stale according to policy; it does not silently delete historical user saves.

## 5. API boundary

The API is versioned by path or explicit media type before public clients are released. Initial public resources:

```text
GET    /health
GET    /api/search?q=&topic=&source=&year=&page_size=&cursor=
GET    /api/publications/{publication_id}
GET    /api/issues/{issue_id}
GET    /api/items/{item_id}
GET    /api/library
PUT    /api/library/{item_id}
DELETE /api/library/{item_id}
POST   /api/events
```

Response rules:

- JSON uses stable field names and explicit empty/null semantics.
- List endpoints use bounded page sizes and cursor pagination once the catalog is beyond a small pilot.
- Errors use stable machine-readable codes, a human message safe for display, and a request correlation ID.
- Public results expose `source`, `sourceUrl`, `readerUrl`, `rights`, `observedAt`, and `stale`; they do not expose raw upstream payloads or internal D1 columns.
- CORS allows only the configured GitHub Pages origin plus local development origins outside production.
- Mutating endpoints require authentication or a deliberately scoped library credential, CSRF-aware request handling where cookies are used, rate limiting, and idempotency.
- Admin and ingestion endpoints are separate from the public surface and require a secret or identity provider; they are not protected by obscurity.

The frontend depends only on this contract. Source adapter changes, D1 migrations, ranking changes, and cache implementation remain backend concerns.

## 6. Search and ranking

Start with indexed D1 fields and deterministic ranking: exact title match, prefix match, normalized title, publication/issue date, source quality, and freshness. Store ranking inputs so results can be explained and tested.

Do not add vector search or a separate search service until query logs show that lexical search fails on a meaningful class of user tasks. If needed, introduce it behind the same API and retain lexical fallback.

## 7. Security, rights, and reliability

- Permit only documented public or host-authorized catalog sources. No shadow-library indexing or unauthorized download flow.
- Treat source URLs, descriptions, and titles as untrusted content; escape rendered text and validate outbound links against allowed URL schemes.
- Store secrets in Worker secret bindings, not GitHub Pages assets or repository files.
- Apply per-IP and per-library rate limits; do not rely on a module-level in-memory map as the production rate-limit authority.
- Set timeouts and bounded response sizes for every source fetch. A slow or failing source produces partial results and an observable run failure.
- Use structured logs and metrics for request ID, route, latency, D1 outcome, source, record counts, and failure class. Never log library credentials or raw personal notes.
- Back up/export D1 before destructive migrations and keep migration files forward-only and reviewable.
- Health checks must distinguish Worker availability, D1 availability, and source freshness.

## 8. Deployment and environments

- GitHub Actions builds and publishes `apps/web` to GitHub Pages on a protected branch.
- Wrangler deploys the Worker and applies reviewed D1 migrations for development, staging, and production environments.
- Frontend configuration is injected at build time per environment; production must point to the production API origin.
- Worker compatibility date, bindings, routes, observability, and environment variables are explicit in `wrangler.jsonc`.
- Preview builds use a non-production API and database. Production D1 is never used for local experiments.
- Rollback means redeploying a known frontend artifact and Worker version; schema changes require backward-compatible API sequencing.

## 9. Migration from the current scaffold

The repository already separates `apps/web` and `apps/api`, has a D1 migration, and restricts adapters to Archive, Library of Congress, and Open Library. The current API fans out to those sources during `/api/catalog` requests and persists returned items with a post-response write.

Migration sequence:

1. Keep the current public response shape as a compatibility adapter while introducing canonical tables and source-record mappings.
2. Move source fetches into scheduled ingestion and make D1 the primary read path.
3. Add freshness, rights, provenance, and run-status fields to the public contract.
4. Add deterministic deduplication and replay fixtures from captured, permitted source responses.
5. Remove request-time upstream fan-out after D1 coverage and freshness meet the product thresholds.

Legacy behavior worth retaining: public catalog adapters, in-app reading only where the upstream source supports it, graceful fallback links, and the library concept. Legacy UI structure, global state, source-specific response shapes, and single-file coupling are not retained.

## 10. Open risks and exit criteria

The highest-risk assumption is not Worker latency; it is that the selected sources provide legally usable, stable, sufficiently complete metadata. Before broad ingestion, validate three to five representative sources for coverage, update cadence, duplicate rate, rights, and failure behavior.

MVP architecture is ready for production review when:

- D1 is the authoritative read path for the pilot catalog.
- Each visible record has source attribution, rights posture, and freshness metadata.
- A source outage cannot erase good data or make the public search fail closed.
- Library credentials and notes are not exposed in logs or shared caches.
- Schema and API changes have migration tests and a documented rollback path.
