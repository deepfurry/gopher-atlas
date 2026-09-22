# Implementation scope

Current operator decision (2026-09-22): Production generation 1 is synced and the
Worker homepage is accessible. The blog starts afresh; no Production legacy import
is planned. P0-6 covers domain cutover and new-site acceptance only (ADR 0015); the operator
has since confirmed apex/WWW cutover and Note detail/image access.
See [Production runbook](operations/production-runbook.md) for verified commands;
earlier phase evidence below retains its historical scope.

Architecture authority: the supplied **GopherAtlas Platform Rebuild — Codex
Implementation Plan** (2026-09-10), refined by **GopherAtlas P0-1 — CMS Runtime,
Identity, Auth, Logging & Persistence** (2026-09-11). Both were read in full; the
P0-1 scope overrides older main-based development and memory-only CSRF assumptions.
The complete GopherAtlas P0-2 — Content Domain & Editorial Workflow document
(2026-09-11) defines the adopted domain/API. The complete P0-3 — Admin Editorial
UX document (2026-09-11) defines the current interface scope: narrow read/API
enhancements, no migration, and no external publication. The complete P0-4 Assets
& Publication Pipeline document (2026-09-11) defines the publication boundary.
The complete P0-5 Full Public Astro Site document (2026-09-11) defines the current
reader-site scope and Development/Production operations model.
The complete P0-5.5 Product Realignment & Legacy-Ready Rebuild document
(2026-09-12) supersedes the product scope while preserving the CMS architecture.

P0-0 began from main at `3aa6aaf` (LICENSE only), implemented the executable
foundation in `40c2709`, then the pnpm 12.3.4 toolchain upgrade landed in `fd77dbe`.
P0-1 began from synchronized dev at `fd77dbe` on `feat/p0-1-cms-runtime-auth`, with a
clean working tree. Existing local `.env` was not inspected or modified.
P0-2 began from synchronized dev at `956f854` on
`feat/p0-2-editorial-workflow`, also clean. No secret file or unrelated dependency
pin was changed. Migration 00001 is byte-for-byte preserved.
P0-3 began from synchronized dev at `9784819` on
`feat/p0-3-admin-editorial-ux`, with a clean tree. Only required Admin dependencies
were added; existing toolchain/application pins remain unchanged. Both migrations
are preserved and SchemaVersion remains 2.

| Phase               | Actual scope                                                                                                                                                                                                                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0-0 (complete)     | pnpm workspace, static Astro baseline, Admin/Base UI skeleton, Fiber shell, Markdown safety, OpenAPI/SQL tooling, design/contracts/ADRs, CI and make check                                                                                                                                |
| P0-1 (complete)     | Four real identity tables, sqlc, pooled SQLite PRAGMAs, GitHub OAuth and numeric identity, pending/active/disabled users, fixed roles/capabilities, author profiles, persistent hashed sessions/CSRF/state, Zap/Lumberjack/contrib logger and Monitor, readiness, embedded identity Admin |
| P0-2 (complete)     | Content/Draft/Revision, reviews, tags/topics, permanent routes, audit persistence, optimistic concurrency, editorial action APIs and state machine                                                                                                                                        |
| P0-3 (complete)     | Feature-based Admin, safe Markdown editor/preview, autosave/conflicts, immutable Review Workspace/History, typed forms/Tags/Topics, Authors/Users/Audit/Monitor, server projections                                                                                                       |
| P0-4 (complete)     | R2 assets, published projection v1, generation/jobs/snapshots, hook/recovery/coalescing                                                                                                                                                                                                   |
| P0-5 (complete)     | Full Public route families, publication design, search/SEO/redirects; cutover stays P0-6                                                                                                                                                                                                  |
| P0-5.5 (acceptance) | Product alignment, Development Legacy importer, existing Admin Shell with three product lines, legacy Public identity, Markdown/giscus/chrome i18n; human visual signoff and operator mappings remain                                                                                     |
| P0-6 (acceptance)   | Fresh-start domain cutover and new-site acceptance; no Production legacy import (ADR 0015)                                                                                                                                                                                                |

