# Changelog

## Unreleased

- Implement P0-2 Content/Draft/immutable Revision and Review APIs, typed payloads,
  optimistic version conflicts, atomic relation snapshots, Tags and ordered Topics.
- Add migration 00002 and real sqlc queries, schema-2 readiness, permanent route
  ownership, exact reviewed publication and Admin direct publication/archiving.
- Append safe transactional Audit for editorial and existing identity mutations;
  preserve migration 00001, dependency pins and the P0-1 runtime/identity UI.
- Expand OpenAPI/generated types, centralized object policy, Markdown/body limits,
  keyset pagination and real SQLite concurrency/rollback/isolation tests.
  Full editorial UI remains P0-3; assets/R2/jobs/snapshots/hooks remain P0-4.

- Implement P0-1 identity persistence with real goose/sqlc inputs, pooled SQLite
  PRAGMAs, transactional bootstrap/last-Admin protection, browser-bound one-time
  GitHub OAuth state, hashed persistent sessions and cookie/header/Origin CSRF.
- Add centralized capabilities, identity/user/profile OpenAPI endpoints and Admin
  login/pending/profile/approval UI, plus generated API types and production Go embed.
- Wire shared Zap/Lumberjack and contrib access logging without OAuth queries;
  protect the app-wide Monitor before Recover and add schema-aware readiness.
- Adopt dev for daily integration and main for release snapshots; CI covers both
  and retains the Linux race gate. P0-1 stopped before content/editorial/R2/deployment.

- Pin pnpm 12.3.4 and migrate install policies to the supported workspace settings,
  preserving exact saves, strict engine checks, the existing zero release-age policy,
  and the esbuild/sharp build allowlist without updating application dependencies.
  Update the pnpm setup action for native pnpm 12 support.

- Bootstrap the GopherAtlas platform monorepo with pnpm, Astro Public, React/Vite
  Admin and a loopback-only Go/Fiber v3 CMS shell.
- Add shared Markdown validation, generated OpenAPI client types, disposable
  sqlc/goose validation, design contracts, agent context and initial ADRs.
- Establish pinned dependencies, CI and the repository-wide `make check` gate.
