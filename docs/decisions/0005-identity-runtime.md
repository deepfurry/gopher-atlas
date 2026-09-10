# 0005 — Persistent identity and explicit production Admin embed

Date: 2026-09-11. Status: Accepted; implemented in P0-1.

The P0-0 shell needs browser-safe identity, restart-safe sessions, and a single
production process before editorial work begins. The supplied P0-1 implementation
document supersedes the parent plan's main-based development and memory-only CSRF
assumptions. Daily branches now target dev; main is a release snapshot.

Use four pooled modernc SQLite connections, each initialized by DSN PRAGMAs.
Write transactions begin immediate before checking bootstrap/last-Admin conditions,
and reauthorize the acting session inside the transaction. This avoids deferred
read-to-write races without a generic repository layer or disabling pooling.
SQLite writer serialization is acceptable for this private, low-volume control plane.

GitHub numeric IDs identify users; author slugs use that numeric ID and are immutable
until route-history semantics exist. Unknown identities wait for Admin approval.
Only the matching configured ID may bootstrap when no active Admin exists, and
disabled users are never implicitly revived. Provider tokens are discarded.

Persist one-way state/session/CSRF hashes. A short-lived cookie binds OAuth state
to its initiating browser; conditional consumption rejects replay. A readable,
host-only CSRF cookie supports refresh and multiple tabs. Mutations verify exact
configured Origin, cookie/header equality and the stored hash. LocalStorage and
in-memory-only sessions were rejected because they weaken lifecycle guarantees.

Keep one shared Zap logger and one app-wide contrib Monitor. Mount the Monitor's
active-Admin guard before it and Recover after it. Access logging records only
safe response fields and a server-generated request ID; raw error strings and
query-bearing URL fields are excluded. Tests pin actual error/panic semantics.

Production Go builds use an explicit adminembed tag after a fresh Vite build.
Missing assets fail compilation. Plain Go tooling uses a development variant with
SPA unavailable, preserving clean-checkout checks without committing generated
assets or silently shipping a placeholder. The production binary needs no Node.

Go profile bio validation uses Goldmark/GFM against the shared Markdown safety
fixtures; a JS subprocess at runtime was rejected because it would break the single
binary runtime. This is only biography validation, not a content/editor workflow.

No content/Draft/Revision, taxonomy, audit persistence, R2, publish jobs or importer
is introduced by this decision. Production installation/cutover remains unperformed.
