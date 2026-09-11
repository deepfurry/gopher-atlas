# Architecture decisions

ADRs record accepted decisions, consequences and rejected alternatives. Future
implementation is explicitly distinguished from shipped behavior. Add the next
number for significant changes; supersede an accepted ADR rather than rewriting
history. Routine code choices do not need an ADR.

| ADR                                              | Decision                                                      | Status                             |
| ------------------------------------------------ | ------------------------------------------------------------- | ---------------------------------- |
| [0001](0001-system-architecture.md)              | Static publication / private control plane in one monorepo    | Accepted                           |
| [0002](0002-private-control-plane.md)            | Tailscale-only CMS with loopback process                      | Accepted                           |
| [0003](0003-editorial-workflow.md)               | Drafts, immutable revisions, explicit reviews                 | Accepted; implementation P0-1–P0-3 |
| [0004](0004-r2-published-snapshots.md)           | Immutable R2 snapshots and durable publication jobs           | Accepted; implementation P0-4      |
| [0005](0005-identity-runtime.md)                 | Persistent identity, middleware order and production embed    | Accepted; implemented P0-1         |
| [0006](0006-content-revision-and-route-model.md) | Editorial snapshots, permanent routes and transactional Audit | Accepted; implemented P0-2         |

| [0007](0007-admin-editorial-ux.md) | Server-projected editorial UX, serialized saves and safe preview | Accepted; implemented P0-3 |

| [0008](0008-publication-generation-and-r2-snapshots.md) | Atomic publication outbox, immutable assets/snapshots and build observation | Accepted; implemented P0-4 |

New records should include date, status, context, decision, alternatives,
consequences, and implementation scope.
