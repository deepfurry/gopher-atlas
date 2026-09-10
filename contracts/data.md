# Data contract

P0-1 uses `database/sql` + `modernc.org/sqlite`, goose migrations and generated sqlc
queries. Services own transactions; no generic DAO, automatic migrations or schema
mutation on startup/readiness.

## Current identity persistence

`00001_identity.sql` creates only `users`, `author_profiles`, `sessions` and
`oauth_states`. Migrations are immutable after merge; later changes add a version.

- IDs are INTEGER PRIMARY KEY / Go int64. Timestamps are Unix milliseconds.
- `users.github_user_id` is unique, positive and stable; GitHub login is mutable.
  Roles are admin/reviewer/editor, statuses pending/active/disabled, constrained by SQL.
- Author slug is `github-<numeric-github-id>`, unique and read-only in P0-1.
  Profiles store name, safe Markdown bio, GitHub avatar and optional HTTP(S) website.
  Auth role/status are separate from public authorship.
- Session and CSRF columns contain 32-byte SHA-256 hashes only, with absolute expiry
  and revocation. Indexes cover token lookup, per-user revocation and expiry cleanup.
- State stores only its hash, expiry and consumed timestamp. One conditional UPDATE
  consumes it atomically. Cookie equality binds it to the initiating browser.
- Expired state rows are cleaned on login start; expired sessions on successful login.
  Last-seen writes are throttled to five minutes. No in-memory-only login/session state.

Pool: at most four open/four idle connections; idle eviction after five minutes.
Every connection initializes `busy_timeout=5000`, `journal_mode=WAL`,
`foreign_keys=ON`, `synchronous=NORMAL` through modernc DSN `_pragma` parameters.
Tests hold all four connections simultaneously, then evict/reopen them and repeat
PRAGMA/FK checks. Read queries use the pool directly. Multi-step write transactions
use `_txlock=immediate` so their invariants are serialized before the first SELECT.

Bootstrap applies only to the configured matching numeric ID when no active Admin
exists, and never revives disabled users. User mutations re-resolve the acting
session and role after acquiring the write lock. Last-active-Admin disable/demotion
is rejected transactionally; disabling revokes all sessions in the same transaction.

`/readyz` checks reachability, expected applied migration version and all columns
needed by identity queries without writing. Missing, damaged or newer schema is
not ready. Do not use `DATABASE_PATH` from a developer environment in tests.

## Deferred publication invariants

P0-2 will add mutable drafts, immutable revisions, isolated draft/revision
relations, optimistic concurrency, routes, reviews and audit. P0-4 will atomically
update generation/jobs and export only after commit, without transaction network I/O.
No published content/asset physical deletion; historical routes stay reserved.

`content-snapshot.schema.json` remains the **version 0 bootstrap envelope**. It
accepts empty arrays only. Public projection version 1 belongs to P0-4 and must
exclude roles/status, OAuth data, sessions, drafts, reviews, audit, IPs and secrets.

R2 snapshots are not database backups. Production backup/restore must preserve
private data and WAL consistency; see operations documentation.
