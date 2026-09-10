# Backup and restore boundary (implementation deferred)

The P0-1 SQLite database holds users, author profiles, hashed sessions and OAuth
state. Backups remain private even though bearer tokens are not persisted. A live
WAL file cannot be safely backed up by copying only the main database file.

Before production cutover, implement a SQLite-consistent online backup mechanism
and rehearse restore: stop CMS, preserve the failed DB, restore backup, run
integrity_check, apply explicit goose migrations, start CMS and verify /readyz.
Later publication state needs its own generation/build check. No backup command,
scheduler or production restore drill is claimed implemented in P0-1.

R2 snapshots will omit private control-plane state and cannot replace DB backups.
Use existing Infra off-host scheduling after the restore procedure is verified;
do not add a new infrastructure stack for this requirement.
