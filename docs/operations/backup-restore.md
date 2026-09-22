# Production backup and P0-6 restore boundary

Production SQLite is `/srv/gopheratlas/data/gopheratlas.db`, schema 3. It includes
identity/session/state hashes, private Drafts/Reviews/Audit, assets and publication
state. Backups are private. Copying only the main DB of a live WAL database is not
a consistent backup. Immutable public R2 snapshots cannot replace private backups.

P0-5 does not implement or execute a backup/restore drill. P0-6 must choose and
verify a SQLite-consistent backup procedure using existing host operations, with
protected off-host retention, before import/cutover. Do not invent a scheduler or
another infrastructure service here.

The drill must preserve the failed DB, stop gopheratlas-cms.service, restore a
verified consistent backup, run integrity_check, check/apply explicit migrations,
start the matching embedded binary and verify readiness/private login. Verify
publication generation and immutable snapshot identity before resuming the writer:
an older DB may be behind the public marker and collide with existing generation
keys. Stop for an explicit recovery decision; never overwrite immutable snapshots
or silently reset generation. Document the actual drill evidence in P0-6.
