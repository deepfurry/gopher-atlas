# Architecture map

The public and control planes have separate availability and trust boundaries:

```text
Private CMS → SQLite generation/job → private R2 snapshot/latest → Hook → Astro → marker
```

P0-4 provides immutable assets, snapshot v1 and durable publication. P0-5 adds
static reader routes/search/SEO over that input, preserving the generation marker.
Development uses dev and local fixtures; Production uses main and private R2.
The manually installed CMS uses systemd and Tailscale Serve; see operations docs.
Legacy migration and DNS cutover remain P0-6.

Dependency direction:

- `apps/web` → shared Markdown; never Admin/API client/private services.
- `apps/admin` → generated API client, shared Markdown and server-derived actions.
  Shell/router/providers route to content/reviews/tags/people/audit/assets/publication features. Query
  owns server caches; RHF plus one autosave queue owns the in-memory Draft.
  Immutable review endpoints never return a Draft, including for Admin.
  Author/owner/byline/actor labels are batched on the server.
  ADR 0010 defines the Chinese-only workspace: `components/admin` owns navigation,
  search and creation; `components/ui` wraps Base UI with Phosphor icons; feature
  pages share presentation mappings and layered styles. Theme/sidebar preferences
  alone persist in browser storage. Search/counts remain bounded existing reads.
- `cmd` constructs config, one logger, SQLite pool, OAuth/auth, R2 adapter and a joined publication worker.
- `internal/app` assembles HTTP middleware; `internal/http` translates transport;
  `internal/auth` owns identity/session transactions and calls sqlc directly.
- `internal/content` owns Draft/Revision/Review/Tag/Route transactions and bounded
  DTO reads. `internal/audit` appends typed safe events using the caller's sqlc
  transaction, including successful identity mutations.
- `internal/policy` maps roles/status and object ownership/byline. Services recheck
  actors inside write transactions; React never implements role authorization.
- `internal/markdown` validates biography/body/review safety with Goldmark/GFM and the existing
  shared Markdown fixtures. Browser validation cannot replace the Go boundary.
- Shared TS packages never import apps. Generated code contains no manual logic.

SQLite uses a four-connection pool with DSN initialization on every connection.
Write services use immediate transactions to serialize bootstrap and last-Admin
checks before reading state. External OAuth I/O completes before any DB identity
transaction. Schema migration is an explicit operation, never startup/readiness.
Editorial multi-query reads use short transactions to return consistent fields,
relations and pointers. This also serializes those reads briefly with writers.

Draft optimistic versions and immutable Revision snapshots isolate ongoing edits
from the selected publication. Submit snapshots scalar fields and relations;
reviewed publication uses that exact pending Revision. Routes retain identity
ownership permanently and resolve redirects directly to the current canonical.
Audit is append-only, transactional and excludes body/payload/comment/credentials.
P0-4 additionally couples generation/job to public-state transactions; ADR 0008
extends the P0-2 publication boundary without changing editorial semantics.
Migration 00003 preserves 00001/00002. ADR 0007 records the
queue, conflict/navigation recovery, action projections and safe preview boundary.

`internal/app` is the single middleware assembly point:

```text
server-generated request ID → shared contrib Zap → response privacy headers
→ Monitor's shared-session Admin guard → one app-wide Monitor + Next
→ Recover → ordinary API sessions → active/CSRF gates → API / SPA
```

Monitor consumes downstream errors through the configured ErrorHandler. Access
logs classify the resulting response status, include `path` rather than `url`,
and omit raw errors. The integration test asserts aggregate counters, recovered
panics, authorization, skipped Monitor logs and secret absence.

`make build-cms` builds Vite, replaces the owned ignored embed directory, and
compiles `-tags=adminembed`. That tag requires real generated assets. Plain Go
builds/tests use an explicit development variant whose SPA returns 503; they do
not falsely claim to contain the production UI. The final `make check` build
always uses freshly built assets and runs embed-specific route/cache tests.

OpenAPI and migration/SQL inputs are authoritative for executable interfaces.
Snapshot v1 is a closed public projection. Export uses one deferred SQLite read
transaction, then closes it and rechecks freshness before network I/O. A shared
in-process fence closes the stale latest PUT race: services acquire it before
BEGIN; worker acquires it around latest/Hook without a DB transaction.
Asset upload validates/uploads before a short reauthorized row/Audit transaction.
The Web loader keeps RO credentials in Node; Astro env loading is disabled.

Development-only scripts load root .env with process precedence. dev-web resolves
explicit fixture paths from root, or fills missing CONTENT_R2_* from CMS R2_* only
under Development. The shared Production preparation defaults and build entry do
not enable fallback or dotenv. Private config is removed before launching Astro.
The make dev supervisor builds an unembedded CMS, prepares Public input, then owns
the three direct service processes and cleans their descendants on exit/signal.
ADR 0011 adds a serialized generation watcher and named Public-only restarts;
old inputs survive failed refreshes. No separate content bucket is required.
An empty bucket starts an explicitly empty Development publication and waits.
The dev-only preview route receives an ephemeral POST projection from Admin after
autosave and uses the actual Public renderer. It has no CMS/storage dependency,
no persisted preview data, and is absent from Production builds.

P0-5 Public uses `src/lib/publication` for schema-validated maps, strict references,
stable sorting, pages and direct redirects. A static catch-all dispatches exact
canonical/derived paths to Public templates; collections use 24-item static pages.
Source-owned home/about/contribute/directories/search remain ordinary Astro pages.
The same shared Markdown/Shiki pipeline renders body and biography, without fetch.
Only search has browser code; it lazily loads Pagefind and uses safe text results.
RSS, sitemap, redirects and marker are build output. No Public request touches
CMS/SQLite/private R2. See ADR 0009 and scripts/check-public-build.mjs.
