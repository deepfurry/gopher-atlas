# Statistics V1-B — Data Contract Audit

2026-10-18 · [Issue #12](https://github.com/deepfurry/gopher-atlas/issues/12) ·
V1-A baseline `26c2738`. B is an offline-tested, server-only reader; the existing
Statistics pages and publication pipeline are unchanged. No live API request,
account introspection, secret loading, D1, Cron or deployment was performed.

## Evidence and unresolved questions

| Area                      | Evidence / conclusion                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dataset                   | The maintainer's frozen B document reports successful Explorer reads of account-scoped `rumPageloadEventsAdaptiveGroups`: date/host/path/referer, `count`, `sum.visits`, `avg.sampleInterval`, and Settings availability/limits. This implementation has only exercised synthetic responses.                                                                                                                                                                                                           |
| Metrics                   | `pageLoads` is RUM `count`; `visits` is `sum.visits`, **not UV**. Cloudflare defines a visit by a page view's differing/absent Referer host; zero Visits on an internally reached page is valid. [Official metrics](https://developers.cloudflare.com/web-analytics/data-metrics/high-level-metrics/)                                                                                                                                                                                                  |
| Exclude Bots              | Issue #12 says the maintainer enabled Dashboard “Exclude Bots”. No screenshot or matching authenticated RUM filter schema was supplied in this task. Official documentation lists it as a Web Analytics filter but does not establish an equivalent expression for these queries. Every result therefore says `botFilter: unverified`; no WAF/HTTP-request bot fields or manual corrections are added. [Official dimensions](https://developers.cloudflare.com/web-analytics/data-metrics/dimensions/) |
| Permissions / query shape | Each explicit read requests fresh Settings, including `availableFields` and `maxNumberOfFields`, and refuses unavailable fields/limits. Nested field names use the documented underscore form. The exact fixed query strings, scalar/order/filter support, this account's field list and limits still need an authorized live smoke test; synthetic tests cannot prove upstream schema compatibility. [Settings](https://developers.cloudflare.com/analytics/graphql-api/features/discovery/settings/) |
| Sampling                  | Upstream estimates are preserved, never multiplied by `sampleInterval`. Reported group averages are retained individually and summarized only as a min/max range. `1` means no sampling indicated by that average, not proof of complete raw logs. RUM sampling varies with retention/query conditions. [Sampling](https://developers.cloudflare.com/analytics/graphql-api/sampling/), [RUM FAQ](https://developers.cloudflare.com/web-analytics/faq/#is-the-data-sampled)                             |
| Coverage                  | A returned Top-N is not an exhaustive inventory. Reaching the requested limit, any site/group discrepancy, or nonempty sampled/unknown-sampling groups makes the day `partial`. No acceptable discrepancy threshold has been verified, so none is invented. No cursor/recursive enumeration is implemented. [Pagination](https://developers.cloudflare.com/analytics/graphql-api/features/pagination/)                                                                                                 |

## Reader contract

Entry point: `apps/web/stats/rum/client.ts` → `readRumDay(config, dateUtc)`.
Caller explicitly supplies an Analytics Read token, Account ID, **GraphQL RUM
Site Tag** (not Beacon Site Token), exact `requestHost: 'gopheratlas.com'`, and a
positive `groupLimit`. Never pass this configuration to Astro/browser code or
prefix its environment variables with `PUBLIC_`/`VITE_`. The module does not read
environment files/variables, export a generic query executor or issue import-time
requests. It rejects browser execution. There is no CLI or automatic invocation.

- One completed UTC day only: `[00:00:00Z, next 00:00:00Z)`. Today/future days
  are refused. Current Settings bound duration, retention, group count and field
  count; historical account limits from the attachment are not hardcoded.
- At most four sequential requests: Settings, site, paths, Referers. Each request
  has a 10-second deadline and 8 MiB response bound, rejects redirects and uses no
  automatic retries. A failure stops the sequence. Rate-limit/backoff scheduling
  belongs to the future caller; B does not run a scheduler.
- Success requires exactly one account, valid requested dimensions/metrics and
  no non-null GraphQL `errors`, even on HTTP 200. Duplicate groups, normalized
  Referer collisions and excess rows fail closed. HTTP authorization/rate-limit,
  timeout/cancellation, JSON/schema and GraphQL failures have safe fixed error
  codes; raw provider messages/headers, tokens, IDs and query variables are not
  returned or logged. HTTP-200 GraphQL errors remain `graphql_error`, without
  guessing a subtype from provider prose. [Error responses](https://developers.cloudflare.com/analytics/graphql-api/errors/)
- `ok: false` returns `unavailable` and **null** site/pages/referrers, including
  when an earlier query succeeded. Only successful empty aggregate arrays can
  represent observed zero; missing accounts/fields cannot. That empty result is
  not independent proof that the caller chose the correct Site Tag or that all
  beacons arrived.
- `ok: true` can still be `partial`. Site values are authoritative for this API
  response; grouping sums are diagnostics only. Pages rank by page loads;
  Referers rank by Visits. Each dimension reconciles its own counts against site
  totals, never against another dimension's totals and never by adding dimensions
  together. Sampled numbers, including finite fractional estimates, are not rounded.
- `complete` describes validated response coverage under this fixed query only.
  It is **not** an archive/finality flag or verified Dashboard equivalence.
  Every result still carries `bot_filter_unverified`; empty arrays have unknown
  sampling. Finished UTC days may receive delayed upstream corrections.
- Only `requestPath` is retained. Validate before accepting; reject full URLs,
  query/fragment/control data, malformed encoding and traversal rather than
  silently stripping them. Preserve case, percent encoding, trailing slash and
  Chinese/English identities. No CMS canonical/title mapping or URL repair in B.
  A path is not inherently anonymized: C must review public route mapping before
  exposing or archiving arbitrary paths; B does not persist them.
- Only Referer domains are retained: lowercase/remove a terminal DNS dot.
  Exact `gopheratlas.com` and `www.gopheratlas.com` are `internal`, kept separately
  for reconciliation even if upstream assigns Visits to WWW. Arbitrary subdomains
  stay external. Empty string is `direct-unknown`, never proof of typed navigation.
  `bing.com`/`www.bing.com` are `search`; other domains remain `external` without
  a guessed channel. Full URLs, credentials, ports, IP addresses and malformed
  hosts are rejected. Internal rows must not become C's external acquisition list.

Audit context includes source, UTC window, read time on success, effective Settings,
requested/returned group counts, independent sum deltas and quality warnings.
Account ID, Site Tag, token and raw responses are excluded. These are internal
reader types, not a new public API or a frozen D1 schema.

## Validation and gate before C

Synthetic fixture `tests/fixtures/rum-daily.json` uses deliberately invented
counts/limits and no real account, token or visitor data. Tests cover fixed query
scope, UTC/leap-day boundaries, limits, empty versus missing, invalid/duplicate
groups, sampling, truncation, referral classification, HTTP/GraphQL failures,
timeout/cancellation, response bounds and sanitized output. Only focused Vitest,
Web typecheck and scoped formatting/lint are required for this delivery; no
Public build or full repository check is needed because no Public source changed.

Offline checks run: `pnpm exec vitest run tests/rum-adapter.test.ts --maxWorkers=2`
(83 passed); `pnpm --filter @gopheratlas/web typecheck` (73 files, zero errors,
warnings or hints). Scoped ESLint/Prettier passed. No live compatibility or
Dashboard comparison is claimed.

Before **production archival in C**, the maintainer must authorize a read-only
live check with a correctly identified account/site and minimal token, inspect
Settings and applicable RUM filter/schema, and compare the same completed UTC day,
Host and bot policy against Dashboard. Record the actual sample intervals,
retention, grouped coverage and discrepancy policy. If equivalent bot filtering
cannot be established, obtain an explicit decision about displaying/storing that
unverified API scope. Also resolve partial-day handling and delayed-data rereads.
These prerequisites are **not verified by B's synthetic tests**. No production
archival or traffic UI is authorized or enabled by this audit.
