# ADR 0015: Fresh-start publication and domain-only cutover

- Date: 2026-09-22
- Status: Accepted

## Context

The operator has updated the Production CMS, verified private OAuth login through
the existing loopback Mihomo proxy, and published generation 1 to the Worker.
Earlier plans required Production legacy import and old-content URL preservation.
The user now explicitly chooses to start the blog afresh and move only the domain.

## Decision

Keep the existing Production database, identities, new content, assets and
publication history. Do not import old content or Development sample data, add a
Production importer, reset the database or reset generations. The existing
Development importer remains available but is not part of this release.

P0-6 is reduced to domain binding, configuration review, rollback preparation and
new-site acceptance. Old-content URL preservation is not a cutover requirement;
missing old pages may return 404 rather than misleading homepage redirects.
Current CMS route reservations and snapshot safety contracts remain unchanged.
Domain mutation is a separate operator step, not authorized by editing this record.

## Alternatives and consequences

Extending the importer and restoring all old content was rejected as unnecessary
for the user's fresh start. Existing legacy product/visual decisions remain valid.
No schema, runtime, publication or UI change is required. Existing backups remain
private recovery points, not evidence of a successful restore drill. Routine backup
and recovery responsibilities remain, but no migration tooling project is needed
before domain cutover. Record actual acceptance separately from pending checks in
the [Production runbook](../operations/production-runbook.md).