P0-1 validation covers migration up/down/rollback, pooled PRAGMAs/FKs, bootstrap,
last-Admin concurrency, state replay/mismatch/expiry, hashed session rotation/
revocation/expiry/restart, Origin/CSRF, role policy, profile safety, API boundaries,
Monitor guard/error/panic metrics, sensitive log omission, identity UI and embed.
`make generate` and `make check` remain authoritative executable gates. Tests use
fake providers and isolated databases; real GitHub OAuth and production deployment
were not verified by those tests. Subsequent user-reported Production evidence is
recorded separately below. Public now renders snapshot v1 through P0-5.

Early centralized work now commits directly to dev by explicit user request. Main contains release
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

At completion of P0-3, publication stopped at SQLite published pointer + route + Audit. At that stage no
assets, cover_asset_id, R2, site_state, generation, publication_jobs, snapshot v1,
latest.json, Deploy Hook, public Astro content or legacy import was implemented.

P0-3 validation adds queue debounce/coalescing/version tests, full editor/submit/
conflict/navigation/revision tests, immutable review and permission tests, safe
preview DOM checks, query/filter/author privacy tests, schema-file hash guards and
a build-graph guard against raw HTML preview and forbidden editor dependencies.

Browser verification used the production embedded Admin and real SQLite with an
isolated local OAuth Provider and fixture identities. It covered Admin login and
user approvals, Editor Post creation, Source/Preview/Split, autosave/Tags, a real
two-tab 409 with explicit recovery, submit/request-changes/resubmit/reviewed
publish, next-Draft published isolation, revision restore, Admin direct publish,
Topic ordering/target rejection, author profile update, Audit and Monitor.
Desktop and 360px Light/Dark layouts were inspected. The available browser surface
does not expose reduced-motion emulation; the CSS override and persistence/focus
boundaries are checked by the executable suite. Real GitHub credentials were not used.

Final P0-3 verification (2026-09-11): `pnpm install --frozen-lockfile`,
`make generate`, and full `make check` passed, including 83 Vitest tests, Go
tests/vet/staticcheck, OpenAPI lint and generation drift, migration tooling,
Public/Admin builds and embedded SPA/chunk checks. Linux
`go test -race -tags=adminembed ./...` passed in the existing WSL environment
with pinned Go 1.26.8. A separate production build with synthetic process-env
credentials verified that all 44 Admin/dist and embedded output files contain
neither the injected markers nor `.env` files. No real secrets were inspected.

## P0-4 implementation

Started directly on clean synchronized dev at
`ee6f803a7ebc03de4ad3137140326aef7f9f552a`, per the user's explicit early-development
workflow. No feature branch or main update. The supplied P0-4 plan was read before
implementation; current code/schema remain the source of truth.

Migration 00003 adds immutable assets, cover references, site_state and durable
publication_jobs, safely rebuilds Audit and requires schema 3. Existing migrations
are preserved. Public business mutation/Audit/generation/job is atomic; snapshot
v1 exports only selected published Revisions and referenced public entities.
One durable worker coalesces, uploads immutable snapshot, writes latest, triggers
Hook and recovers/retries. A shared pre-transaction fence closes latest PUT races.

Admin has Assets, cover/image pickers and Publication status/retry. At the P0-4 boundary Web had only
private build loading/validation and a generation marker; full P0-5 content routes,
final redirect output, search/SEO/RSS content and P0-6 importer remain deferred.
Only required AWS SDK and pure Go WebP dependencies were added; existing pins
were not intentionally upgraded. Tests use synthetic fixtures, memory storage and
loopback HTTP, not local secrets or real external deployment. Final executable
verification results are recorded after the completion gate.

P0-4 final verification (2026-09-11): pnpm 12.3.4 and frozen install passed;
`make generate` and full `make check` passed (95 Vitest tests, Go tests/vet/
staticcheck, SQL migration tooling, OpenAPI and generation drift, Public/Admin
builds, embedded SPA/chunks and binary). Final Linux
`go test -race -tags=adminembed ./...` passed in the existing WSL environment with
pinned Go 1.26.8. The gate's synthetic secret-output scan passed for Public,
Admin and embedded output; source credential-signature and environment-file
checks passed. Existing dependency pins and migrations 00001/00002 are preserved.

