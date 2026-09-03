# Accessibility and performance acceptance criteria

These are release thresholds for the static PWA and its user-facing API. Test the real production build, not an unbundled development page. Any threshold change requires product and engineering sign-off.

## Accessibility — WCAG 2.2 AA baseline

### Keyboard and focus

- **A11Y-01:** Every primary task (search, filter, open item, save/remove item, open reader/source link, and recover from an error) is possible with keyboard only.
- **A11Y-02:** Tab order follows visual order; no keyboard trap exists in dialogs, drawers, carousels, or the reader view.
- **A11Y-03:** Focus is always visible, has at least 3:1 contrast against adjacent colors, and is restored to a sensible control after modal/dynamic content closes.
- **A11Y-04:** A skip link or equivalent bypasses repeated navigation. Landmarks identify header/navigation/main/status regions.

### Semantics, content, and forms

- **A11Y-05:** The page has one meaningful `h1`, logical heading order, descriptive link names, semantic buttons for actions, and lists/grids with usable item names.
- **A11Y-06:** Search and filters have programmatic labels, instructions, validation, and a named results region. Result-count, loading, empty, stale, and error changes are announced without stealing focus.
- **A11Y-07:** Images have useful alternative text when informative and empty alt text when decorative. A failed cover image does not remove the title or source attribution.
- **A11Y-08:** Text and controls meet 4.5:1 normal-text and 3:1 large-text/non-text contrast requirements. Information is not conveyed by color alone.
- **A11Y-09:** Text reflows at 320 CSS px without two-dimensional scrolling for normal content; at 400% zoom, primary actions and result metadata remain usable.
- **A11Y-10:** Touch targets are at least 24×24 CSS px with sufficient spacing; destructive/save state changes have clear text or accessible names.
- **A11Y-11:** `prefers-reduced-motion` is respected. Autoplay, moving content, and transient announcements can be paused or disabled.
- **A11Y-12:** Screen-reader smoke tests pass in Chromium + NVDA (Windows) or VoiceOver (macOS/iOS) for search, result selection, save/remove, and outage recovery. Automated scans are supplemental, not the sole evidence.

### PWA and resilience

- **A11Y-13:** The no-JavaScript message is understandable and does not falsely imply that live catalog search is available.
- **A11Y-14:** Offline shell loading is announced or visually clear; cached/demo content is labelled, and stale API data is not presented as current.
- **A11Y-15:** Browser console has no uncaught error, failed module load, or inaccessible focus transition during the primary flows.

## Performance

### User-visible web thresholds

Measure on a production build with a mid-tier mobile profile, 4G throttling, cold cache, and a warm-cache repeat. Pass at the 75th percentile across at least 5 runs per scenario:

- **PERF-01:** LCP ≤ 2.5 s, INP ≤ 200 ms, and CLS ≤ 0.10.
- **PERF-02:** FCP ≤ 1.8 s and the first usable search control is interactive ≤ 3.0 s.
- **PERF-03:** Initial compressed JavaScript is ≤ 250 KB and initial compressed CSS is ≤ 100 KB unless an approved exception includes measured benefit.
- **PERF-04:** No render-blocking third-party resource is required for the core reading-room shell. External fonts/covers may fail without blanking the app.
- **PERF-05:** Images are sized for their rendered slot, lazy-loaded below the fold, and have width/height or aspect-ratio reserved to prevent layout shifts.

### API and resilience thresholds

- **PERF-06:** `/health` p95 ≤ 300 ms with a warm Worker.
- **PERF-07:** Catalog p95 ≤ 2.0 s with healthy cached/approved upstream fixtures and ≤ 3.0 s for a degraded fixture. A slow upstream must not hold the user request for the full per-source timeout.
- **PERF-08:** API responses are bounded: page size, query length, note length, stored metadata, and response body size are documented and enforced.
- **PERF-09:** Public catalog responses may use the documented short cache window; library and health responses must not be cached as shared public data.
- **PERF-10:** Under a rate-limit load test, upstream request volume falls when callers are limited; a single client cannot consume the full upstream budget through parallel fan-out.

## Required evidence

Attach Lighthouse/DevTools results, the browser/device matrix, API timing percentiles, cache state, upstream fixture configuration, and a list of known exceptions. A pass without reproducible evidence is not a release pass.
