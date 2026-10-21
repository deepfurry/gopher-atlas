# Data contract

## Issue #20 editorial localization (ADR 0021)

Current CMS requires SQLite schema 5 and exports closed Snapshot v3. Public accepts
v1/v2/v3. Schema 4, v2 writer and B2 operational facts below remain historical.
Curated/Topic use one identity/version/review/published pointer with optional
editorialEn in full Draft/Revision DTOs. English text is stored in SQL TEXT columns,
not the 32 KiB payload (payload schema stays 1). Enabled English must have nonblank
safe title/summary/body before publication; SEO is optional and never auto-written.
Disabled/partial text remains private. Existing primary-text validation remains
compatible, and historical published Revisions stay exact.
New Draft writes may omit editorialEn only when no English data exists; omission
must not erase existing translations. Notes/Post reject editorialEn and retain their
original language semantics. English source labels reference shared related URLs.
All fields and relations commit in the same optimistic snapshot transaction.

Migration 00005 preserves original columns/history, adds an explicit writer gate and
refuses lossy Down. Existing databases require offline activation that allocates one
fresh generation and Audit/job before the v3 writer starts. Never reuse a v2 key.
See [upgrade and rollback gates](../docs/operations/editorial-localization-upgrade.md).

## B1 Public reader compatibility (ADR 0018)

B2 (ADR 0019) now writes v2 with SQLite schema 4; content payload schema remains 1.
B1 introduced the consumer independently, before the writer upgrade. The original closed
`content-snapshot.schema.json` is immutable for this delivery; the independent
`content-snapshot.v2.schema.json` is the exact v2 wire contract. Both versions
retain every shared public field and safety/reference rule. Unknown versions and
fields, mismatched latest/snapshot versions/hashes and invalid graphs fail closed.

v2 tags require `nameEn`/`descriptionEn` (empty allowed), and `groups` requires
unique IDs/slugs, bilingual name/description and non-negative order. Groups and
published Note groupSlug references resolve in both directions. v2 Notes contain
only groupSlug/order. The reader derives consistent v1 groups from embedded
payloads, then uses one model and field-by-field English-to-Chinese fallback.
No authored content, canonical route, permanent slug or comment term is translated.
The source schemaVersion/hash survive normalization in the public build marker.
B1 must be deployed and verified against current v1 before any B2 Production rollout.

## B2 authoritative taxonomy (ADR 0019)

Migration 00004 adds note_groups and English-only tag_translations; existing tag
IDs/slugs/names and all historical content remain unchanged. Tags and groups have
permanent slugs. No hard-delete API exists. Admin writes; reauthorized active roles
read bounded ID-keyset pages (100) with q <=100 characters over slug/Chinese/English
name. Translation rows need a nonempty English name; English tag descriptions
without a name are rejected. Empty/omitted English tag inputs remove the translation.
Group English fields may be independently empty; Public falls back per field.

Note Draft payload remains v1. Save/restore/new Revision gates resolve groupSlug
and overwrite display mirrors from note_groups; empty groupSlug is allowed only
for incomplete Drafts. Current read projections resolve metadata without mutating
stored rows. Historical Revision reads remain exact. A historical group must exist
before restoring its Revision. Reviewed publish selects the exact candidate.
Metadata updates to groups/tags used by selected active published Revisions take
the fence before BEGIN and atomically append Audit plus one generation/job.
Draft-only/unused taxonomy changes never publish.

The explicit offline plan/apply tool scans current Drafts and selected active
published Notes, rejects inconsistent mirrors, checks a source fingerprint and
imports groups without changing content/history/routes. taxonomy_state blocks
readiness/export until apply commits for existing databases; fresh empty databases
initialize ready in the migration. Apply advances one generation for v2 bytes,
never reusing an immutable v1 snapshot key or creating new article Revisions.
Down refuses new taxonomy/import/Audit data. See the
[upgrade runbook](../docs/operations/taxonomy-v2-upgrade.md).

