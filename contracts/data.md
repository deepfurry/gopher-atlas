# Data contract

P0-2 uses `database/sql` + `modernc.org/sqlite`, goose migrations and generated sqlc
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
needed by identity/editorial queries without writing. Expected version is 2;
P0-1-only, missing, damaged or newer schema is
not ready. Do not use `DATABASE_PATH` from a developer environment in tests.

## Editorial persistence

`00002_editorial.sql` adds content_items/drafts/revisions/reviews, tags,
draft_tags/revision_tags, draft_topic_entries/revision_topic_entries, content_routes
and audit_events. Down version 2 preserves identity schema/data; reapply is tested.
Content type and owner never change. No business hard-delete API exists.

- Four types: curated_article/post/note/topic; only Admin creates Topic.
- One Draft per Content, version >= 1. Whole-snapshot PUT uses expected version
  and updates scalar fields + tags + ordered topic entries atomically. Failed
  stale writes return 409 without partial relations. No save/autosave Audit.
- in_review locks the Draft. Editing synced changes state to draft; editing
  changes_requested preserves that state. Published selection is an independent
  nullable pointer, not another editorial state.
- Submit/direct publish snapshot validated fields, typed payload and relations
  into a uniquely numbered Revision. Immediate transactions serialize numbering.
  SQL triggers prohibit updates/deletes of revisions, revision relations, reviews
  and Audit. Restore copies into Draft and bumps version; it preserves publication.
- Reviewer decisions require exact pending Revision and prohibit owner/byline
  self-review. Admin bypasses this restriction. Reviewed publication uses the
  immutable pending Revision; direct publication creates a new one without approval.
- Unpublish/archive clear published and pending and set draft. Restore archive
  does not republish. First/last publication times and all history remain.
- Byline references an existing author profile; disabled historical authors remain
  valid. Normal Draft PUT can only select the actor as byline; Admin may assign
  another. Featured changes are Admin-only, including historical restoration.

Common fields stay SQL columns. Payload schema version is exactly 1. Concrete Go
structs reject unknown fields and are remarshaled before persistence. Known omitted
payload fields receive zero/default values while authoring. Note group/groupSlug,
Curated sourceUrl and common title/slug/language must be complete before submission
or direct publication. No Curated source fetching occurs.

Limits: title 200 runes, slug 100 ASCII chars, summary 4000 runes, language 32 chars,
SEO title/description 120/320 runes; body 512 KiB UTF-8, review comment 16 KiB;
ordinary JSON 1 MiB. Go Markdown safety validation is authoritative. Tags and Topic
entries each cap at 100. SQL batch queries validate referenced identities.

Tags have deterministic Unicode-lowercase/whitespace-collapsed normalized names,
unique names and explicit unique slugs. Renaming never derives another slug.
Admin writes; active roles select. Topic cannot use Tags. Topic positions are
derived from array order starting at 1; self/duplicate targets are rejected.
Topic references Content identity, not a fixed Revision. Draft/review permits
unpublished targets; publishing requires every target published and unarchived.

## Permanent routes and transactional Audit

New slug grammar: `^[a-z0-9]+(?:-[a-z0-9]+)*$`; never silently slugify.
Routes are /articles/:slug/, /posts/:slug/, /notes/:groupSlug/:slug/, /topics/:slug/.
Path ownership is unique and permanent; a partial unique index allows at most
one canonical per Content. Claiming rechecks ownership inside publication's
transaction. A rename demotes the current path and promotes/inserts the candidate.
The same Content may reclaim its own old path. Redirects store Content identity,
so resolution goes straight to the current canonical, with no chain.
Unpublish/archive never free a path; SQL forbids ownership mutation or deletion.

Audit contains IDs/action/entity, optional revision ID, server-generated request
UUID and typed role/status metadata only. Never Markdown, comment, payload,
credentials, OAuth query, session/CSRF or cookies. A failed Audit insert rolls back
the corresponding mutation, including P0-1 login/user/profile changes.

List APIs use bounded ascending keyset pages of 100. Other-owner Reviewer reads
are limited to pending immutable material and omit Draft; its queue excludes
self-owned/byline work. Editors see own non-archived Content only. Admin may
explicitly include archived items. Route history has a separate cursor endpoint.
Short transactions give multi-query editorial reads a consistent DTO snapshot.

P0-2 Publish ends at SQLite pointer + route + Audit. P0-4 will atomically update
generation/jobs and export only after commit, without transaction network I/O.

`content-snapshot.schema.json` remains the **version 0 bootstrap envelope**. It
accepts empty arrays only. Public projection version 1 belongs to P0-4 and must
exclude roles/status, OAuth data, sessions, drafts, reviews, audit, IPs and secrets.

R2 snapshots are not database backups. Production backup/restore must preserve
private data and WAL consistency; see operations documentation.
