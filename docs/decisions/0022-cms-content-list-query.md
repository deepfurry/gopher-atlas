# ADR 0022 — Server-side CMS list queries

- Date: 2026-10-26
- Status: Accepted

The three editorial lists filter the authorized visible dataset before a bounded
100-row page. Default order is `updated_at DESC, id DESC`; oldest-update order
reverses both keys. Public recommendation, Topic ordering and Note group ordering
are independent and unchanged. No migration or content rewrite is needed.

Content adds `cursor` / `nextPageCursor`, encoding the last update time and ID plus
a hash of the actor/role, archive flag, filters and sorting. These are positions,
not credentials. Every page reauthorizes and reapplies visibility. Reusing a cursor
with different filters is rejected. This is a live keyset list, not an immutable
database snapshot: newly updated rows may move before the current boundary; refresh
to see them. Unlike a numeric anchor, a value cursor is not moved by editing its row.

The legacy numeric `after` / `nextCursor` pair remains available for callers,
resolving an authorized row ID to its current sort tuple. Existing query parameters
and response fields remain; clients should use the new pair for stable navigation.
Other list endpoints keep their existing numeric ordering. CMS and generated Admin
should be released together; no old cursor should be persisted across a release.

Admin/owners filter Draft fields/relations; other-owner Reviewers filter exact
pending Revision fields/relations. Chinese/English titles, summaries and Slug are
searchable only in that visible version. Inverse Topic membership matches the
existing product projection: Admin uses Topic Drafts, other roles use published
Topics. A separate bounded label-only Topic filter query gives those roles public
choices without granting access to someone else's Draft or Content detail.

URL query parameters own toolbar state and browser history. Query keys include all
server filters; each changed query starts without the previous cursor. Choices use
bounded server searches, never a download of all Content. Local loaded-row product
filtering/sorting is removed. Tests cover each type beyond 100 rows, timestamp ties,
changed anchors/filters, search, permissions and URL/page state.
