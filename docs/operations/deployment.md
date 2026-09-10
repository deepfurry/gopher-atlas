# CMS operations (P0-1 runtime; production deployment pending)

The CMS now serves authenticated identity APIs and an embedded Admin. Production
installation/cutover is not part of P0-1. `make check` needs no deployed service.

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
