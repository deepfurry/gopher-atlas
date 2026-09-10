# Data contract

P0-0 has no application database or business schema. P0-1 introduces SQLite through
`database/sql` and pure-Go `modernc.org/sqlite`; sqlc reads goose migrations and
named queries. No AutoMigrate or implicit startup migrations.

- Connection settings: WAL, foreign_keys ON, busy_timeout 5000, synchronous NORMAL.
  Verify connection-level pragmas across the pool when persistence is implemented.
- IDs use INTEGER PRIMARY KEY / Go int64. Persist timestamps as Unix milliseconds.
- Versioned goose migrations are authoritative; released files are immutable.
- Services own transactions and call sqlc directly, without redundant DAO layers.
- Drafts are mutable with optimistic version checks; stale writes return 409.
  Revisions are immutable. Reviewed publication uses the exact reviewed revision.
- Draft tags/topic relations are isolated from revision relations. A Topic references
  content identity; public builds resolve the current published revision.
- Publishing updates generation, durable jobs and audit atomically. R2 and deploy
  hook requests happen only after commit. Jobs must resume and coalesce safely.
- Published content and R2 assets are not physically deleted in P0. Historical
  public paths remain reserved. Asset object keys and generation snapshots are immutable.

`content-snapshot.schema.json` is a **version 0 bootstrap envelope**. Its empty
arrays are intentional: unmodelled entities and additional private fields are
rejected. P0-4 must introduce a reviewed version 1 schema with explicit public
projections, schema fixtures and isolation tests. No drafts, review comments,
roles/status, OAuth data, sessions, audit, IPs or secrets may be exported.

R2 snapshots are not database backups. Backup/restore must preserve private data
and SQLite WAL consistency; operations documentation records deferred requirements.