Browser checks used an isolated fake OAuth provider, real temporary SQLite,
in-memory object storage and loopback fake Hook/marker. Verified upload/dedupe,
soft delete/restore, cover selection, required-alt Markdown insertion, autosave
flush before direct publication, generation/job completion and matching fake
marker. Desktop Light/Dark and 360px layouts were inspected. A local service
worker supplied fixture image bytes, so thumbnails did not contact real R2.
The real SQLite export also passed the Web schema/graph validator. Reduced-motion
and privacy behavior remain covered by tests; no real deployment was performed by those tests.

Preview processes/tabs were closed and their listening ports released. Automatic
approval review rejected cleanup of the ignored `.cache/p0-4-preview` directory
with “blocked by policy”; it remains local and is excluded from the commit.
No real secrets, R2 writes, Deploy Hook calls, Cloudflare dashboard changes or
production DNS changes were used during P0-4 implementation. Subsequent manual
Production installation is recorded below, separately from local test evidence.

## Production facts and P0-5 preflight (2026-09-11)

User-reported manual evidence: Production SQLite was migrated from empty through
00001–00003; the embedded binary runs under gopheratlas-cms.service, listens only
on 127.0.0.1:46217, and returns 200 for healthz/readyz. Tailscale Serve HTTPS,
GitHub OAuth login and a real upload/read via assets.gopheratlas.com succeeded.
Worker gopheratlas-web builds main only; non-production builds are disabled.
Content R2 is private, Web Build has separate RO credentials, and CMS has RW
credentials and the Production Hook. No first real end-to-end generation →
snapshot → Hook → build marker acceptance is claimed.

Development (dev, fixtures/fakes) and Production (main) are the only environments.
See operations docs for /srv/gopheratlas and the redacted private HTTPS example.
P0-5 starts from clean synchronized dev at
`50fcfd04a3c3b21c9534a506e119e6182e232a11`; origin/main currently has the same code.
The complete supplied P0-5 plan, live repository contracts/ADRs and Web scripts
were audited. Snapshot v1 is sufficient; no DB or CMS semantic changes are needed.

## P0-5 implementation and verification (2026-09-12)

Full static Public publication is implemented: Post/Note/Curated/Topic detail
routes, home, collections, Note groups, Tags/Authors, source-owned information
pages and search/404. Canonical paths use the snapshot value; derived pages are
strictly indexed, conflict checked and statically paginated. Markdown uses shared
validation and the existing Astro/Shiki renderer; controlled images are rendered
without build-time fetch. No public request depends on CMS/SQLite/private APIs.

The single Web build generates direct 301 history rules with platform-limit
guards, SEO/OG/canonical metadata, RSS (three non-Topic types), sitemap, robots,
Pagefind and the unchanged exact-input generation marker. A single Chinese
segmentation index also finds English terms; only search loads browser code.
ADR 0009 records these choices and the P0-6 boundary.

No dependency pin, migration 00001–00003, sqlc query/output, snapshot schema or CMS
publication code changed. OpenAPI changes only replace an obsolete deployment
example with same-origin and correct the previously stale publication description;
the generated client description is synchronized, with no endpoint/DTO change.

Verification: frozen pnpm install and make generate passed; make check passed,
including Go analysis/tests/build, shared/Admin/Public tests, OpenAPI/generation
drift, isolated goose/sqlc tooling, fresh Admin embed and synthetic secret scans.
Linux go test -race -tags=adminembed ./... passed in the existing WSL environment
with pinned Go 1.26.8. The explicit core fixture build and actual dist gate passed:
six content details, 21 canonical HTML pages plus 404, two direct redirects,
five RSS items, sitemap, eight indexed Pagefind pages and matching marker hash.
A child-process test also proves the real Web build fails without explicit input
even if an older generated snapshot is present. All validation is local/secret-free.

