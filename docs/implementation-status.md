# Implementation scope

Architecture authority: the supplied **GopherAtlas Platform Rebuild — Codex
Implementation Plan** (2026-09-10), refined by **GopherAtlas P0-1 — CMS Runtime,
Identity, Auth, Logging & Persistence** (2026-09-11). Both were read in full; the
P0-1 scope overrides older main-based development and memory-only CSRF assumptions.
The complete GopherAtlas P0-2 — Content Domain & Editorial Workflow document
(2026-09-11) defines the adopted domain/API. The complete P0-3 — Admin Editorial
UX document (2026-09-11) defines the current interface scope: narrow read/API
enhancements, no migration, and no external publication. The complete P0-4 Assets
& Publication Pipeline document (2026-09-11) now defines the current scope.

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

| Phase                               | Actual scope                                                                                                                                                                                                                                                                              |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0-0 (complete)                     | pnpm workspace, static Astro baseline, Admin/Base UI skeleton, Fiber shell, Markdown safety, OpenAPI/SQL tooling, design/contracts/ADRs, CI and make check                                                                                                                                |
| P0-1 (complete)                     | Four real identity tables, sqlc, pooled SQLite PRAGMAs, GitHub OAuth and numeric identity, pending/active/disabled users, fixed roles/capabilities, author profiles, persistent hashed sessions/CSRF/state, Zap/Lumberjack/contrib logger and Monitor, readiness, embedded identity Admin |
| P0-2 (complete)                     | Content/Draft/Revision, reviews, tags/topics, permanent routes, audit persistence, optimistic concurrency, editorial action APIs and state machine                                                                                                                                        |
| P0-3 (complete)                     | Feature-based Admin, safe Markdown editor/preview, autosave/conflicts, immutable Review Workspace/History, typed forms/Tags/Topics, Authors/Users/Audit/Monitor, server projections                                                                                                       |
| P0-4 (implemented; staging pending) | R2 assets, published projection v1, generation/jobs/snapshots, hook/recovery/coalescing                                                                                                                                                                                                   |
| P0-5 (deferred)                     | Full Public route families, publication design, search/SEO/redirects and production cutover                                                                                                                                                                                               |
| P0-6 (deferred)                     | Legacy import/verification, route preservation, backup/restore drill, deployment and cutover                                                                                                                                                                                              |

P0-1 validation covers migration up/down/rollback, pooled PRAGMAs/FKs, bootstrap,
last-Admin concurrency, state replay/mismatch/expiry, hashed session rotation/
revocation/expiry/restart, Origin/CSRF, role policy, profile safety, API boundaries,
Monitor guard/error/panic metrics, sensitive log omission, identity UI and embed.
`make generate` and `make check` remain authoritative executable gates. Tests use
fake providers and isolated databases; real GitHub OAuth and production deployment
are not claimed verified. Public keeps its three bootstrap pages; P0-4 adds validated v1 input and a marker.

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

Admin has Assets, cover/image pickers and Publication status/retry. Web has only
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
and privacy behavior remain covered by tests; no real staging claim is made.

Preview processes/tabs were closed and their listening ports released. Automatic
approval review rejected cleanup of the ignored `.cache/p0-4-preview` directory
with “blocked by policy”; it remains local and is excluded from the commit.
No real secrets, R2 writes, Deploy Hook calls, Cloudflare dashboard changes or
production DNS changes were used. The next step is the separately authorized
manual staging checklist in docs/operations/cloudflare.md; stop before P0-5.
