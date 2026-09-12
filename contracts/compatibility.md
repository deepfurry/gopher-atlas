# Compatibility contract

Internal Go/TS APIs are not stable public SDKs.
Future changes to URLs, persisted data, environment keys and published snapshot
versions still require explicit migration reasoning; do not silently reinterpret
existing fields. Exact currently executable HTTP shapes live in `openapi.yaml`.

Public URL families are `/articles/:slug/`, `/posts/:slug/`,
`/notes/:group/:slug/`, `/topics/:slug/`, `/tags/:slug/`, `/authors/:slug/`,
plus index/search/about/contribute pages. Astro uses `trailingSlash: always`.
Posts have no date component. Legacy route verification belongs to P0-6.
Previously published routes remain reserved forever and redirect with 301 directly
to the current canonical route, never through chains.

Canonical origin is `https://gopheratlas.com`. CMS API requests are private and
same-origin with Admin. UI visibility never substitutes for server authorization.
Errors use `{ error: { code, message, requestId, fields? } }`; internal errors must
not disclose private details. Liveness is not readiness.

Runtime lines: Node 24, Astro 6, React 19, Tailwind 4, Go 1.26, Fiber 3. Exact
tool versions are in `.node-version`, `.go-version`, manifests and lockfiles.
Generated clients and sqlc output are changed by regeneration and drift checked.

P0-1 adds identity-only APIs, persistent users/profiles/sessions/states and the
readiness endpoint. OAuth/CSRF changes supersede the bootstrap's memory-only CSRF
intent: JS now reads a session-bound same-origin cookie, supporting refresh/tabs.
Author slugs are read-only. Session cookies have distinct HTTPS and local HTTP
names; no blanket production cookie downgrade. Released migrations are immutable.

`make build-cms` is the production build entry and requires `adminembed` assets.
Plain Go builds deliberately have no SPA and are only for tooling/local Vite use.
Authorized early work commits directly to clean, synchronized `dev`; `main` is a release snapshot, not a work branch.

P0-2 adds editorial endpoints and schema version 2 while preserving migration 1.
Clients must send complete Draft snapshots and expected versions, handle stable
409 conflicts, and review immutable revision IDs. Tags/topic order are versioned
with Draft and snapshotted at submit/direct publish. List cursors are exclusive
ascending IDs (revisionNo for revision lists), capped at 100.
CMS published selection does not imply a rebuilt public site. P0-4 consumers reject schema 0 and require closed schema 1.

P0-3 enriches private DTOs with batch author summaries and available actions, adds
immutable review detail and author directory/profile administration, and extends
content list filters without changing object visibility. Neither migration is
modified; schema version remains 2. Existing domain commands retain their semantics.

P0-4 adds migration 3 without editing migrations 1/2. Draft PUT now requires
coverAssetId (explicit null clears it); Draft/Revision also project coverAsset.
Deploy matching generated Admin/client and CMS binaries together. Asset IDs and
SHA URLs remain stable after soft deletion. Generation is monotonic within a DB
history; restoring an older DB may report marker>desired (behind), requiring an
explicit recovery decision rather than silently rewriting the generation counter.
Unknown snapshot fields/versions, missing build inputs and hash mismatch fail.
P0-5 renders snapshot canonicalPath and derived Author/Tag/Note-group pages.
Historical redirects are direct static 301 rules, with platform-limit failures.
Collections paginate statically at /page/N/ after the first page. No runtime
CMS/API dependency or snapshot version change. P0-6 owns legacy URL verification.

Development commands dev-web/dev read optional root .env, with process env taking
precedence. Explicit CONTENT_SNAPSHOT_FILE wins and relative dev paths are rooted
at the repository. Only APP_ENV unset/empty/development permits per-field
CONTENT_R2_* fallback to CMS R2_*; Production builds retain separate RO inputs and
no dotenv/fallback. A missing development latest.json has a safe specific error;
missing buckets, forbidden requests and corrupt snapshots remain failures.

Development watches the existing configured bucket every two seconds and restarts
only Public for changed, validated generations. Empty latest at startup yields an
explicit empty Development site while waiting; runtime read errors retain the last
good input. Production loading remains fail-closed. Loopback HTTP is permitted only
by Development reads for local storage substitutes; ordinary builds require HTTPS.
ADR 0011 defines the transient local Draft preview, excluded from Production.