Browser verification used the built dist behind a loopback fixture-only server.
Checked desktop Light/Dark, 360px Light/Dark, four content subtypes, 736px reading
width, TOC/code/table rendering, ordered Notes/Topics, Authors/Tags, Chinese and
English search, no-result state, Enter submission and Tab → skip link → content.
No page-level horizontal overflow was observed. The browser does not expose OS
media emulation: the local preview enabled the existing dark/reduced-motion CSS
rules and confirmed the expected colors/zero-duration transition in computed style.
Synthetic local image responses replaced fixture asset URLs and CSP blocked
external image/data requests. No Production endpoint was used. Local redirect
verification returned 301 directly to the current canonical path; real Cloudflare
redirect acceptance is not claimed.

Historical P0-5 plan (superseded by ADR 0015): legacy content/route inventory and import, preservation and
redirect-overflow verification, Production backup/restore drill, first imported
generation acceptance, Worker verification with imported content, explicit DNS
cutover, post-cutover checks and legacy-site retirement decision. No such action
was executed by P0-5, and main remains unchanged.

## Local development startup refinement (2026-09-12)

dev-web now loads optional root .env with process precedence. An explicit fixture
wins; only Development permits missing CONTENT_R2_* fields to fall back to CMS
R2_* fields. Missing latest.json has a specific safe message. Production build
input/RO credential rules and dev-cms are unchanged. The new make dev prepares
the input, builds an unembedded CMS and supervises CMS/Admin/Public together;
any exit or interrupt cleans the remaining process trees. No automatic migration.

Configuration/fixture/error/privacy regression tests and real Windows descendant
listener cleanup passed in make check. The same synthetic process fixtures passed
five Linux Node 24.15.0 cleanup scenarios, including real SIGTERM and bounded force
termination. Linux Go race also passed. No real root .env, R2/Hook or Production
service was used for these implementation checks; no dependency pins changed.

## Admin workspace redesign (2026-09-12)

Started on clean synchronized dev at
`57282816a13c900873aaee86418fe9565dceb488`. The GoFurry Admin shell/control reference
was audited at `9f47e2bb965e094beb50cd3419564536b13d36d7`; its business code was not
copied. ADR 0010 records the Chinese-only design and presentation boundaries.

The shell now has grouped permission-aware navigation, persistent collapse,
mobile drawer, breadcrumbs, bounded content/page search, create, theme and account
menus. Phosphor 2.1.10 replaces Admin Lucide; existing dependency pins are unchanged.
Shared Base UI controls and layered CSS replace scattered native controls and
the monolithic stylesheet. The Markdown-first editor has a grouped inspector and
separate history; content, reviews, assets, tags, people, publication and audit
pages have consistent layouts, states and Chinese terminology.

No backend, API, migrations, sqlc, snapshot, publication semantics or Public code
changed. Full-snapshot autosave and immutable history remain intact. Search and
summaries use existing bounded endpoints with honest scope labels. Only theme and
sidebar preferences persist; an executable boundary still forbids Draft storage.
Stable table data/cursor ownership fixes a browser-observed lazy-navigation loop.
Search debounce is independent of Markdown rendering so the shell does not load
the preview solely to search.

Browser acceptance uses real `make dev`, isolated schema-3 SQLite and synthetic
local identities/assets. R2/Hook/marker are loopback fakes; controlled image URLs
are intercepted locally. No production DB, credentials, GitHub login or external
deployment is used. Checked create/save/cover/tags, source/preview/split and unsafe
image blocking, request-changes/resubmit/exact reviewed publish, direct publish,
history/restore and published isolation, Topic ordering, asset upload/dedupe/
delete/restore, user approval, profiles, publication details, audit and Monitor.
A real two-tab 409 retained local Markdown, paused retries, and required explicit
reload; navigation confirmation and copy feedback were verified.

Light/dark, expanded/collapsed navigation, 1920/1440 px desktop, 1024/768 px table
layouts and 360 px editor/drawer/dialog layouts were inspected. No page-level
horizontal overflow was observed; tables scroll within their own region.
Calendar keyboard navigation and focus were checked. The browser surface does
not provide OS reduced-motion emulation; the CSS override remains tested.
P0-6 migration/cutover and Public language work remain separate.

