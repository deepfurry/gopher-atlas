# Backup and restore boundary (deferred)

No application database exists in P0-0. Later CMS backup must use a SQLite-consistent
online mechanism; copying a live database file without its WAL is not a backup.
R2 publication snapshots omit drafts, sessions, reviews and audit, so they cannot
restore the control plane.

Before cutover, implement and rehearse: stop CMS, preserve the failed database,
restore backup, run integrity_check, apply explicit goose migrations, start CMS,
verify readiness and generation status. Integrate off-host scheduling with existing
Infra facilities. Do not add a new infrastructure stack for this requirement.
