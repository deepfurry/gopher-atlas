# Architecture map

The public and control planes have separate availability and trust boundaries:

```text
Private CMS → future published R2 snapshot → Astro build → static public site
```

P0-2 adds the editorial domain/API to the P0-1 identity runtime. Public still builds
its version 0 empty fixture. Full Admin editorial UX, R2/jobs, public content
rendering, legacy importer and deployment remain deferred.

Dependency direction:

- `apps/web` → shared Markdown; never Admin/API client/private services.
- `apps/admin` → generated API client and server-derived capabilities.
- `cmd` constructs config, one logger, SQLite pool, OAuth provider and auth service.
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
Only SQLite pointer/route/audit changes happen on Publish in P0-2; see ADR 0006.

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
The snapshot schema remains version 0 and rejects nonempty entities. Published
snapshot version 1 and public/private export isolation belong to P0-4.