Verification passed: `pnpm install --frozen-lockfile`, `make generate`,
`make check` (131 JavaScript tests passed, one existing platform-gated skip;
66 Admin tests), `make build-cms`, and the full
`go test -race -tags=adminembed ./...` gate on Linux through WSL. Generated
artifacts have no drift. The synthetic secret-output scan passed. After stopping
Vite/Astro, the browser also loaded the final Go-embedded Admin and its lazy
editor chunk successfully. Login, account logout, empty/error states and failed
publication retry were checked against the isolated local services. No backend,
Public or existing dependency versions changed; only the Admin icon dependency
was replaced. The build still reports a large main JavaScript chunk (about
718 kB before compression); it is not a functional failure and remains a future
performance refinement.

## Live local publication and Draft preview (2026-09-12)

Started from clean synchronized dev at
`16a184f2485e839a4aae44a2e47649d63ad29e57`. ADR 0011 adds a Development-only
two-second snapshot watcher. It reuses configured R2 values, validates changed
generations with the existing loader, and performs named Public-only restarts.
Unchanged generations do not download/restart; read errors retry; explicit
fixtures disable watching. Empty latest starts an explicitly empty local site.
Production input, migrations, APIs and publication semantics are unchanged.

The Admin's Development-only Blog preview flushes autosave, reads the authorized
saved Draft and posts only a presentation projection to an injected Astro dev
route. It reuses ContentDetail/Layout/Markdown, has no preview persistence or
external I/O, and is excluded from Production artifacts. Same-Public-origin
resubmission keeps previews usable through Astro hot reload; new Draft changes
are selected by clicking preview again. GET URLs are not shareable previews.

Windows browser acceptance ran real `make dev` against disposable schema-3 SQLite
and loopback S3/Hook/marker substitutes. A test-only file-read override supplied a
synthetic root environment without reading/changing the real `.env`. Publishing
from Admin advanced generation 3 to 4; the open 4321 article list automatically
refreshed and the new route rendered. CMS/Admin PIDs stayed unchanged while only
Astro's PID changed. A subsequent Draft edit appeared in Blog preview while the
published page remained on its immutable version; generation/job counts stayed
at 4. Template hot reload also re-rendered the preview with HTTP 200. Ctrl+C
released all three service ports. No production credentials/services were used.

Final `make check` passed: 149 JavaScript tests passed, one platform-specific
skip, generated artifacts aligned, Public fixture build and embedded CMS build
passed. Production output scanning rejects the development preview route/module
markers as well as synthetic secrets. The full Linux
`go test -race -tags=adminembed ./...` gate passed through WSL. A separate real
Linux process-tree test confirmed that only Public restarts and all descendants
are cleaned on interruption. Dependencies, migrations, sqlc, OpenAPI and CMS
publication code have no changes.

## P0-5.5 implementation evidence

Started on clean synchronized dev at `2429f4058ab520aa8e40c2e13279c81e904c6946`.
The complete supplied P0-5.5 plan and real legacy checkout were audited first.
Legacy source HEAD: `e1a623b20389422421a7d808134ee093b28b491d`.

Phase 1 adds typed payload constraints, curated-only Topics, shared Note group
validation, safe legacy date restoration and the plan/apply importer. Migrations
00001–00003 and schema 3 stay unchanged. Phase 2 keeps the Shell and restructures
three product tables/forms. A narrow optional list metadata projection preserves
reviewer pending-Revision visibility. Phase 3 restores legacy Public identity and
product interactions. Phase 4 adds the shared reading UI, seven English chrome
pages and configurable Note-only giscus. Phase 5 has real-source Development
rehearsal and static/browser evidence. Phase 6 is ready for human A-grade visual
acceptance; that signoff and a mapped daily-Development R2 apply are not implied
by passing automated checks.

A disposable Development rehearsal imported all 35 real legacy documents, 118 tags
and three images, producing generation 35. Actual COS image bytes were downloaded,
validated and hashed, then stored through the normal Asset service using a local
storage substitute. This is not a real R2 upload. The normal CMS worker and watcher
were exercised against local S3/Hook substitutes, with no Production deployment.
An existing local Author was inspected read-only for the requested real apply;
final author mapping and target DB remain an explicit operator choice. A separate
fresh disposable DB also passed the actual CLI plan/apply path, using the AWS S3
adapter against a local S3 substitute: 118 tags, three assets, 35 content items and
generation 35. Re-planning reported zero errors and zero warnings. The existing
daily Development DB and root .env were not modified.

