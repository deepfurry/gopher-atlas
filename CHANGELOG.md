# Changelog

## CMS list management (2026-10-26)

- Filter authorized content on the server before updated-time keyset pagination;
  include visible bilingual titles, summaries and Slug in search.
- Unify compact type-specific filters, URL/history restoration and loading states;
  preserve Reviewers' immutable projections and existing selector callers.

## Statistics chart polish (2026-10-21)

- Replace native SVG hover titles with accessible ARIA names/descriptions while
  retaining the shared custom Tooltip, keyboard and touch controller.
- Use the full plot width for one to three archived days, with values, light
  stems and one date row; keep the selected window and coverage explicit.
- Align plot geometry and scales; preserve zero readings, missing-day breaks,
  sampling semantics and the static cumulative chart/data table.

## Editorial localization (2026-10-21)

- Version Chinese and explicitly enabled English Curated/Topic text together in
  one Draft/Revision, with independent Markdown columns and shared source/order.
- Preserve the vertical writing workspace, mounted per-language editors, Focus,
  image capture and the full-snapshot save queue; widen source/order modules.
- Add closed Snapshot v3, retain v1/v2 readers and Note routes, and distinguish
  real English details from noindex unavailable notices in SEO/search/indexes.
- Add additive Schema 5 and an explicit offline activation with a fresh generation;
  Production upgrade and protected real-backup rehearsal remain operator gates.

## Public release preparation (2026-10-19)

- Prepare the existing Worker and real statistics D1 binding with reads, sync and
  Cron disabled; preserve static asset, Snapshot and redirect publication.
- Add PNG/ICO icons, a static default OG image and complete bilingual social
  metadata, plus security.txt and a concise public-link llms.txt.
- Share Note, Curated and Topic pages through four platform intents and the
  existing Clipboard/Toast, with quiet theme-aware circular controls.
- No production migration, secret configuration, activation or deployment is
  performed by this preparation.

## Asset pagination (2026-10-18)

- List assets newest first by ID in pages of at most 20, with exact next-page
  detection and shared previous/next navigation in management and image pickers.
- Restart at the first page after upload and refresh cursor boundaries after
  deletion/restoration; preserve deduplicated IDs and historical image URLs.

## Markdown mathematics (2026-10-18)

- Share inline and display math between Admin preview and Public with local
  KaTeX assets; Public renders HTML and MathML at build time.
- Preserve Markdown and Go safety validation, code fences and ordinary currency;
  bound TeX expansion and show readable fallback for malformed formulas.

## B2 taxonomy authority and Snapshot v2 writer (2026-10-17)

- Add schema 4 with independent Note groups, English tag translations and protected
  Audit migration; preserve migrations 1–3 and immutable content/history/routes.
- Add explicit read-only plan, fingerprint-checked offline apply and local export;
  reject conflicts, prevent partial startup and allocate a fresh v2 generation.
- Add Chinese Admin group management, optional English metadata, permanent slugs,
  server-paged taxonomy search and select-only Note grouping with comment warning.
- Export only v2 while retaining B1 v1/v2 reading and A/A2 editor behavior. Production
  backup/copy rehearsal, migration and deployment remain separate operator gates.

## B1 Public Snapshot v1/v2 compatibility (2026-10-17)

- Preserve the v1 schema/fixture and CMS exporter; add a closed v2 consumer with
  strict version, hash and taxonomy-reference checks.
- Normalize both inputs once and localize tag/group metadata with per-field
  Chinese fallback, preserving content identities, authored text and routes.
- Exercise both synthetic fixture builds with the shared static artifact/privacy
  gate. B1 deployment/verification is a prerequisite for later B2 Production work.

## A2 writing workspace and focus mode (2026-10-17)

- Stack full-width writing above content properties for all editable types;
  preserve independent revision/review layouts and metadata field order.
- Add viewport focus on the same UIW instance, with the existing queue's status,
  dialog-first Escape, keyboard containment and cleanup of background isolation.
- Preserve A-stage selection insertion, stale-capture guards, native Undo and
  full-snapshot autosave; view changes never save or persist a Draft.

## CMS interaction fixes A (2026-10-17)

- Give input-like Admin controls one continuous focus edge while retaining
  keyboard indicators on other controls and error/read-only/disabled states.
- Insert asset Markdown at the captured source selection through UIW, retaining
  native undo where supported and rejecting stale body/mode/session captures.
- Keep tag rows in API ID order across save refreshes, preserving the viewport,
  loaded-page search/pagination and the visible 100-tag selection limit.
- Open the permission-controlled Monitor link in an isolated new tab.

## Public legal notices and code license (2026-10-13)

- Add bilingual static Legal pages and one localized Footer link, describing
  code/content/asset rights and the actual search, preference and comment behavior.
- Adopt BSD-3-Clause for project-owned code while retaining historical MIT and
  third-party MIT/OFL notices; record the provenance review and scope in ADR 0017.
- Identify Wallhaven as the homepage image's listing source only; creator and
  public-site permission remain unverified and outside the code license.
- Refresh README's Public design guidance to the current Modern Geek Editorial UI.

## Public layout and interaction refinement (2026-10-13)

- Tighten advanced filter spacing and align Topic reading headers; give Featured
  a full-width number column and stack it on mobile.
- Stabilize Note group paging with measured per-group height and opacity-only motion.
- Scope GitHub corners to text and add matching theme/locale focus feedback.
- Reveal theme changes with an optional native circle, preserving navigation fades,
  reduced motion, interruption recovery and preference/Giscus synchronization.
- Credit DeepFurry & LibreCosta with build-time copyright year ranges.

## Public Hero polish (2026-10-13)

- Freeze the approved Chinese Hero copy and prevent background-image dragging.
- Remove only the noninteractive main skip target's page-sized focus outline.
- Stage homepage sibling entrances over 1.2 seconds, pause the subtle scroll-arrow
  pulse offscreen, and add rounded corner feedback to primary links and Hero CTAs.

## Public interaction polish (2026-10-13)

- Replace Back to Top with a square progress ScrollDock and proportional upward
  scrolling; hide document scrollbar chrome and refine internal scrollbars.
- Standardize single-edge input/Select focus without removing keyboard indicators.
- Add cancellable Motion mini feedback for filtering, paging, search, Select and
  ScrollDock; use optional native document crossfades with reduced-motion support.

## Public editorial redesign (2026-10-13)

- Redesign all Public surfaces with IBM Plex, static Phosphor SVGs, a supplied
  AVIF Hero and original Notes first. Preserve published data, routes and safety.
- Adopt StyleX external style modules and restrained Motion mini; remove unused
  Public Tailwind/React integration and legacy compass/font assets.
- Upgrade Public to Astro 7.3.8 while retaining unified Markdown and static output.
- Keep full Curated filter/search semantics and editorial links; render Topic
  reading lists once; move Note group navigation to the heading and reading end.
- Update Public design contracts and ADR 0016; Admin and CMS are unchanged.

## Public comments configuration

- Enable Note giscus with the operator-provided public Blog Comments category ID;
  retain stable per-Note terms, strict matching, reactions, lazy loading and themes.
- Record the operator-confirmed apex-domain marker/hash, www redirect and Note
  page/image acceptance; real comment submission remains to be verified.

## Verified Production operations (2026-09-22)

- Document operator-verified CMS update/backup, systemd Mihomo proxy setup,
  generation 1 publication sync and Worker homepage acceptance.
- Separate unverified restore/detail/hash checks from confirmed evidence.
- Record the fresh-start decision: no Production legacy import; retain existing
  Production data and limit the next phase to domain cutover and site acceptance.

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
