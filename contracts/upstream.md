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

## P0-4 external boundaries

CMS uses AWS SDK v2 S3 with explicit endpoint, region auto, static bucket-scoped
RW credentials, path style and a bounded client. Web Node builds use a separate
AWS SDK JS v3 RO content credential. No hand-written SigV4 or runtime public CMS
API. Content stays private; images use assets.gopheratlas.com.

Immutable HEAD compares SHA metadata. Missing objects use conditional
If-None-Match PUT; a raced precondition rechecks identity. Same hash is idempotent,
different hash is an integrity failure. Only latest.json permits mutable Put.
Assets use public, max-age=31536000, immutable cache policy and no physical deletion.
See [R2 compatibility](https://developers.cloudflare.com/r2/api/s3/api/) and
[AWS endpoints](https://docs.aws.amazon.com/sdk-for-go/v2/developer-guide/configure-endpoints.html).

Hook POST has a 12-second timeout, rejects redirects and accepts any 2xx. It never
parses/logs response bodies or URLs. Marker GET has a 5-second timeout, 8 KiB bound,
no credentials and strict closed parsing; it never affects readiness. Go R2 calls
use a 30-second client; build reads use 30-second abort and bounded streaming.
Only safe bounded classifications reach jobs/logs/API. Tests use in-memory storage
and loopback HTTP. Curated URLs stay metadata; source articles are never fetched.

## Public static delivery

Workers Static Assets consumes build-generated `_redirects` directly. P0-5 uses
only static 301 rules and fails above 2,000 rules or 1,000 characters per line,
per the [platform contract](https://developers.cloudflare.com/workers/static-assets/redirects/).
No runtime Worker/router or silent rule truncation. P0-6 decides overflow handling
before legacy cutover. Workers Builds consumes main; non-production builds are
disabled. Local development uses persistent FileStore, never Production credentials.

ADR 0013 makes normal Development entirely local for assets/publication. CMS uses
FileStore and a no-op Hook; dev-web polls local latest/snapshot files and strips
private configuration before browser tooling. R2/CONTENT_R2/Hook values are ignored,
including stale Production values. Production still uses separate content RO
credentials and never enables local fallback. Tests use explicit fixtures/fake
external services or real temporary FileStore; they never load real root .env.

Pagefind assets are generated locally and loaded only by the search UI. A unified
zh index includes English content, with Chinese segmentation and no English
stemming. No hosted search, CMS query or private R2 browser request is required.

## P0-5.5 Legacy and discussion boundaries

Legacy plan reads only a local source checkout. Explicit Development apply may
fetch planned Markdown images over bounded public HTTPS, with redirects disabled
and private/loopback/resolved non-public addresses rejected. It uses the existing
asset upload outside SQLite transactions, and never fetches external article bodies.
Apply itself never calls a Deploy Hook; durable jobs are processed later by the
ordinary CMS worker. Development apply's asset adapter is now FileStore; explicit
external image downloads still need network. Automated external calls remain fake.

Giscus is a separate public browser integration, only on published Notes. Public
repo/category IDs live in source config, without credentials. Stable term mapping,
strict matching, reactions, lazy loading and exact giscus.app theme messages are
used. Missing/failed giscus never blocks reading. There is no comment/reaction API,
DB, local anonymous identity or CMS permission coupling. Draft Preview never loads
comments. See https://giscus.app and ADR 0012.
