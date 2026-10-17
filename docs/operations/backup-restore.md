# Production backup and P0-6 restore boundary

Production SQLite is `/srv/gopheratlas/data/gopheratlas.db`, schema 4 since the
operator-confirmed 2026-10-17 B2 upgrade. It includes
identity/session/state hashes, private Drafts/Reviews/Audit, assets and publication
state. Backups are private. Copying only the main DB of a live WAL database is not
a consistent backup. Immutable public R2 snapshots cannot replace private backups.

## On-demand backup

From the existing server checkout, run as the operator:

```sh
cd /srv/gopheratlas/repo
make prod-backup
```

The script uses sudo, stops the sole CMS writer, verifies it is stopped, then copies
the entire data directory (including any WAL/SHM files) and the current binary.
It restarts the original service only if it was running before backup and verifies
readiness/health. An originally stopped service stays stopped. No other process
may write this database during maintenance. `make prod-update` takes the same
backup automatically before replacing the binary.

Backups live under `/srv/gopheratlas/backups/<UTC timestamp>.<unique suffix>/`.
The backup parent and each backup directory are root-only (0700):

```text
gopheratlas-cms
data/                  # database plus any WAL/SHM and other local data
SHA256SUMS             # copied binary and SQLite file checksums
metadata.txt           # operation, checkout commit, previous active state
COMPLETE               # written only after copying/checksumming succeeds
```

`checkout_commit` describes the checkout at backup time, not necessarily the old
binary's source revision. There is no retention/deletion scheduler. Incomplete
backups lack COMPLETE and must not be treated as usable recovery points. Checksums
verify file copying, not a full SQLite restore drill. Configuration/Secrets and
R2 objects are not copied; the existing protected `config/cms.env` is unchanged.

## Recorded evidence and outstanding recovery acceptance

The operator successfully executed prod-update and prod-backup on 2026-09-22,
before publishing generation 1. Those historical copies do not contain the later
publication and are not the current recovery baseline.

On 2026-10-17, B3 rehearsed a user-provided consistent Production backup on an
isolated local working copy. Schema 3→4, taxonomy apply and Snapshot v2 export/B1
static consumption passed; original backup files and historical business data
were preserved. This demonstrates offline migration compatibility, **not a
Production disaster-recovery drill**, restored service/login, or external
publication recovery. A downloaded copy also does not demonstrate a continuing
protected off-host retention policy.

The operator subsequently confirmed the actual Production upgrade to CMS
`ad73db37c70946c8f8b5087103b462f53822a6c3`, schema 4, `taxonomy_state.ready=1`,
generation 14→15; counts were 13 content items, 15 Revisions, 14 tags, 4 groups
and 11 routes. Integrity was `ok`, foreign-key errors zero, local v2 export
validation passed, and prod-update/systemd/health/readiness checks succeeded.
The reported post-update backup is
`/srv/gopheratlas/backups/20261017T145739Z.nizHXb/`.
Its successful creation is recorded separately from restoration: no Production
restore from that backup has been demonstrated. The operator separately confirmed
the Public Marker for Snapshot v2 / generation 15 / commit `ad73db3`; see the
[exact Marker evidence](production-runbook.md#公开-marker-验收补记).
Public synchronization does not demonstrate restoration of this backup, service
recovery, or recovery of external publication state after a disaster.

Keep root-only backup protection. For an authorized rehearsal, prepare a separate
controlled copy accessible to the selected service account; do not loosen the
original backup or give `ops` unrestricted DB access. Goose/taxonomy must be
executable, migration SQL and all parent paths readable/traversable, and working
DB/report directories writable by `gopheratlas`. See the
[Linux permissions procedure](taxonomy-v2-upgrade.md#linux-服务账户与迁移文件权限).

Take a current backup before later maintenance. ADR 0015 removes Production import
from the plan, not the responsibility to preserve and recover existing data.
No new service or scheduler is introduced.

The drill must preserve the failed DB, stop gopheratlas-cms.service, restore a
verified consistent backup with the correct service-account permissions, run
integrity_check/foreign_key_check and check/apply explicit migrations if required.
Before starting the matching embedded binary (which resumes the writer), verify
publication generation and immutable snapshot identity:
an older DB may be behind the public marker and collide with existing generation
keys. Stop for an explicit recovery decision; never overwrite immutable snapshots
or silently reset generation. Only after that decision, start the service and
verify readiness/private login and publication recovery. Record the actual
disaster-recovery evidence separately from the B3 migration rehearsal.