The source plan records 126 existing Topic/Note/Tag routes and 27 new Curated archive
routes, 27 Topic entries and 11 recommendations. Public fixture dist verification
covers 28 canonical pages, RSS/sitemap/redirects/Pagefind/marker and privacy. The
full Legacy build additionally checks every planned route, exact dates, external
source links, all Topic entries/recommendation boundaries, migrated image URLs,
Note group names/descriptions, Pagefind and the generation/hash marker. Run it with
`node scripts/check-legacy-public.mjs <plan.json> <exported-snapshot.json>` after an
explicit `CONTENT_SNAPSHOT_FILE` Web build of that same snapshot.

Windows browser verification ran real `make dev` with synthetic config and real
legacy content in the disposable DB. Curated metadata/rating controls, Topic
keyboard ordering and updated Draft Preview, Note group/form/long-body preview,
English chrome, legacy filter query compatibility, light/dark and 360 px Public
layouts were inspected. A Note Draft change appeared in preview while generation
remained 35. Direct publish then advanced to 36; the normal worker completed and
Public refreshed automatically while CMS/Admin kept running. The prototype image
objects stayed in local fake storage; public-domain R2 image delivery and actual
giscus Discussions require the operator's configuration, not a claimed browser pass.

`pnpm install --frozen-lockfile`, `make generate` and full `make check` passed,
including 166 JavaScript tests (one existing platform-gated skip), Go/SQLite tests,
lint/typecheck, generated drift, fixture output/privacy and fresh embedded CMS.
The full Linux `go test -race -tags=adminembed ./...` passed through WSL. Final
completion records any subsequent checks after review fixes. Migrations 00001–00003,
schema 3 and existing dependency pins are unchanged.

At the P0-5.5 checkpoint, giscus was integration-ready but Discussions was disabled.
The operator has since enabled it and supplied the public Blog Comments category
ID (2026-09-22); first real comment/reaction acceptance is still pending.
At that phase, Production import and cutover were deferred; ADR 0015 now cancels
Production legacy import. No main merge or Production operation occurred in that implementation phase.

## P0-5.5 Public fidelity correction

Started on clean, synchronized dev at `922d262b9a27f454bbe630b9c0ff4a5e08a794af`.
This correction responds to the user's rejected visual comparison: it only changes
Public rendering, CSS/interactions, locale routes, related tests and documentation.
Admin, Importer, CMS/domain, migrations, snapshot v1 and dependency pins are unchanged.

The live old site and its actual CSS/generate-site.ts/render.ts/app.ts were compared
against the local Astro site using the existing full Legacy snapshot. Restored the
768 px subtitle/Article Hero, 640/1280 px stats, 1280 px filter columns, 1024/1280 px
Topic grid, Note-group cards and the full-width Note detail shell. The shared safe
Markdown/Shiki/copy/TOC renderer remains in published views and Draft Preview.
Hero-rise entry, staggered cards/stats, 500 ms underline/button/select interactions,
GitHub hit area/glow, readable language control and the requested footer are present.
The synthetic Curated fixture's template prose was replaced with a concise reason;
Legacy output checks now assert original reason equality rather than rewriting it.

All canonical content/collection/tag/author/group/pagination pages get /en/ chrome
aliases, with unchanged body and original canonical, no duplicate sitemap/Pagefind
entry. Language switching keeps path/query/fragment. Seven translated static chrome
pages keep independent self-canonical/hreflang. No SQLite route is changed.

Validation includes Web Vitest/typecheck/build, full `make check`, both fixture and
35-item real Legacy artifact checks, and Windows browser comparison at 850 px plus
1440/390 px checks. Actual interactions covered theme, menu, Select open/close and
keyboard focus, source actions, Note group navigation, language aliases and page
entry. Topic grid was also measured at 800/900/1024/1280 px. Automated validation
does not substitute for the user's final A-grade visual signoff. No Production
credentials, R2 writes, deployment, DNS change or main merge is part of this work.

