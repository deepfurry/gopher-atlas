# CMS operations (P0-4; real staging pending)

The CMS serves identity, editorial, assets and publication APIs with an embedded
Admin. Host installation/cutover remains a separate manual operation. `make check`
uses no deployed service or real external credentials.

Build with `make build-cms`; distribute the resulting Go binary from `.cache/bin`.
It contains Vite assets via `adminembed` and requires no Node process. Direct
`go build` without the tag intentionally omits the SPA. Never deploy that variant.

Use an unprivileged systemd user. Intended paths: binary `/opt/gopheratlas/bin`,
DB `/var/lib/gopheratlas/gopheratlas.db`, environment file `/etc/gopheratlas/cms.env`,
logs `/var/log/gopheratlas/cms.jsonl`. Protect directories and use a restrictive
umask. systemd EnvironmentFile/process env configures production; the binary does
not search for `.env`. Only `make dev-cms` explicitly loads the root optional file.

Require APP_ENV=production, HTTPS CMS_BASE_URL, matching OAuth redirect path/origin,
complete client credentials and numeric BOOTSTRAP_ADMIN_GITHUB_ID. The process
remains loopback-only behind Tailscale HTTPS. No public listener or Cloudflare CMS
proxy. Ensure the reverse proxy uses path-only access logs without OAuth query,
cookies, headers or bodies; application logging cannot sanitize a proxy's logs.

SQLite migration remains explicit: set DATABASE_PATH, run `make db-status` and
`make db-up`. These commands never auto-load `.env`; startup/readiness never run
migrations. Install order: backup → explicit migration → binary install → restart
→ /readyz → private Admin verification. /healthz remains process liveness even
when persistence is unavailable. /readyz returns 503 for missing/incompatible schema.

Logs tee structured JSON to stdout and Lumberjack. Configure LOG_FILE/LOG_LEVEL and
LOG_MAX_SIZE_MB/MAX_BACKUPS/MAX_AGE_DAYS/COMPRESS; defaults are 100 MB, 10 backups,
30 days, compressed. Graceful shutdown drains Fiber before DB/logger closure.
Monitor is `/ops/monitor`, active Admin only, with app-wide HTTP metrics. No exact
GC pause collection or external dashboard assets are enabled.

First matching bootstrap login becomes Admin only if none exists. Unknown users
wait pending. Approve them as Editor/Reviewer in Users; role changes can authorize
another Admin before demoting the first. Disabled users cannot bootstrap again.
Protect last-Admin invariants; out-of-band recovery procedures require a separately
reviewed operation. No production recovery user or credentials are embedded.

Consider NoNewPrivileges, PrivateTmp, ProtectSystem=strict, ProtectHome and scoped
ReadWritePaths before cutover. No Docker/K8s, extra database or self-hosted CI runner
is required. Test production unit/proxy configuration separately before deployment.

## P0-4 publication operations

Only one active CMS writer process is supported. Starting a fully configured
worker may immediately process previously queued jobs; configuration is therefore
an operator action, not a harmless local smoke test. Development with all eight
P0-4 values empty leaves the worker disabled, records jobs, and rejects upload
with publication_not_configured. Partial configuration fails. Production requires
all eight plus the existing identity configuration. No external readiness ping.

Install in order: backup → explicit schema-3 migration → matching embedded binary
→ configured restart → local readiness → private Admin → staging marker. Never
modify migrations 00001/00002. Migration 3 preserves old Audit and adds the two
entity types; Down refuses to discard new asset/publication Audit rows. Recovery
should use a reviewed consistent DB backup rather than deleting Audit history.

Worker jobs persist pending/snapshot_uploaded/build_triggered/failed/superseded.
Old actionable generations are coalesced. Safe failures retry at 30s, 2m, 10m,
30m, 1h; six failed attempts stop automatic retry. Reviewer/Admin may retry only
the current failed generation. Retry preserves uploaded snapshot metadata and is
audited. Hook is at-least-once: an accepted call may repeat after a DB failure or
crash. A process signal cancels external requests and joins the worker before
closing SQLite. No raw provider errors or Hook URL are logged.

If a published Topic references a target that was subsequently unpublished or
archived, export fails closed. Revise/unpublish the Topic or restore its target;
do not remove graph validation to make the build pass. New public mutations queue
new generations and supersede older failures. Asset soft deletion does not
invalidate historical covers or physically delete their objects.

Publication compares a bounded, credential-free GET of PUBLIC_SITE_URL's build
marker with desired generation: live equal, pending marker older, behind marker
newer, unknown invalid/unavailable. Job state is independent. An old DB restore
can be behind the bucket and hit immutable-key integrity checks; stop and review
recovery, never overwrite snapshots or lower remote pointers manually.

See [Cloudflare staging checklist](cloudflare.md). Real staging, host installation,
production DNS and cutover are not executed by the P0-4 implementation task.
