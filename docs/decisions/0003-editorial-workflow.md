# 0003 — Mutable drafts and immutable reviewed revisions

Date: 2026-09-10. Status: Accepted; implementation deferred.

Multi-author editing must not mutate public content or publish a different body
from the one reviewed. Separate content identity, versioned mutable Drafts,
immutable Revisions, pending-review pointer and published-revision pointer.
Published state is independent of draft/in_review/changes_requested/synced state.

Submission captures a revision plus tags/topic entries. Review publishes that
exact revision. Restoring history copies into a Draft; it never edits a Revision.
Optimistic concurrency rejects stale saves. Reviewer cannot review own/owned or
byline-authored content; Admin can directly publish. Editors submit their work.
Roles are fixed admin/reviewer/editor, with last-active-Admin protection.

A single mutable content row would allow autosave leakage and ambiguous review.
Dynamic RBAC and collaborative document synchronization are outside P0 scope.

Consequence: schema, transactions, policies and state transitions need dedicated
behavioral tests. P0-1 adds identity/policy foundations, P0-2 adds content/workflow,
P0-3 adds the editorial UX. This ADR does not create tables or action endpoints.
