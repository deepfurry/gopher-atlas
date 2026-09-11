# 0008 — Publication generation, immutable R2 snapshots and assets

Date: 2026-09-11. Status: Accepted; P0-4 implementation, real staging pending.

P0-2's published pointer must produce a durable, private, reproducible build input
without holding SQLite locks over network calls or exposing mutable Draft/private
identity. This extends ADR 0004 and the publication boundary of ADR 0006; its
editorial states, ownership and immutable review semantics do not change.

## Decision

- Migration 00003 adds assets, cover references, singleton generation and durable
  jobs. Audit rebuild preserves historical rows while extending entity types.
  Down refuses loss of asset/publication Audit. 00001/00002 are untouched.
- Every public-impact business transaction appends Audit, increments generation
  and inserts the job atomically. Job failure rolls back the entire mutation.
  A small outbox helper uses the caller's sqlc transaction, not a Repository layer.
- One in-process worker and one active CMS writer are the P0 deployment model.
  Poll every two seconds; coalesce older actionable jobs to superseded. No lease,
  Redis or distributed coordination. Shutdown cancels/joins before SQLite closes.
- Export uses a deferred WAL read transaction for a single generation and only
  selected immutable published revisions. Close it before R2 and recheck freshness.
  Stable exportedAt is the generation's DB timestamp, so crash/retry produces the
  same bytes/hash. Strict public fields, bounded size, references and graph validation
  fail closed. Unpublishing a target while a Topic still references it deliberately
  blocks export until the Topic is revised or unpublished; no silent dangling links.
- A shared process fence closes check-to-latest-PUT races: public mutators acquire
  it BEFORE beginning SQLite transactions; worker holds it around latest/Hook with
  no DB transaction. Immutable upload happens outside the fence. Slow bounded I/O
  can delay public mutations before BEGIN, but cannot block SQLite with network I/O.
- Immutable snapshot upload precedes latest.json, which precedes Hook POST. Each
  stage checks generation. AWS conditional create prevents same-key overwrite races.
  Hook acceptance and DB completion have an intentional at-least-once crash window.
  Automatic retry delays are 30s, 2m, 10m, 30m, 1h; after six failures manual retry
  is required. Uploaded key/hash survive failures. Human retry is audited.
- SHA-addressed images retain their binary metadata. Header/config validation and
  byte/dimension/pixel limits avoid trusting filenames or multipart MIME. Orphan
  objects after DB failure are acceptable. Soft delete stops new selection and
  preserves published/history URLs. Deleted duplicate uploads require Admin restore.
- Cover changes use the same full-snapshot queue; Revision snapshots preserve them.
  Historical restore may preserve a deleted cover, requiring replacement/removal
  before a later save/submit. There is no separate cover mutation endpoint.
- Web preparation is private Node build work with separate RO credentials or an
  explicit local fixture. It validates pointer/hash/schema/graph before Astro.
  Astro does not import storage config/SDK. Only a public generation marker is added;
  no P0-5 page families, final redirects, content search or SEO are implemented.

## Alternatives and consequences

Calling R2/Hook in business transactions was rejected because it couples SQLite
locks and rollback to unreliable remote I/O. A background goroutine without a
durable job would lose work on restart. Exactly-once Hook and multi-writer leases
add complexity that the one-writer staging model does not need. A simple freshness
check alone leaves a stale mutable-PUT race, hence the explicit shared fence.

R2 snapshots are public projections, not backups. Restoring an old DB against a
newer bucket/marker requires an operator decision; immutable-key hash conflict
fails rather than overwriting remote content. Six failed attempts keep safe error
classification only. Real staging is a separate user-operated verification step.
