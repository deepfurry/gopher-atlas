# Upstream boundaries

P0-0 only fetches development dependencies. Checks/builds use no live OAuth, R2,
deploy hook, production CMS or content service. Versions are pinned in manifests,
the pnpm lock, go.mod/go.sum and `scripts/tools.json`.

| Integration         | Required future behavior                                                                                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GitHub OAuth        | Numeric user ID is permanent identity; login is mutable. Validate high-entropy state, discard access token after identity lookup. Unknown users start pending.                                               |
| Sessions / CSRF     | Opaque random session, SHA-256 token hashes, secure `__Host-gopheratlas_session`, HttpOnly, SameSite=Lax, Path=/, no Domain. Mutations require active session, CSRF and origin checks. CSRF stays in memory. |
| Private CMS         | Loopback process behind Tailscale-only HTTPS. No required public inbound port or public Cloudflare route. Port choice is not access control.                                                                 |
| R2 CMS credential   | S3 Access Key ID/Secret, RW assets + content; never a generic Cloudflare API token. Immutable object keys; no automatic purge.                                                                               |
| R2 build credential | Separate RO access to private content only, stored as Workers Build Secrets. No drafts even in previews.                                                                                                     |
| Cloudflare hook     | Server-only secret; trigger after snapshot upload/latest-pointer update, after the DB transaction.                                                                                                           |

## Logging and Monitor integration seam (P0-1)

Use one shared `*zap.Logger` for services and
`github.com/gofiber/contrib/v3/zap`. Tee JSON to stdout and configurable Lumberjack
v2 rotation; development may use a console encoder. Do not introduce a competing
request logger. Do not log bodies, tokens, cookies, authorization headers, CSRF,
Markdown, R2 secrets, deploy-hook URLs, or client IP by default.

Read the [current Monitor repository](https://github.com/gofiber/contrib/tree/main/v3/monitor),
not stale website examples. Adopt one **app-wide** instance. `Next=true` passes
non-monitor traffic downstream and includes it in HTTP metrics; `false` serves
the monitor endpoint. A route-only mount cannot count application HTTP traffic.

Required assembly intent: request ID → Zap → `/ops/monitor` admin guard → app-wide
Monitor → Recover → sessions/CSRF/routes. The guard must be able to authenticate
the request before Monitor (do not rely only on a session loader mounted later).
`EnableGCPauseMetrics` defaults false. Monitor handles downstream errors through
Fiber's ErrorHandler and consumes them, so access logging must inspect resulting
status, not depend solely on a propagated error. Test authorization, errors and
recovered panics against the exact pinned implementation before enabling it.

Use explicit timeout/retry ownership at external boundaries and test doubles in
normal CI. Never put external network calls inside editorial DB transactions.
