# 0014 — On-demand Production update and backup

Date: 2026-09-22. Status: Accepted.

The existing Linux/systemd installation needs repeatable commands after pulling
main. A host-local update.sh lacked backups and migrated before building. Adopt
two Make targets over one Bash script, preserving the established paths and unit.

Build unprivileged before downtime; use sudo only for stopped-writer backup and
installation. Copy the whole data directory including WAL, retain the old binary,
mark completed backups and replace the binary by a same-directory rename. Serialize
builds and maintenance. Failed backup resumes the old service where possible;
failed new startup stops the candidate, preserving backup and current database.
No automatic rollback can assume publication generation has not advanced.

Do not source secrets, migrate, configure infra, invoke remote storage/deploy hooks,
delete backups or add scheduling. Restarting the CMS may resume its normal outbox.
The backup is a local recovery input, not evidence of a completed restore drill or
off-host retention. P0-6 still owns those verification and cutover responsibilities.

A larger deployment framework and automatic DB rollback were rejected as unnecessary
for this single-writer host. Tests run real filesystem operations with fake build,
privilege, systemd and loopback-health commands; never against Production.
