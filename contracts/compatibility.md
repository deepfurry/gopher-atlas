# Compatibility contract

P0-1 is unreleased. Internal Go/TS APIs are not stable public SDKs.
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
Normal feature work starts at `dev`; `main` is a release snapshot, not a work branch.
