# Magazine Rack V1 release plan

## V1 promise

Magazine Rack V1 is a dependable discovery and reading room for public magazines, comics, newspapers, zines, and periodicals. A shelf should load from a cached snapshot first, explain its source state, and never disappear because one provider is slow or unavailable. A reader should clearly distinguish `Read in app`, `Borrow to read`, `Preview`, and `Image only`.

## Release gates

V1 does not ship until these are true:

- The frontend has one canonical build path. The deployed artifact must be generated from `apps/web/src/` or the migration is explicitly retired; no silent divergence between `index.html` and source modules.
- Every primary shelf has a named snapshot, request state, source-health timestamp, readable-content rate, and last-successful refresh.
- A provider 429/500 cannot replace populated content with an empty state.
- Every primary shelf has a reader-open test, a cover fallback, and a no-content explanation.
- Secondary/image-only shelves are visibly labeled and never presented as equivalent to readable shelves.
- Desktop and 390px-wide mobile QA pass for home, shelf detail, reader, favorites, history, and Open Library handoff.
- GitHub Actions runs checks, Pages deployment, Worker deployment, and a post-deploy smoke test from the same commit.

## Product shape

### 1. Home: the front page of the rack

Replace the current long wall with a magazine-stand landing page:

- a compact masthead with search, format filters, source pulse, and Library;
- a featured row for “Fresh on the rack,” “Continue reading,” and “Because you read…”;
- curated sections: Magazines, Comics, Manga, Characters & Series, Papers, Zines, and Specialty racks;
- horizontal shelf cards with one-line health/readability metadata;
- a clear “See all shelves” view instead of forcing every shelf into the home scroll;
- stable deep links for every shelf and series.

### 2. Shelf detail: browse like a real periodical archive

Each shelf gets a dedicated view with:

- search within shelf;
- sort by newest, oldest, cover quality, series, and source;
- filters for readable now, borrow, preview, image-only, year, language, and provider;
- grouped issue stacks by normalized series, year, and volume;
- pagination/infinite loading with a visible snapshot timestamp;
- duplicate grouping with “also available from” source chips;
- a manual refresh action that never clears the current snapshot.

### 3. Reader: make the handoff obvious

Keep the current reader contract, but make its states deliberate:

- `Read in app`: open the internal reader immediately;
- `Borrow to read`: show borrowing/access requirements before opening the provider flow;
- `Preview`: label omitted pages and explain the limitation;
- `Image only`: use a focused image viewer and say that no document reader exists;
- always expose previous/next issue, page count, fullscreen, reload, open source, related issues, and escape/back;
- retain the last successful reader state when a refresh fails;
- persist reading position locally per item.

### 4. Personal library

V1 should add local-first user features that require no account:

- favorites;
- recently opened and continue reading;
- saved searches;
- shelf pins and home-section preferences;
- export/import of the local library as JSON.

Open Library access remains an official handoff/login flow. The Worker and GitHub Pages site must never receive or store Open Library passwords or session cookies.

## Source policy for V1

### Primary

Internet Archive, Comic Book Plus, the multi-source Manga feed, and Open Library/OL Comics where the record provides a usable borrow/preview contract.

### Secondary

Europeana, EU Comics, XKCD, and any image-only adapter remain available only with a visible `SECONDARY SOURCE` and `Image only` label. They must not affect primary shelf health.

### Deferred

DPLA, LOC/ChronAm, GCD, Google Books, and any catalog-only adapter stay out of the primary shelf count until they expose a stable document or sequential-reader contract.

## Implementation order

1. Freeze current production behavior with a release snapshot and browser smoke suite.
2. Make the modular frontend the only build source; generate the Pages artifact and delete/retire duplicated embedded catalog logic.
3. Introduce typed contracts for `ShelfSnapshot`, `ShelfHealth`, `Issue`, `ReaderCapability`, and `UserLibraryEntry`.
4. Build the new home shell behind a feature flag while the current rack remains the fallback.
5. Build shelf detail and series grouping on the same normalized issue model.
6. Upgrade the reader state machine and mobile layout.
7. Add local library features and export/import.
8. Add persistent audit metrics and post-deploy smoke tests.
9. Run the full 52-shelf desktop/mobile audit and promote the V1 tag.

## What I would not add before V1

- password handling or background credential workers;
- new providers that only produce metadata or cover images;
- a second frontend architecture;
- automatic refresh of every shelf on every visit;
- personalization that requires a server account before local library features work.

## V1 success metrics

- 52 shelves remain non-empty after a cold deploy and after provider failures;
- primary shelves report readable content and last-success timestamps;
- median first meaningful shelf content is under 2 seconds from cached data;
- no primary shelf shows `Waiting…` indefinitely;
- reader open success is measured separately from catalog population;
- mobile reader controls remain usable at 390x844;
- every deployment publishes an audit artifact and fails CI when a primary shelf silently regresses.