## Development local persistence

Started on clean synchronized dev at `783b3d62f77576d13f84e73ac787d9e6a19c6a6d`.
The complete Development Local Persistence Simplification document supersedes
Development R2/fallback/fixture guidance. ADR 0013 records the adopted boundary.

Development now uses File ObjectStore beside DATABASE_PATH, logical assets/content
directories, and the existing Asset/Content/Publication services and worker. It
ignores R2/Hook/CONTENT_R2 config. No migrations, seed, reset, new backend/service or
Production publication change. Existing schema 3 and Public visual files remain.
Local asset URLs are projected through explicit Go/TS policies and served only on
loopback in Development. Production defaults still reject local images. The local
worker writes full immutable snapshots/latest and completes without a Hook; status
verifies local pointer/hash without claiming an external build marker.

Normal make dev rejects CONTENT_SNAPSHOT_FILE. Missing local latest starts an empty
Public site and watches every 750ms; valid changes restart only Public. Startup and
shutdown preserve the database and storage files. The existing Draft preview uses
the same renderer and the local image policy without any publication mutation.

Executed: make generate, Admin/Web typecheck, focused storage/config/domain/worker/
HTTP/Markdown/watch/preview tests, make build-cms and make check (178 tests passed,
one pre-existing platform skip). Linux Go 1.26.8 `go test -race -tags=adminembed
./...` passed in the existing WSL environment using cached dependencies with
network module lookup disabled. Production fixture artifact checks and synthetic
secret-output scans passed. Real-file integration tests create Curated/Topic/long
Note/image data, reopen SQLite and FileStore, publish N+1 and preserve old bytes;
the external-call counter remains zero.

Windows make dev was started against the existing data/gopheratlas.db without
clearing its four existing content items. The obsolete fixture assignment was
explicitly cleared from the ignored local .env; other configuration was retained.
The initial empty-site/local watcher and three services run normally. Authenticated
browser creation/upload/publication/restart acceptance is pending the operator's
GitHub login; service tests are not presented as that browser acceptance.

## Production verification and fresh-start decision (2026-09-22)

Operator-provided terminal output confirms prod-update installed main a1f4638,
health/readiness passed, and both update-time and standalone backups completed.
Both backups predate the first publication; no restore drill has been performed.
GitHub Token endpoint timed out directly but responded through existing loopback
Mihomo. Setting HTTPS_PROXY/NO_PROXY in systemd's cms.env and restarting resolved
OAuth; the screenshot confirms an active Admin login. No credentials are recorded.

The operator published the first Note. Publication screenshots show generation 1,
snapshots/generation-1.json, no job error and matching CMS/Public generation 1
with synced status. A subsequent screenshot confirms the Worker homepage renders.
Independent marker hash comparison, Note detail/search/feed/sitemap acceptance
and final gopheratlas.com cutover are not yet reported. These are real operator
observations, not results of automated tests or agent access to Production.

The user explicitly cancels Production legacy content migration and starts afresh.
Keep current Production identities/content/history, do not import Development data,
and do not extend the Development-only importer. P0-6 is now domain-only cutover
and new-site acceptance (ADR 0015); earlier migration scope is historical. No DNS,
production config or runtime code was changed by this documentation update.
See [Production runbook](operations/production-runbook.md).

## Domain cutover and giscus configuration (2026-09-22)

The operator bound gopheratlas.com to the Production Worker and returned its marker:
generation 1 and snapshot SHA-256 match the CMS job; commit is a1f4638. The operator
reports WWW redirect success and shows the published Note/detail image at the
formal domain. No legacy content was imported. CMS PUBLIC_SITE_URL adjustment and
search/feed/sitemap manual checks have not yet been confirmed.

GitHub screenshots confirm the Blog Comments announcement category and successful
giscus repository validation. The supplied public category ID is configured in the
Web source, preserving specific per-Note terms and strict matching. Production
comment/reaction submission is not performed by implementation tests and remains
operator acceptance. See the updated Production runbook for steps.
