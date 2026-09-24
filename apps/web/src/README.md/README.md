# Frontend source boundary

The shipped frontend is the standalone `apps/web/index.html` application. It
is the only UI entrypoint published by the Pages workflow.

The remaining files in this directory are shared source adapters, catalog
definitions, storage helpers, and API-contract fixtures used by repository
checks and the audit tooling. They are not a second browser application and
must not grow a competing renderer or stylesheet tree.

Any UI change belongs in `apps/web/index.html` until the standalone app is
deliberately decomposed behind an automated parity gate.
