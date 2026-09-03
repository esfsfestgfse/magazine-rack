# Magazine Rack Product Brief

Status: proposed MVP brief
Owner: Product + Architecture
Date: 2026-09-03

## Product thesis

Magazine Rack is a discovery-first reading room for magazines, comics, newspapers, zines, and other periodicals available from public or host-authorized collections.

People should be able to search across fragmented catalogs, understand what a result is, verify where it came from, and open the best available reading or catalog destination without needing to know which archive owns it.

## Problem

Public-periodical metadata is fragmented across archives, library catalogs, and open bibliographic services. Existing discovery experiences make users repeat the same search, interpret inconsistent fields, and guess whether a result is current, readable, or legitimately available.

The product should solve discovery and orientation. It should not become an unauthorized content mirror, an unbounded scraper, or a replacement for the source institution's reader.

## Target users

### Primary

- Curious readers looking for a periodical by title, subject, era, or creator.
- Researchers who need a quick cross-catalog view with source and date context.
- Librarians, educators, and archivists building reading lists or finding public collections.

### Secondary

- Collectors and hobbyists exploring comics, newspapers, zines, and specialist magazines.
- Maintainers who need visible source freshness and ingestion health.

## User promise

“Find interesting periodicals quickly, know what you are looking at, and follow a trustworthy path to read or learn more.”

## MVP scope

### Discovery

- Search by title, creator, topic, publication, and year.
- Filter by source, periodical type, language where available, and readable/catalog-only availability.
- Show result cards with title, cover when permitted, creator, year/date, type, source, freshness, and a short description.
- Show a detail view with provenance, source link, reader link when supported, related results, and a clear stale/partial-data indicator.
- Support a graceful empty, error, and source-partial state.

### Personal library

- Save and remove items.
- Add a short private note.
- Work offline for the local saved shelf and recently viewed shell.
- Make the privacy model explicit: local browser storage is always available; when configured, D1-backed anonymous library keys provide pilot persistence, while account-backed identity is required for durable cross-device recovery.

### Catalog operations

- Ingest a small, approved source set: Internet Archive, Library of Congress, and Open Library, subject to each source's current terms and access policy.
- Show source attribution and freshness for every visible record.
- Record run status, counts, failures, and last successful observation.
- Permit a maintainer to disable a source without taking down discovery for other sources.

## Out of scope for MVP

- Hosting or mirroring full publication scans.
- Unauthorized downloads, shadow-library indexes, or bypassing access controls.
- Universal coverage of every periodical or every historical issue.
- Social following, public comments, ratings, or collaborative annotation.
- Personalized recommendations based on sensitive profiles.
- Semantic/vector search before lexical search has measurable gaps.
- Native mobile apps or a second frontend deployment target.

## Core journeys

### Find and open

1. A user enters a title, topic, creator, or era.
2. Magazine Rack returns a cross-source result set with consistent fields.
3. The user filters to a manageable set and opens a detail page.
4. The detail page explains provenance and freshness, then offers the source catalog or supported reader link.

### Save for later

1. A user saves a result from search or detail.
2. The UI confirms whether the save reached the optional server mirror or remains local.
3. The library lists saved items with source, freshness, and notes.
4. If an item becomes unavailable, the library preserves the saved reference and explains the change.

### Recover from a source failure

1. One upstream source times out or returns malformed data.
2. Existing D1 results remain searchable.
3. The user sees partial/stale status rather than a blank page or fabricated completeness.
4. Operations can inspect and retry the failed run without a frontend release.

## Content and trust policy

- Only public or host-authorized metadata and links are eligible.
- Every result must identify its source and observation time.
- A reader link is presented only when the source supports it; otherwise provide the canonical catalog link.
- The UI must not imply that Magazine Rack owns, hosts, or guarantees access to third-party content.
- Source terms, takedown requirements, robots/access policies, and rights status are part of onboarding for every adapter.
- User-generated notes are private by default and are never included in public search results.

## Product architecture implications

The PWA is static and deploys to GitHub Pages. The public API runs on Cloudflare Workers and reads canonical records from D1. Source adapters run on scheduled backend jobs rather than on every search. This gives users stable, explainable results and gives operators a place to measure freshness, source failures, and rights posture.

The product contract is source-neutral. Adding a source should require an adapter and mapping tests, not a new frontend branch for that source.

## Success measures

The first release should measure usefulness and trust, not raw catalog size:

- Search-to-detail rate.
- Detail-to-source/reader click-through rate.
- Zero-result rate for the top query families.
- Duplicate-result rate after normalization.
- Percentage of visible records with source and freshness metadata.
- Median search response time and error/partial-result rate.
- Source freshness success rate and ingestion recovery time.
- Save success rate, including offline reconciliation failures.
- User-reported incorrect merge, broken link, or rights issue rate.

Initial targets should be set after the 48-hour source-validation exercise; do not invent catalog coverage targets before measuring the sources.

## Launch acceptance criteria

- A new user can search, filter, inspect a result, and reach an authorized source in one coherent flow.
- A result clearly distinguishes a readable item from a catalog-only item.
- Search continues to work with one source unavailable.
- Every result has provenance and freshness information.
- Saved items survive refresh and have an understandable offline/error state.
- The application is usable on narrow mobile screens and supports installable PWA behavior.
- No unauthorized content acquisition or download path is present.
- Operators can identify the failing source and last successful run without querying production tables manually.

## Delivery plan

### Phase 0 — validate the premise

Within 48 hours, sample three to five representative source queries and compare metadata coverage, rights, duplicate rate, freshness, latency, and failure behavior. Conduct a short task test with readers/researchers using the resulting vertical slice.

### Phase 1 — trustworthy catalog MVP

Establish canonical D1 tables, source-record provenance, scheduled ingestion, lexical search, detail pages, source links, and observability. Keep the catalog intentionally narrow while quality is measured.

### Phase 2 — resilient library

Harden identity/authentication, offline synchronization, idempotency, privacy controls, and cross-device behavior if validated by usage.

### Phase 3 — breadth and relevance

Add approved sources, better topic normalization, ranking experiments, and possibly a separate search index only when D1-backed lexical search is demonstrably insufficient.

## Major risks and responses

| Risk | Response |
|---|---|
| Metadata is incomplete, unstable, or not legally usable | Validate before scale; onboard sources with documented rights and freshness rules. |
| Users cannot tell whether a result is trustworthy | Show provenance, observation time, source type, and readable/catalog-only status. |
| Duplicate or over-merged results damage discovery | Use deterministic identity first; flag uncertain matches rather than silently merging. |
| Upstream outages make the catalog look empty | Read from D1; retain last known good data and surface stale/partial status. |
| Anonymous library keys are copied or lost | Treat them as a pilot mechanism, limit sensitivity, hash where appropriate, and move to account-backed identity when justified. |
| GitHub Pages routing/configuration creates broken deep links | Choose the routing strategy early and test direct navigation from the deployed origin. |
| Scope expands into a content-hosting or recommendation platform | Keep the MVP contract centered on discovery, provenance, and authorized outbound access. |

## Decisions requested from operating management

1. Confirm the initial source set and authorize a rights/terms review for each source.
2. Choose whether pilot library persistence may be anonymous-key based or must support account login at launch.
3. Confirm the GitHub Pages custom-domain/routing strategy before frontend route work.
4. Agree that catalog quality, provenance, and recovery from source failure are launch gates alongside visual polish.

## Non-negotiable product boundary

We will not ship a catalog that conceals provenance, presents stale data as current, merges uncertain records invisibly, or provides unauthorized access to third-party content. A smaller trustworthy reading room is the product; maximal scraping is not.
