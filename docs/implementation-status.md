# Implementation scope

Architecture authority: the supplied **GopherAtlas Platform Rebuild — Codex
Implementation Plan** (2026-09-10), refined by **GopherAtlas P0-1 — CMS Runtime,
Identity, Auth, Logging & Persistence** (2026-09-11). Both were read in full; the
P0-1 scope overrides older main-based development and memory-only CSRF assumptions.

P0-0 began from main at `3aa6aaf` (LICENSE only), implemented the executable
foundation in `40c2709`, then the pnpm 12.3.4 toolchain upgrade landed in `fd77dbe`.
P0-1 began from synchronized dev at `fd77dbe` on `feat/p0-1-cms-runtime-auth`, with a
clean working tree. Existing local `.env` was not inspected or modified.

| Phase           | Actual scope                                                                                                                                                                                                                                                                              |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0-0 (complete) | pnpm workspace, static Astro baseline, Admin/Base UI skeleton, Fiber shell, Markdown safety, OpenAPI/SQL tooling, design/contracts/ADRs, CI and make check                                                                                                                                |
| P0-1 (current)  | Four real identity tables, sqlc, pooled SQLite PRAGMAs, GitHub OAuth and numeric identity, pending/active/disabled users, fixed roles/capabilities, author profiles, persistent hashed sessions/CSRF/state, Zap/Lumberjack/contrib logger and Monitor, readiness, embedded identity Admin |
| P0-2 (deferred) | Content/Draft/Revision, reviews, tags/topics, permanent routes, audit persistence, optimistic concurrency, editorial action APIs and state machine                                                                                                                                        |
| P0-3 (deferred) | Full Admin editor/preview, editorial forms/tables, review/assets/audit/build UX                                                                                                                                                                                                           |
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
