# ADR 0011: Local publication watching and Draft preview

Status: accepted

Development keeps one root `.env` and the existing R2 configuration. It does not
require a separate bucket or credentials, nor classify configured buckets/hooks.
Production publication, credentials and build behavior remain unchanged.

- A two-second serialized watcher observes `latest.json`. Only a changed
  generation downloads and validates the full snapshot through the existing
  loader. Failed polls retain the last good input and retry on the next tick.
  An empty bucket starts an explicitly empty Development publication while
  waiting for the first snapshot. An explicit fixture disables R2 watching.
- The existing supervisor owns all processes. A controlled Public restart stops
  only Astro, installs the validated input, then starts Astro again to invalidate
  `getStaticPaths`. CMS/Admin stay running. Shutdown cancels polling and joins
  owned process cleanup. The watcher never publishes, uploads or triggers a hook.
- The Development-only Admin action flushes the normal autosave queue, reads the
  authorized saved Draft, and sends a bounded presentation projection by POST to
  an Astro dev-only route. No preview file, database, token, browser storage or
  extra service is needed. The route renders the real ContentDetail/Layout and
  safe Markdown components, marks the response private/no-store/noindex, and
  accepts only the loopback Admin origin or same-Public-origin resubmission for
  development hot reload. It never reads the CMS or R2.
- The dev integration injects the preview route only for `astro dev`. Admin uses
  a compile-time Development guard and lazy import. Production output must have
  neither the action/bridge nor preview routes/data. Snapshot v1 remains a
  published-only contract; the transient preview projection is not a publication.

Tests cover unchanged/changed generations, retries, fixture exclusion, process
restart isolation, preview safety/rendering and Production output exclusion.
Browser verification uses disposable SQLite and local R2/Hook substitutes; no
real credentials or external deployment are used by implementation checks.
