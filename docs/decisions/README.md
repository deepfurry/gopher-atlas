# Architecture decisions

ADRs record accepted decisions, consequences and rejected alternatives. Add the
next number for significant changes; supersede decisions explicitly rather than
silently rewriting history. Routine implementation choices do not need an ADR.

| ADR                                                     | Decision                                                                      | Status                               |
| ------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------ |
| [0001](0001-system-architecture.md)                     | Static publication / private control plane in one monorepo                    | Accepted                             |
| [0002](0002-private-control-plane.md)                   | Tailscale-only CMS with loopback process                                      | Accepted; operational origin updated |
| [0003](0003-editorial-workflow.md)                      | Drafts, immutable revisions and explicit reviews                              | Implemented P0-1–P0-3                |
| [0004](0004-r2-published-snapshots.md)                  | Immutable R2 snapshots and durable jobs                                       | Implemented P0-4                     |
| [0005](0005-identity-runtime.md)                        | Persistent identity, middleware order and Admin embed                         | Implemented P0-1                     |
| [0006](0006-content-revision-and-route-model.md)        | Editorial snapshots, permanent routes and transactional Audit                 | Implemented P0-2                     |
| [0007](0007-admin-editorial-ux.md)                      | Server projections, serialized saves and safe preview                         | Implemented P0-3                     |
| [0008](0008-publication-generation-and-r2-snapshots.md) | Atomic publication outbox, immutable assets/snapshots and build observation   | Implemented P0-4                     |
| [0009](0009-public-static-publication.md)               | Snapshot-only static reader site, derived routes, redirects and Pagefind      | Implemented P0-5                     |
| [0010](0010-admin-editorial-workspace.md)               | Chinese Admin shell, shared Base UI controls and Markdown-first workspace     | Accepted                             |
| [0011](0011-local-live-public-and-draft-preview.md)     | Local snapshot watching, isolated Public restarts and transient Draft preview | Accepted                             |

New records include date, status, context, decision, alternatives, consequences
and implementation scope. Earlier ADR phase boundaries describe their original
increments; later ADRs record the additions.
