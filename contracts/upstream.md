# Upstream boundaries

Checks use local temporary SQLite databases and fake OAuth HTTP endpoints, never
real GitHub credentials, R2, Cloudflare or production services. Dependency versions
are pinned in manifests, lockfiles, go.mod/go.sum and `scripts/tools.json`.

## GitHub identity and browser sessions

`golang.org/x/oauth2` exchanges codes with a ten-second context/client timeout;
GitHub `/user` supplies the stable numeric ID. Redirect following is disabled for
provider HTTP calls. The token exists only during identity lookup, then is discarded.
No GitHub SDK or persistent provider token is needed.

Login stores one-way state hashes and a short-lived browser cookie. The callback
requires cookie equality plus atomic, unexpired, unused server state. A new login
rotates the previous browser session. Pending users may read `/me` and logout;
privileged APIs require active status. Disabled sessions cannot authorize.

Production session cookie: `__Host-gopheratlas_session`, Secure, HttpOnly,
SameSite=Lax, Path=/, no Domain. `__Host-gopheratlas_csrf` is Secure/host-only and
readable by JS; mutations require cookie/header equality, stored SHA-256 match and
exact configured Origin. No LocalStorage. Validated loopback HTTP development uses
`gopheratlas_dev_session`, `gopheratlas_dev_csrf`, and `gopheratlas_dev_oauth_state`.
HTTPS, including development HTTPS, always uses Secure `__Host-` cookies.

CMS remains loopback-only behind Tailscale HTTPS. Its proxy must not log callback
query strings. Vite proxies the same-origin API and ops surfaces without rewriting
Origin. Secrets never use PUBLIC_/VITE_ variables or enter browser bundles.

## Logging and Monitor (implemented)

One `*zap.Logger` tees JSON to stdout and Lumberjack v2 rotation. Composition also
adapts that exact logger for Fiber-internal logging. Application errors cross the
transport as approved classifications; no raw SQL/provider/panic text is logged.

Pinned source was inspected before integration:

- [contrib Zap v1.0.12](https://pkg.go.dev/github.com/gofiber/contrib/v3/zap@v1.0.12):
  shared Logger, explicit latency/status/method/path fields, server request ID in
  FieldsFunc. Never use query-bearing `url` or raw `error`; skip health/readiness/Monitor.
- [contrib Monitor v1.2.1](https://pkg.go.dev/github.com/gofiber/contrib/v3/monitor@v1.2.1):
  one app-wide instance. `Next=true` instruments non-Monitor traffic; false serves
  `/ops/monitor`. The active-Admin guard resolves the shared session before Monitor;
  Recover runs after Monitor. EnableGCPauseMetrics=false. The dashboard is embedded
  and uses no external fonts/chart dependencies.

Monitor invokes ErrorHandler for downstream errors and consumes them. Zap must
observe resulting status. Tests prove 2xx/4xx/errors/panics, exact aggregate HTTP
counts, balanced in-flight count and Admin-only access at the pre-session guard.
Never log body, response body, OAuth query/code/state, IP, UA, cookie, Authorization,
CSRF, Markdown, R2 credentials or deploy-hook URL. Client request IDs are replaced.

## Deferred external boundaries

R2 CMS credentials will be bucket-scoped S3 RW assets/content; public builds use
separate RO content credentials. Immutable assets use `assets.gopheratlas.com`.
Private content stays private. Cloudflare hooks remain server-only and occur after
snapshot upload and committed DB transactions. No R2/hooks/import/deploy in P0-1.
