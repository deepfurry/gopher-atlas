# Implementation scope

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

| Phase           | Actual scope                                                                                                                                                                                                                                                                              |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0-0 (complete) | pnpm workspace, static Astro baseline, Admin/Base UI skeleton, Fiber shell, Markdown safety, OpenAPI/SQL tooling, design/contracts/ADRs, CI and make check                                                                                                                                |
| P0-1 (complete) | Four real identity tables, sqlc, pooled SQLite PRAGMAs, GitHub OAuth and numeric identity, pending/active/disabled users, fixed roles/capabilities, author profiles, persistent hashed sessions/CSRF/state, Zap/Lumberjack/contrib logger and Monitor, readiness, embedded identity Admin |
| P0-2 (complete) | Content/Draft/Revision, reviews, tags/topics, permanent routes, audit persistence, optimistic concurrency, editorial action APIs and state machine                                                                                                                                        |
| P0-3 (complete) | Feature-based Admin, safe Markdown editor/preview, autosave/conflicts, immutable Review Workspace/History, typed forms/Tags/Topics, Authors/Users/Audit/Monitor, server projections                                                                                                       |
| P0-4 (complete) | R2 assets, published projection v1, generation/jobs/snapshots, hook/recovery/coalescing                                                                                                                                                                                                   |
| P0-5 (complete) | Full Public route families, publication design, search/SEO/redirects; cutover stays P0-6                                                                                                                                                                                                  |
| P0-6 (deferred) | Legacy import/verification, route preservation, backup/restore drill, deployment and cutover                                                                                                                                                                                              |

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

P0-6 is next/deferred: legacy content/route inventory and import, preservation and
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
