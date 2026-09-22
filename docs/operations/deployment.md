# Production CMS operations

The manually deployed CMS serves identity/editorial/assets/publication APIs and
embedded Admin. Only Development and Production exist. Daily code work is on dev;
main is the Production release snapshot. Implementation checks use local fixtures
and fake services, never the Production environment.

```text
/srv/gopheratlas/
├── repo/
├── bin/gopheratlas-cms
├── data/gopheratlas.db
├── logs/
└── config/cms.env
```

The systemd unit is `gopheratlas-cms.service`; the process listens only on
`127.0.0.1:46217`. Tailscale Serve provides HTTPS within the Tailnet. Public docs
use `https://<private-tailnet-host>.ts.net` and never record a Tailnet IP or actual
private hostname. No additional reverse proxy or public CMS listener is needed.

User-reported verification (2026-09-11): migrations 00001→00003 applied from empty,
embedded binary started, healthz/readyz both 200, loopback binding checked, private
HTTPS and real GitHub OAuth login succeeded, real Asset upload/read succeeded.
On 2026-09-22, the operator updated to a1f4638 with prod-update, ran prod-backup,
resolved GitHub egress through Mihomo, and verified generation 1 synced plus the
Worker homepage. See the [Production runbook](production-runbook.md) for repeatable
commands and the distinction between confirmed and outstanding acceptance.

## Binary and unit

For an already installed Linux/systemd CMS, run as the repository owner (for
example `ops`), without prefixing make with sudo:

```sh
cd /srv/gopheratlas/repo
git pull --ff-only origin main
make prod-update
```

`prod-update` requires a clean `main` checkout. It installs frozen pnpm dependencies,
downloads Go modules and runs `make build-cms` as the operator. Only after a successful
build does it use sudo to stop the CMS, back up the full data directory and old
binary, atomically replace the binary and verify readiness/health. It preserves
the binary's owner/group and installs mode 0750. Build failure leaves the running
service untouched. Do not also run the old host-local `update.sh`.

Run `make prod-backup` for an independent backup; see [backup-restore.md](backup-restore.md).
Both commands briefly interrupt private CMS access; the deployed Cloudflare Public
remains available. A maintenance lock prevents overlapping backup/install operations.
Neither command sources/prints `.env`/`config/cms.env`, changes systemd/Tailscale/DNS,
performs migrations, deletes old backups, or invokes R2/Hook directly. Starting the
configured CMS can resume its normal publication jobs.

Defaults match `/srv/gopheratlas` and `gopheratlas-cms.service`. An explicitly
different root can use `GOPHERATLAS_ROOT=/absolute/path make prod-update`; checkout
must be ROOT/repo. Linux requires Bash, GNU coreutils, util-linux `flock`, curl,
systemd and sudo, plus the repository's Node/pnpm/Go build tools for updates.
Windows local Development continues to use `make dev`.

If backup fails before replacement, the script tries to restart the original
service. If the newly installed binary fails readiness/health, it stops that
service and reports the backup location. It does not automatically roll back a
database or binary after new code has run: publication generation may already have
advanced. Inspect the failure before recovery.

`make build-cms` builds Admin and Go with `adminembed`; install the resulting
`.cache/bin/gopheratlas-cms` at the path above. Plain Go builds intentionally omit
the SPA and must not be deployed. No Node process is needed at runtime.

Minimal unit reference below uses a dedicated unprivileged `gopheratlas` account;
retain the actual service account if already configured. This is an example, not
an assertion that every hardening option is currently installed.

```ini
[Unit]
Description=GopherAtlas private CMS
After=network-online.target tailscaled.service
Wants=network-online.target

[Service]
Type=simple
User=gopheratlas
Group=gopheratlas
WorkingDirectory=/srv/gopheratlas
EnvironmentFile=/srv/gopheratlas/config/cms.env
ExecStart=/srv/gopheratlas/bin/gopheratlas-cms
Restart=on-failure
RestartSec=5
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=/srv/gopheratlas/data /srv/gopheratlas/logs

[Install]
WantedBy=multi-user.target
```

Keep config readable only by the operator/service account; data/log directories
must be writable by that account. Production uses process env via EnvironmentFile,
not automatic .env loading. Set APP_ENV=production, CMS_LISTEN_ADDR=127.0.0.1:46217,
DATABASE_PATH=/srv/gopheratlas/data/gopheratlas.db and
LOG_FILE=/srv/gopheratlas/logs/cms.jsonl. CMS_BASE_URL is the private HTTPS origin;
OAuth callback is that exact origin plus `/api/auth/github/callback`. Keep OAuth,
bootstrap ID, bucket credentials and Hook values out of source and command output.

Tailscale Serve forwards private HTTPS to `http://127.0.0.1:46217`. Operators can
inspect `tailscale serve status`. Configure `tailscale serve --bg http://127.0.0.1:46217`
only when deliberately setting up the service. Do not enable Funnel or copy status
output containing the private hostname/IP into reports.

Routine local service verification:

```sh
systemctl is-active gopheratlas-cms.service
curl --fail --silent http://127.0.0.1:46217/healthz
curl --fail --silent http://127.0.0.1:46217/readyz
```

Migrations remain explicit. From repo with DATABASE_PATH explicitly set, run
`make db-status` / `make db-up`; these never load .env. Startup/readiness never
migrate. Update order: consistent backup → explicit migrations if needed → matching
embedded binary → systemd restart → local readiness → private Admin verification.
No migration is needed for P0-5. Do not run a second CMS writer during upgrades.

Logging uses one Zap logger, stdout plus Lumberjack rotation (100 MB, ten backups,
30 days, compressed by default). Access fields exclude callback query, body,
headers/cookies and provider errors. Tailscale configuration must not introduce
OAuth query logging. Monitor is `/ops/monitor`, active Admin only. Shutdown joins
the worker before SQLite/logger closure. Readiness checks schema 3 without external
network probes. Manage users through Admin; last-active-Admin protection applies.

## Publication operations

Only one active CMS writer is supported. A configured restart can process queued
jobs immediately. Development uses persistent local FileStore and ignores R2/Hook
configuration. Production requires complete identity and publication settings
(see .env.example); partial Production configuration fails.

Jobs persist pending/snapshot_uploaded/build_triggered/failed/superseded.
Old actionable generations are coalesced. Safe failures retry at 30s, 2m, 10m,
30m, 1h; six failed attempts stop automatic retry. Reviewer/Admin may retry only
the current failed generation. Retry preserves uploaded snapshot metadata and is
audited. Hook is at-least-once: an accepted call may repeat after DB failure/crash.

If a published Topic references an unpublished/archived target, export fails
closed. Revise/unpublish the Topic or restore its target; never remove validation.
New public mutations supersede older failures. Asset soft deletion preserves
historical covers and immutable URLs.

Publication compares a credential-free bounded marker GET with desired generation:
live equal, pending marker older, behind marker newer, unknown invalid/unavailable.
Job state is independent. An old DB restore can be behind the bucket and hit
immutable-key integrity checks; stop and review recovery. Never overwrite snapshots
or lower remote pointers manually. Migration 3 Down refuses to lose new Audit rows;
restore a reviewed consistent backup instead of deleting history.

See [Production Cloudflare Builds](cloudflare.md) and [backup boundary](backup-restore.md).
ADR 0015 reduces P0-6 to fresh-start domain cutover; no Production legacy import
is planned. Restore verification remains unperformed and must not be inferred
from successful backups. See the Production runbook before further operations.
