# Implementation scope

Architecture authority: the supplied **GopherAtlas Platform Rebuild — Codex
Implementation Plan** (2026-09-10), refined by **GopherAtlas P0-1 — CMS Runtime,
Identity, Auth, Logging & Persistence** (2026-09-11). Both were read in full; the
P0-1 scope overrides older main-based development and memory-only CSRF assumptions.
The complete GopherAtlas P0-2 — Content Domain & Editorial Workflow document
(2026-09-11) defines the current domain/API scope and explicitly defers external
publication and full editorial UX.

P0-0 began from main at `3aa6aaf` (LICENSE only), implemented the executable
foundation in `40c2709`, then the pnpm 12.3.4 toolchain upgrade landed in `fd77dbe`.
P0-1 began from synchronized dev at `fd77dbe` on `feat/p0-1-cms-runtime-auth`, with a
clean working tree. Existing local `.env` was not inspected or modified.
P0-2 began from synchronized dev at `956f854` on
`feat/p0-2-editorial-workflow`, also clean. No secret file or unrelated dependency
pin was changed. Migration 00001 is byte-for-byte preserved.

| Phase           | Actual scope                                                                                                                                                                                                                                                                              |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0-0 (complete) | pnpm workspace, static Astro baseline, Admin/Base UI skeleton, Fiber shell, Markdown safety, OpenAPI/SQL tooling, design/contracts/ADRs, CI and make check                                                                                                                                |
| P0-1 (complete) | Four real identity tables, sqlc, pooled SQLite PRAGMAs, GitHub OAuth and numeric identity, pending/active/disabled users, fixed roles/capabilities, author profiles, persistent hashed sessions/CSRF/state, Zap/Lumberjack/contrib logger and Monitor, readiness, embedded identity Admin |
| P0-2 (current)  | Content/Draft/Revision, reviews, tags/topics, permanent routes, audit persistence, optimistic concurrency, editorial action APIs and state machine                                                                                                                                        |
| P0-3 (deferred) | Full Admin editor/preview, editorial forms/tables, Review Workspace and Tag/Audit UX                                                                                                                                                                                                      |
| P0-4 (deferred) | R2 assets, published projection v1, generation/jobs/snapshots, hook/recovery/coalescing                                                                                                                                                                                                   |
| P0-5 (deferred) | Full Public route families, publication design, loader/search/SEO/redirects/build marker and production Wrangler                                                                                                                                                                          |
| P0-6 (deferred) | Legacy import/verification, route preservation, backup/restore drill, deployment and cutover                                                                                                                                                                                              |

P0-1 validation covers migration up/down/rollback, pooled PRAGMAs/FKs, bootstrap,
last-Admin concurrency, state replay/mismatch/expiry, hashed session rotation/
revocation/expiry/restart, Origin/CSRF, role policy, profile safety, API boundaries,
Monitor guard/error/panic metrics, sensitive log omission, identity UI and embed.
`make generate` and `make check` remain authoritative executable gates. Tests use
fake providers and isolated databases; real GitHub OAuth and production deployment
are not claimed verified. Public remains its empty fixture/RSS and three static pages.

Normal work starts from dev and returns via PR to dev. Main contains release
snapshots. Push/PR CI covers both branches on GitHub-hosted Linux, includes the
race gate, and never uses the shared Infra server. No repository default-branch,
Ruleset, production service or Cloudflare setting was changed.

P0-2 tests exercise immutable field/tag/topic snapshots, expected-version atomic
saves, published isolation, exact pending review/self-review rules, direct publish
without approval, permanent route/Note path history, Topic target eligibility,
identity/editorial Audit and rollback/privacy, bounded API visibility and body limits.
Real SQLite races cover save/save, submit/submit, approve/approve, approve/changes,
approve/withdraw, route claim/claim, direct/direct, restore/save and archive/publish.
The same Linux `go test -race -tags=adminembed ./...` command was also run locally
in the existing WSL verification environment with pinned Go 1.26.8.

P0-2 publication stops at SQLite published pointer + route + Audit. No P0-3 editor,
Review Workspace, Tag/Audit UI or P0-4 assets/R2/generation/jobs/snapshot/hook exists.