## P0-5.5 product alignment (ADR 0012; taxonomy superseded by ADR 0019)

The original P0-5.5 increment made no migration; B2 preserves 00001–00003 and
adds 00004. Normal workflows
use curated_article, topic and note; post remains a compatible stored/API type.
Note payload v1 adds groupDescription (<=1000 characters) and groupOrder (0..1M).
Topic payload adds recommendedCount (0..100 and <=entry count); all targets must
be curated_article at save/submit/publish/export. Historical v1 exports require matching embedded group mirrors; v2 ignores those
mirrors and reads current note_groups metadata.

Curated difficulty is beginner/intermediate/advanced; rating is
S+/S/A+/A/B+/B/C+/C. Incomplete Draft fields may be empty, complete publication may
not. Typed payloads reject unknown fields and canonicalize through Go structs.
Omitted new fields in old stored payloads deserialize to defaults, without editing
immutable Revision rows. The closed public snapshot schema requires these fields.

Offline legacy import uses normal services. Content first/last published and
created/updated times may be restored from reliable legacy dates inside the same
direct-publish transaction as pointer/routes/Audit/generation/job; Revision and
Audit timestamps retain actual import time. No HTTP endpoint exposes restoration.

P0-4 uses `database/sql` + `modernc.org/sqlite`, goose migrations and generated sqlc
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
needed by identity/editorial queries without writing. Expected version is 5;
Older, missing, damaged or newer schema is
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
unique names and explicit immutable slugs. Renaming cannot change the slug.
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

P0-4 Publish atomically updates pointer + routes + Audit + generation/job.
Export and network stages occur after commit; see ADR 0008.

`content-snapshot.schema.json` is the **closed public version 1 projection**.
It excludes role/status, GitHub identity/login, sessions/OAuth, Drafts, Reviews,
Audit, IPs and credentials. Only referenced authors/tags/covers and published
unarchived Revisions/routes are exported. Topic targets must exist in the same
projection. Draft never supplies an exported field.

R2 snapshots are not database backups. Production backup/restore must preserve
private data and WAL consistency; see operations documentation.

ADR 0013: Development persists the same schema 4 data and jobs in local SQLite,
with assets/full snapshots in sibling `storage/assets` and `storage/content`.
Treat DB and storage as one backup set. Startup never resets/seeds data, rewrites
immutable revisions, migrates schema or retrieves old remote objects. Local
latest.json is written only by that DB's existing publication worker, separately
from Production. No new tables or persistence service.

## Publication persistence

00003 adds assets, nullable Draft/Revision cover_asset_id, singleton site_state
(initial generation 0), and constrained publication_jobs. Audit is rebuilt with
asset/publication entity types, preserving all rows and append-only triggers/indexes.
Down refuses to lose new asset/publication Audit history; otherwise it restores
the v2 constraint and removes only v3 additions. Keep backups before migration.

Cover selection requires an undeleted asset; submit/direct publish snapshot it.
Historical restore may copy a deleted cover; a subsequent save/submit must replace
or remove it. Soft deletion preserves published covers and immutable Markdown URLs.
Uploading bytes of a deleted asset requires explicit Admin restore, not implicit revival.

Public-impact triggers: reviewed/direct publication, unpublish, previously
published archive; Author update if used by current publication; Tag update if
used by a selected published Revision. Draft/save/submit/withdraw/changes/restore,
Tag creation, unused Author/Tag changes, assets and user role/status do not advance
generation. Job insert failure rolls back business state, route, Audit and counter.

Snapshot bytes are deterministic for a generation; exportedAt uses its stored
site_state timestamp, not retry wall time. Bound: 128 MiB, 10000 content,
100000 routes/tags; references and route/Topic graph fail closed. Deleted covers
remain exportable if selected by a published Revision. No network I/O inside a DB tx.
