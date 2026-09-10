# 0004 — Immutable snapshots and durable publication jobs

Date: 2026-09-10. Status: Accepted; implementation deferred to P0-4.

Astro builds need a stable public-content projection without calling the private
CMS at request time or storing drafts in build inputs. Use private
`gopheratlas-content` R2 objects `snapshots/generation-N.json` and `latest.json`.
Use separate immutable public assets in `gopheratlas-assets`.

Publication transactions change the published pointer, increment generation,
append an audit event and persist a job. After commit, export one consistent
SQLite snapshot, validate it, upload the immutable object, update the pointer,
then trigger the Cloudflare build. Retry/restart recovery and generation coalescing
belong to the durable worker. No R2/hook request may run inside the transaction.

CMS receives bucket-scoped RW S3 credentials. Web builds receive separate
content-only RO credentials. Neither credentials nor private CMS data enter
snapshots/browser code. Previews use published content only.

Direct CMS reads during public requests violate availability. Content Git commits
violate the editorial goal. R2 snapshots are not backups of private state.

Consequence: publication is eventually visible after a successful static build;
generation markers must distinguish live, behind and unknown. P0-0's version 0
empty fixture deliberately rejects all entities rather than prematurely freezing
the production schema. Version 1 and publication correctness tests arrive in P0-4.
