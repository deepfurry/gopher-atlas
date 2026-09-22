# Changelog

## Production maintenance commands

- Add `make prod-update` for dependency installation, embedded CMS build, stopped
  SQLite/old-binary backup, atomic installation and bounded health verification.
- Add `make prod-backup` with protected timestamped copies, WAL preservation,
  checksum/completion markers and restoration of the original running state.
- Keep migrations, secrets, restore decisions, backup retention and Cloudflare
  configuration outside these on-demand commands; test failures on an isolated host.

## Development — Local persistent storage

- Normal dev/dev-web now use persistent SQLite and sibling FileStore assets/full
  snapshots. Ignore remote credentials, reject fixture input, and poll local latest.
- Reuse existing Asset/Publication services and durable jobs; local completion does
  not invoke a Hook or remote marker. Production R2/build credentials stay separate.
- Add root-contained immutable file writes and a Development-only loopback image
  route, with explicit Go/TS image policies for Admin, snapshot and Draft Preview.
- Preserve data across shutdown/restart; no automatic migrations, seed or reset.
  The previous Public visuals, motion, breakpoints and locale aliases are unchanged.

## P0-5.5 — Public visual fidelity follow-up

- Restore legacy header subtitle/underline/glow, homepage stagger, page/card rise,
  500 ms button/select transitions and the original responsive layout boundaries.
- Restore compact Article rows, Topic/Note group cards and Note detail shell; retain
  safe Markdown, Shiki/copy, TOC and shared Draft Preview rendering.
- Remove the extra archive action from Article rows and template prose from the
  synthetic Curated fixture; real imported reasons remain verbatim.
- Add semantic English chrome aliases for details/collections and preserve query/
  fragment on switching, without changing canonical routes or duplicate SEO/search.
- Use the requested single-line DeepFurry copyright/contribution/about/search/RSS footer.

## P0-5.5 — Product realignment

- Three product workflows: curated articles, curated-only Topics and grouped Notes;
  Post stays compatible but leaves normal discovery/creation.
- Typed group/recommendation metadata, strict Curated enums and closed snapshot v1;
  no migration or publication architecture replacement.
- Source-only legacy plan and offline service-based Development apply, exact old
  paths/dates/reading order, explicit authors and safe immutable image migration.
- Existing Chinese Admin Shell retained with product-specific lists, source/curation
  forms, Topic drag/keyboard ordering and inferred Note groups.
- Legacy Public logo/hero/tokens/product layouts, safe long-form Markdown reading,
  seven English chrome pages and configurable Note-only giscus.
- Existing live local generation watcher and transient Draft Preview preserved.

## Unreleased

- Watch configured Development publication generations and refresh only Public,
  preserving CMS/Admin; retry transient reads and disable watching for fixtures.
- Add a Development-only Blog preview that flushes Draft autosave and reuses
  Public rendering through a bounded, non-persistent POST. Production excludes it.

- Fix silent Astro development startup failure in Windows terminals by relaying
  detached child output over pipes; retain process-tree cleanup and exit codes.

- Rebuild Admin as a Chinese editorial workspace with collapsible navigation,
  scoped search, account/theme menus, shared Base UI controls and Phosphor icons.
- Redesign content/editor/reviews/assets/tags/people/publication/audit surfaces;
  preserve full-snapshot saves, conflicts, immutable review and backend contracts.
- Stabilize content-table data during lazy navigation, retain cursor ownership,
  and extend shell/control/language/navigation regression and browser checks.

- Improve local startup: dev-web reads root .env, prefers explicit fixtures and
  CONTENT_R2_* with Development-only CMS R2_* fallback, and explains missing latest.
- Add cross-platform make dev supervision for CMS/Admin/Public, including process
  tree cleanup on exit/signal. Keep dev-cms and Production build behavior unchanged.

- Complete P0-5 Public rendering from snapshot v1: four detail families, home and
  statically paginated collections, Note groups, Tags/Authors, safe GFM/Shiki and TOC.
- Add direct bounded Workers redirects, SEO/OG/canonical metadata, real RSS,
  sitemap/robots and lazy Pagefind search with Chinese/English coverage.
- Verify actual fixture build artifacts, reference/order/privacy boundaries and
  search interaction; preserve snapshot v1, migrations, CMS semantics and pins.
- Synchronize Development/Production operations with user-reported systemd,
  Tailscale Serve and main-only Workers Builds. Keep private configuration redacted;
  no real pipeline acceptance, legacy import or DNS cutover is claimed here.

- Implement P0-4 immutable assets/upload/soft deletion, full-snapshot cover and
  image pickers; preserve published Revision covers and historical URLs.
- Add migration 00003, Audit-preserving constraint rebuild, schema-3 readiness,
  atomic publication generation/outbox and strict public snapshot v1 export.
- Add R2 adapters, durable coalescing worker, bounded Hook/retry/recovery,
  Publication status UI, private Web build loader and safe public build marker.
- Verify with fake external dependencies and explicit fixtures; keep migrations
  00001/00002 and existing pins. Direct dev work is authorized for early development.
  Real deployment and P0-5 public content were outside that increment.

- Implement P0-3 feature-based Admin shell, lazy routes, dense content table/editor,
  typed metadata, safe Source/Preview/Split, serialized autosave and explicit conflict
  recovery, navigation guards, immutable review workspace/history and revision restore.
- Add Tags/Authors/Users/Audit interfaces, System/Light/Dark themes and narrow layouts.
  Preserve CMS-only publication wording and the existing Monitor link/runtime.
- Add bounded author/filter/review queries, batched identity labels and server action
  projections; regenerate OpenAPI/sqlc types. Keep migrations 00001/00002 and schema 2.
- Verify preview privacy, autosave/flush/version behavior, immutable API visibility,
  first lazy navigation and production embed. No assets/R2/publication pipeline.

- Implement P0-2 Content/Draft/immutable Revision and Review APIs, typed payloads,
  optimistic version conflicts, atomic relation snapshots, Tags and ordered Topics.
- Add migration 00002 and real sqlc queries, schema-2 readiness, permanent route
  ownership, exact reviewed publication and Admin direct publication/archiving.
- Append safe transactional Audit for editorial and existing identity mutations;
  preserve migration 00001, dependency pins and the P0-1 runtime/identity UI.
- Expand OpenAPI/generated types, centralized object policy, Markdown/body limits,
  keyset pagination and real SQLite concurrency/rollback/isolation tests.
  This P0-2 increment deferred editorial UI to P0-3 and external publication to P0-4.

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
