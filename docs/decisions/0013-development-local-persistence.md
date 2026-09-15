# 0013 — Persistent local Development storage

Date: 2026-09-12. Status: Accepted.

## Context

Normal Development must use the same real CMS data across Admin, published Public
and Draft Preview. Fixed fixtures and remote R2 inputs separated those views and
made local work depend on external infrastructure. This supersedes the Development
R2/fallback/fixture choices in ADR 0011, not its isolated restarts or safe preview.

## Decision

- APP_ENV=development always selects File ObjectStore. Its root is `storage`
  beside DATABASE_PATH, with logical `assets` and `content` buckets. Defaults are
  `data/gopheratlas.db` and `data/storage`. No migration, seed, reset or network
  storage setup is performed by startup. Existing state is never deleted.
- FileStore uses Go os.Root for path containment, including symlink replacement.
  It writes/syncs temporary files, atomically links immutable destinations without
  replacement, and renames complete latest pointers. Existing digest matches are
  idempotent; differing bytes fail integrity. Head derives the application's MIME,
  cache and digest metadata from bytes/namespaces; no metadata database is added.
- Existing Asset and Publication services, transactions, outbox fence, immutable
  history and retry semantics remain. The local worker's Hook is a no-op; its
  existing build_triggered terminal state means local snapshot ready. Local status
  verifies local latest/object digest without constructing a fake build marker.
- CMS serves validated SHA image keys only at `/__dev/assets/*`, registered only
  in Development, with loopback peer/Host checks. Missing assets are 404, failed
  disk I/O is classified. No directory browsing, file deletion or auth bypass.
- Go/TS policies explicitly carry the configured local image base. Their default
  remains exact Production HTTPS assets; local mode only accepts that loopback
  base and valid SHA keys. JSON Schema retains structural bounds and runtime
  validation enforces the origin. Public visual DOM/CSS is unchanged.
- Normal dev/dev-web reject CONTENT_SNAPSHOT_FILE and ignore R2/CONTENT_R2/Hook.
  A 750ms file poll validates latest/hash/schema/graph, then restarts only Public.
  Missing initial publication means an empty site, not seeded fixture content.
  Failed polls keep the last good input and retry. Ctrl+C keeps all persisted data.
- Production still uses the R2 adapter, independent content RO build credentials,
  strict Production asset policy, immutable snapshots and Cloudflare Hook. No
  local fallback or Development preview/asset HTTP route enters Production.

## Consequences

SQLite and its sibling storage directory form one Development state set. Existing
remote-only Development objects are not fetched or rewritten automatically: use
the editor to replace old image URLs and publish a new generation. Snapshot paths
already reserved in a local store cannot be overwritten after restoring an older
DB. Keep matched backups; startup never deletes data to repair such a conflict.

GitHub OAuth remains the existing login mechanism and needs network for a new
login. Once authenticated, a valid persistent session can edit/upload/publish
offline; no anonymous bypass or fake-user seed is added. Dependency installation
also needs its usual network/cache. Local filesystem storage removes Cloudflare
and R2 from the editing/publication flow, not these separate prerequisites.

MinIO, another local service, a second publication path, automatic seed/reset and
silent fixture fallback were rejected because they obscure the actual CMS state.
