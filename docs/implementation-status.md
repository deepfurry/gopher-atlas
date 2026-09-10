# Implementation scope

Architecture authority for bootstrap: the user-supplied **GopherAtlas Platform
Rebuild — Codex Implementation Plan**, dated 2026-09-10. Read in full before
implementation. Its adopted constraints live in contracts and ADRs; these describe
both current boundaries and clearly marked future commitments.

Baseline audit: `main` at `3aa6aaf` tracked only LICENSE. The initial local `.env`
was preserved; the empty local `.gitignore` was completed. No legacy source or
generator was imported. P0-0 began on `feat/p0-repository-bootstrap` from synced main.

| Phase          | Scope                                                                                                                                                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0-0 (current) | pnpm workspace, static Astro baseline, React/Vite Admin connection preview, Go/Fiber shell, Markdown safety package, OpenAPI client generation, SQL tooling fixtures, contracts/design/ADRs, CI and make check          |
| P0-1           | SQLite pragmas and first business migrations, sqlc persistence, OAuth, pending/active/disabled users, roles/authors, sessions/CSRF, shared Zap/Lumberjack, contrib Zap/Monitor, readiness, embedded Admin, policy layer |
| P0-2           | Content/Draft/Revision schema, reviews, tags/topics, permanent routes, audit, optimistic concurrency, action APIs and state-machine tests                                                                               |
| P0-3           | Admin editor/preview, forms/tables, review and asset UX, people/audit/build views, role-aware actions                                                                                                                   |
| P0-4           | R2 storage, version 1 public schema, generation/jobs, immutable snapshots, latest pointer, deploy hook, recovery/coalescing                                                                                             |
| P0-5           | Full route families and publication design, snapshot loader, article rendering, search UI, structured data, redirects/build marker, production Wrangler setup                                                           |
| P0-6           | Idempotent legacy import/verification, route preservation, backup restore drill, deployment and cutover                                                                                                                 |

Bootstrap RSS is empty, sitemap covers the three static pages, and Pagefind indexes
those pages. There is no search UI, published content, CMS readiness guarantee,
production data migration, authentication, deployment, or branch ruleset change.
`wrangler.jsonc` records only the intended static assets boundary. Workers Builds
must eventually use the root workspace and the same pinned Node version.

After bootstrap, maintainers can configure `main` to require PRs, the `make check`
CI status, block force pushes and prevent deletion. CI runs on GitHub-hosted Linux;
the shared Infra server must not be a self-hosted PR runner.
