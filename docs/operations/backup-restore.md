# Production backup and P0-6 restore boundary

Production SQLite is `/srv/gopheratlas/data/gopheratlas.db`, schema 3. It includes
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

This implements local on-demand backups, not the P0-6 restore drill or protected
off-host retention. Verify both before Production import/cutover. No new service
or scheduler is introduced.

The drill must preserve the failed DB, stop gopheratlas-cms.service, restore a
verified consistent backup, run integrity_check, check/apply explicit migrations,
start the matching embedded binary and verify readiness/private login. Verify
publication generation and immutable snapshot identity before resuming the writer:
an older DB may be behind the public marker and collide with existing generation
keys. Stop for an explicit recovery decision; never overwrite immutable snapshots
or silently reset generation. Document the actual drill evidence in P0-6.
