# 0006 — Editorial snapshots, permanent routes and transactional Audit

Date: 2026-09-11. Status: Accepted; implemented in P0-2.

P0-1 provides identity and a private control plane. P0-2 implements ADR 0003's
domain/API model and refines ADR 0004's publication boundary for this phase:
selecting a CMS published Revision does not rebuild the public site.

Keep one mutable Draft per immutable Content identity. Expected-version writes
replace fields/tags/ordered Topic entries together. Submit or Admin direct publish
creates a numbered immutable Revision and relation snapshot. Reviewed publish
selects exactly the pending Revision; it never reconstructs reviewed material from
Draft. Restoring a Revision only copies into Draft and increments its version.
Editorial state and published selection are independent.

Use the existing modernc four-connection pool and immediate transactions. Services
call sqlc directly, re-resolve the actor after taking the write lock, reload state,
validate, mutate and append Audit before commit. Revision numbering and conflicting
decisions serialize with SQLite writers. Multi-query editorial DTO reads also use
short transactions for consistent fields/relations/pointers; the resulting brief
writer contention is acceptable for this private control plane. No external I/O
occurs in these transactions. Batch queries validate tag/target existence.

The fixed policy remains centralized, now with ownership/byline helpers. Reviewer
cannot review an owned/byline-authored Revision; Admin can bypass. Reviewer access
to other owners is limited to immutable pending material. Editors only access
their own non-archived Content. Featured changes remain Admin-only, including
revision restoration. Tags have explicit persistent slugs and deterministic
lowercased, whitespace-collapsed name uniqueness.

Routes belong permanently to Content identity. A partial unique index enforces
one canonical path; changing slug or Note groupSlug demotes the old canonical and
promotes/inserts the candidate atomically. Prior owned paths may be reclaimed by
the same Content. Redirects resolve identity to current canonical, avoiding chains.
Archive/unpublish never release routes. No Content/Tag hard-delete API is exposed.

Database constraints/triggers reinforce revision/review/relation/Audit immutability
and route ownership. Revision pointers' same-content invariant is maintained by
transactional service operations and tested. Migration 00001 stays immutable;
00002 introduces the domain, and schema-2 readiness remains read-only.

Audit uses typed safe metadata and server-generated request UUID context, never
Fiber context, bodies, comments, payloads or credentials. Existing successful
login/user/profile mutations append inside their original transactions. Failed
Audit insertion rolls those mutations back; Draft save/autosave is deliberately
not audited.

Rejected alternatives: a single mutable published row permits autosave leakage;
approving by Draft version can select different material than the reviewer saw;
mutable or chained redirect targets lose permanent identity ownership; generic
DAO layers obscure transaction boundaries. Triggering R2/Cloudflare here would
skip the durable generation/job design reserved for P0-4.

Consequences: APIs use bounded keyset pages and explicit conflict codes. Real
SQLite tests cover competing saves, submissions, decisions, routes, direct publish,
restoration and archive/publication, plus rollback and snapshot isolation. Admin
keeps P0-1 identity UI; full editorial UX is P0-3. Assets, R2, generation, jobs,
snapshot v1 and deployment hooks remain P0-4; Public still uses the v0 fixture.
