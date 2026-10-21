# Editorial localization: Schema 5 / Snapshot v3 upgrade

Issue #20 / ADR 0021. These are operator instructions, **not a record of a
Production upgrade**. No Production database has been rehearsed for this change.
`make prod-update` does not migrate the database.

## Release gate 1: Public reader first

Release only a Public build that accepts closed Snapshot v1/v2/v3 before installing
the new CMS. Verify the current v2 marker (schemaVersion, generation, hash, commit),
all current Note paths, redirects, Giscus terms, Pagefind, RSS and sitemap. Test
synthetic v3 Chinese-only, partial/disabled English and enabled English builds.
The first release may contain the new CMS sources, but do not install/start them yet.

## Protected-copy rehearsal

Create a consistent backup through the existing backup runbook and preserve it.
Keep the original extracted data unchanged; migrate only a second working copy,
outside Git. Inventory schema, active Admin IDs, current generation, content types
and primary languages. Review existing non-Chinese Curated/Topic records before
enabling a translation; never relabel historical text automatically.
Record original content/revision/review/tag/route counts and exact old field values.

Build matching offline tools from the reviewed release. They do not load `.env`
or construct R2/Hook clients. Use the existing pinned Goose tool with `-env none`:

```sh
# Explicit paths to the OFFLINE COPY and readable migration directory.
goose -env none -dir /path/to/release/db/migrations sqlite3 /path/to/copy/cms.db up-to 5
gopheratlas-editorial-upgrade -db /path/to/copy/cms.db \
  -actor-id <existing-active-admin-id> -expected-generation <reviewed-generation> \
  -writer-stopped
```

Use the pinned repository Goose version/build tags from `scripts/tools.json` and
`scripts/lib.mjs`, rather than installing an arbitrary newer version. Build the new
tool with `go build -o <output> ./cmd/gopheratlas-editorial-upgrade`.

00005 is additive: independent English text columns on Draft/Revision, an English
publication flag, bounded source-label JSON and a writer readiness gate. Original
columns, identities, publication timestamps, relation order and historical routes
must remain equal. The gate is pending on existing content and ready on fresh empty
databases. Activation rechecks Schema 5, an active Admin and the expected generation
inside one immediate transaction, appends safe Audit and queues **exactly one new
generation** without making article Revisions. Repeated activation is rejected.

Check `PRAGMA integrity_check`, `PRAGMA foreign_key_check`, schema version, unchanged
business/history values, `editorial_localization_state.ready=1`, `activated=1`,
generation +1 and one new job. Export locally using the existing offline export tool
(its current binary now requires activated Schema 5), validate v3, and build Public
using the explicit exported file. Check Chinese/English routes and marker/hash.
Do not treat a synthetic-copy test as a real Production backup recovery drill.

## Release gate 2: separately authorized CMS upgrade

Only after reader acceptance and protected-copy rehearsal: stop the sole writer,
take/verify another consistent backup, run 00005 and activation with the correct
service account, then install/start matching CMS/Admin. Production SQLite is owned
by `gopheratlas`; `ops` must not directly migrate it. Both Goose and the activation
tool need controlled service-account access, writable DB/WAL directory and readable
SQL files. Do not loosen the data directory to world-readable/writable.

Activation's `-writer-stopped` means all writers really are stopped. Verify readiness
before allowing the new worker to export. Never retry old v2 bytes as v3 at the same
immutable generation key. Verify the new Snapshot v3 hash/latest pointer/Hook/build
marker, existing Notes and enabled/disabled translation indexing. The published CMS
pointer and a successful Hook alone do not prove the public build is current.

## Rollback

Keep a v3-capable Public reader after any v3 snapshot exists. Schema-4 CMS deliberately
rejects Schema 5; do not simply replace its binary. Stop writes and prefer a forward
fix. Down refuses nonempty English fields or completed activation; it never silently
deletes translations. Restoring a backup requires a separately approved recovery plan
for subsequent writes, publication generation high-water and remote immutable keys.
Never overwrite old snapshot keys or silently reduce generation.

## Manual acceptance

- Curated/Topic: one identity, full-width source/order modules, properties below;
  Chinese and English selection/Undo, focus, image/alt cancellation and autosave.
- English empty, partial, full-but-disabled, enabled and invalid; empty SEO falls
  back only in presentation. Review and restore both languages as one Revision.
- Real English details: self canonical, correct lang/SEO/OG and reciprocal hreflang;
  unavailable pages: English notice, Chinese link, noindex, no body/index/hreflang.
- Topic order/recommended prefix and unpublished dependency gates remain shared;
  untranslated referenced articles show language and use actual original paths.
- Current Note/Post workflows, permanent paths, redirects, comments, counts, RSS,
  Pagefind and marker privacy remain intact. No new framework or service.

## Development verification (2026-10-21)

The synthetic Schema-4 consistent-copy test preserves 12 Notes plus immutable
Revision/review/route/tag data, passes integrity/foreign-key checks, rejects stale
actors/generations and repeated activation, rolls back Audit failure, and exports
v3 after exactly one new generation. This is not a real Production backup rehearsal.
Closed v1/v2/v3 fixture builds pass the shared SEO, redirects, sitemap, RSS, Pagefind,
marker and synthetic-secret artifact gates. Language views retain Content counts.

Go analysis/tests/build, generated SQL/OpenAPI drift, Admin/Web type checks and
scoped browser/interaction tests were run locally on Windows. The initial full
check exposed obsolete schema/language assertions, a primary-text compatibility
regression and parallel UI timeouts; fixes received targeted rechecks and the
remaining full-gate steps were resumed without repeating unrelated work. Browser
checks use synthetic local transport/components: native Undo, selection, Focus,
language switching, keyboard order, light/dark and 390 px layout, plus real static
English/fallback pages. Live OAuth/review sessions, real-backup rehearsal, Linux
race/CI and Production marker/R2/Hook acceptance remain separate verification.
