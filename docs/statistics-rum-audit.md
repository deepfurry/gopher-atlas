# Statistics RUM — Data Contract Audit (B / C2)

2026-10-18 B baseline; C2 alignment recorded 2026-10-19 ·
[Issue #12](https://github.com/deepfurry/gopher-atlas/issues/12).
B was delivered as an offline-tested, server-only reader over V1-A `26c2738`.
C1 added local archival and conditional readership. C2 uses the maintainer's
reported Explorer evidence below; this implementation session made no live API
request, loaded no production secret, and performed no remote D1/Cron/deployment
operation. Historical B/C1 verification does not imply production enablement.

## C2 real API evidence (reported by the maintainer)

Cloudflare GraphQL Explorer accepted `filter: { bot: 0 }` on
`rumPageloadEventsAdaptiveGroups` for **2026-10-17 UTC**:

| Query scope        | Page Views (`count`) | Visits (`sum.visits`) | Sample Interval | GraphQL `errors` |
| ------------------ | -------------------- | --------------------- | --------------- | ---------------- |
| Without bot filter | 26                   | 14                    | 1               | `null`           |
| With `bot: 0`      | 24                   | 12                    | 1               | `null`           |

These are supplied validation observations, not synthetic fixture values and not
an independent rerun by the agent. They establish support for the RUM filter;
they do not measure perfect bot detection, prove human-only visits, establish
WAF Bot Score equivalence, or prove every future grouped response complete.
No subtraction or other correction is applied to the numbers in code.

## Evidence and unresolved questions

| Area                      | Evidence / conclusion                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dataset                   | The maintainer's frozen B document reports successful Explorer reads of account-scoped `rumPageloadEventsAdaptiveGroups`: date/host/path/referer, `count`, `sum.visits`, `avg.sampleInterval`, and Settings availability/limits. This implementation has only exercised synthetic responses.                                                                                                                                                                               |
| Metrics                   | `pageLoads` is RUM `count`; `visits` is `sum.visits`, **not UV**. Cloudflare defines a visit by a page view's differing/absent Referer host; zero Visits on an internally reached page is valid. [Official metrics](https://developers.cloudflare.com/web-analytics/data-metrics/high-level-metrics/)                                                                                                                                                                      |
| Bot filter                | C2 Explorer evidence confirms RUM `bot: 0`. Site, Pages and Referrers all use that exact fixed filter. `botFilter: cloudflare-rum-bot-0` describes the query scope, not absolute human traffic or WAF Bot Score. The former `unverified` contract is retired; no manual count correction is applied.                                                                                                                                                                       |
| Permissions / query shape | Each read requests fresh Settings (`availableFields`, `maxNumberOfFields` and limits) and fails closed. C2 confirms `bot: 0` support; this session does not additionally prove the exact adapter's end-to-end Settings/grouped queries, deployed credential scope or current account limits. Nested field names keep the documented underscore form. [Settings](https://developers.cloudflare.com/analytics/graphql-api/features/discovery/settings/)                      |
| Sampling                  | Upstream estimates are preserved, never multiplied by `sampleInterval`. Reported group averages are retained individually and summarized only as a min/max range. `1` means no sampling indicated by that average, not proof of complete raw logs. RUM sampling varies with retention/query conditions. [Sampling](https://developers.cloudflare.com/analytics/graphql-api/sampling/), [RUM FAQ](https://developers.cloudflare.com/web-analytics/faq/#is-the-data-sampled) |
| Coverage                  | A returned Top-N is not an exhaustive inventory. Reaching the requested limit, any site/group discrepancy, or nonempty sampled/unknown-sampling groups makes the day `partial`. No acceptable discrepancy threshold has been verified, so none is invented. No cursor/recursive enumeration is implemented. [Pagination](https://developers.cloudflare.com/analytics/graphql-api/features/pagination/)                                                                     |

## Reader contract

Entry point: `apps/web/stats/rum/client.ts` → `readRumDay(config, dateUtc)`.
Caller explicitly supplies an Analytics Read token, Account ID, **GraphQL RUM
Site Tag** (not Beacon Site Token), exact `requestHost: 'gopheratlas.com'`, and a
positive `groupLimit`. Never pass this configuration to Astro/browser code or
prefix its environment variables with `PUBLIC_`/`VITE_`. The module does not read
environment files/variables, export a generic query executor or issue import-time
requests. It rejects browser execution. There is no CLI or automatic invocation.

- Site, Pages and Referrers use the identical Site Tag, exact Host, UTC window
  and literal `bot: 0` filter. Callers cannot override that bot scope. The shared
  `cloudflare-rum-bot-0` discriminator is carried by reader quality, D1
  `bot_filter` and REST quality, and required by the browser validator. On a
  failed read it describes the requested scope only; data remains null.
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
  The obsolete `bot_filter_unverified` warning is removed. Empty arrays still
  have unknown sampling. Finished UTC days may receive delayed upstream corrections.
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

## Historical B validation

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

## C2 alignment and remaining limits

Targeted tests exercise identical filters on all three actual outbound query
strings, matching adapter/archive/REST/browser discriminators, rejection of old
or mixed scope, sampling/Partial isolation, and missing-versus-zero behavior.
The initial statistics migration is updated before any production D1 exists.
Old local C1 rows must not be relabeled; use a fresh isolated local database for
these tests. Existing local stores are not migrated or erased by this change.

The supplied live result resolves the bot-filter support question. This session
does not additionally verify the deployed token's permissions, all exact
Settings/grouped queries, current retention/limits, Dashboard equality or sampling
coverage across other days. Group truncation, late corrections and beacon loss
remain possible. C1's independent completeness gates and two-day reread stay in
place; Visits still do not mean UV. See [rollout gates](operations/statistics.md)
for separately authorized production configuration and end-to-end acceptance.
