# Architecture map

The public and control planes have separate availability and trust boundaries:

```text
Private CMS → future published R2 snapshot → Astro build → static public site
```

P0-1 ships the private identity runtime; Public still builds its version 0 empty
fixture. No content model, editorial workflow, R2 adapter, jobs, audit persistence,
legacy importer or deployment is implemented.

Dependency direction:

- `apps/web` → shared Markdown; never Admin/API client/private services.
- `apps/admin` → generated API client and server-derived capabilities.
- `cmd` constructs config, one logger, SQLite pool, OAuth provider and auth service.
- `internal/app` assembles HTTP middleware; `internal/http` translates transport;
  `internal/auth` owns identity/session transactions and calls sqlc directly.
- `internal/policy` is the fixed role/status capability mapping. Services recheck
  actors inside write transactions; React never implements role authorization.
- `internal/markdown` validates author bio safety with Goldmark/GFM and the existing
  shared Markdown fixtures. Browser validation cannot replace the Go boundary.
- Shared TS packages never import apps. Generated code contains no manual logic.

SQLite uses a four-connection pool with DSN initialization on every connection.
Write services use immediate transactions to serialize bootstrap and last-Admin
checks before reading state. External OAuth I/O completes before any DB identity
transaction. Schema migration is an explicit operation, never startup/readiness.

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
