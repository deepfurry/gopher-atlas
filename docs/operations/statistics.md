# Statistics — local archive, bot contract and rollout

Local C1 implementation and C2 contract alignment, 2026-10-19. Local checks need
no Cloudflare account/API credentials. `apps/web/wrangler.jsonc` still deploys Static Assets only. The separate
`apps/web/stats/wrangler.local.jsonc` contains a deliberately local database name,
no Cron, no secrets, and disabled synchronization. **Never deploy that config.**
Wrangler 4.151.1 is pinned as a development tool; workerd's installation script is
allowed explicitly. No CMS schema, Snapshot schema or editorial behavior changes.

## Local checks

From repository root, with the pinned Node/pnpm toolchain:

```sh
pnpm exec vitest run tests/stats-archive.test.ts tests/stats-readership.test.ts tests/rum-adapter.test.ts tests/public-stats.test.ts tests/public-stats-interaction.test.ts --maxWorkers=2
pnpm --filter @gopheratlas/web typecheck
```

For the single explicit synthetic build and real local routing integration, in
PowerShell (no `.env`/production input):

```powershell
$env:CONTENT_SNAPSHOT_FILE = (Resolve-Path tests/fixtures/content-snapshot-v2.json).Path
pnpm --filter @gopheratlas/web build
Remove-Item Env:CONTENT_SNAPSHOT_FILE
node scripts/check-public-build.mjs 2
$env:STATS_LOCAL_INTEGRATION = '1'
pnpm exec vitest run tests/stats-worker-local.test.ts --maxWorkers=1
Remove-Item Env:STATS_LOCAL_INTEGRATION
```

The integration test applies D1 migrations **locally** twice (second application
is a ledger no-op), seeds synthetic days through the real B adapter with mocked
fetch, starts the real Wrangler CLI, and checks API/static/redirect behavior. It
uses a separate `.cache/stats-c1/integration/state` store and sanitized child
environment, disables remote bindings and metrics, and stops its own server.
No remote migration/deploy command is involved. Unit D1 tests use disposable
local workerd stores. Retained cache files contain synthetic data only.

For manual inspection after that test, its ignored `preview.json` records the
configuration, persistence folder and port. Use those exact local paths with
`wrangler dev --local`; set `WRANGLER_SEND_METRICS=false` and
`CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false`. Inspect `/stats/` and `/en/stats/`
at 360px and desktop in both themes. Check range/metric buttons, keyboard focus,
table expansion, missing dates, readable quality notes and normal article links.
Without the local Worker, Astro preview serves only A and the unavailable notice.

### C1 verification record — 2026-10-19

- The five targeted A/B/C1 suites passed 109 tests. A subsequent Site Partial
  regression brought the D1 archive suite to 12 passing tests (110 distinct
  tests across those suites). The two opt-in real Wrangler integration tests
  also passed, including repeated local migration and static asset routing.
- Web typecheck passed for 82 files with no errors, warnings or hints; the
  standalone Worker/test TypeScript check and scoped lint/format checks passed.
- One synthetic v2 Snapshot build generated 53 static pages. The public build
  validator passed route, redirect, canonical, RSS/sitemap, Pagefind, marker,
  manifest and browser-bundle privacy checks.
- The real local Wrangler preview was checked in Chinese and English, desktop
  and 360px width, and both themes. Range/metric selection, keyboard focus and
  the daily table worked; the narrow viewport had no horizontal overflow.
  API failures, retry, stale-response cancellation and missing-versus-zero days
  were exercised by UI tests. Screenshots and local data use synthetic fixtures.
- No real Cloudflare query, production resource or deployment was used. These
  results do not establish the C2 live schema, permissions or bot-filter scope.

## Data contract and quality

- Site readings are stored separately from group completeness. `observed`,
  `sampled-estimate` and `partial` preserve the provider's decimal values and
  sample interval range. `bot_filter` is `cloudflare-rum-bot-0`, meaning all three
  RUM queries include literal `bot: 0`. It is not a guarantee of human traffic or
  WAF Bot Score, and it does not remove sampling/estimation limitations.
- Page/referrer batches must pass B's coverage gate. Unknown paths further lower
  page quality. Partial/unavailable attempts retain prior data but mark that
  dimension unavailable for a current public ranking. Transactions roll back
  replacement failures; older completions cannot overwrite newer observations.
- The manifest at `/.well-known/gopheratlas-stats.json` contains only published
  route/title/count information and marker identity. Redirects map to their real
  canonical content; independent language content remains independent. Unknown
  traffic paths are dropped, never archived. Withdrawn routes cannot leak from
  older D1 rankings. Referers persist only `direct-unknown`, `search` (currently
  the B-confirmed Bing hosts) and `external-other`; no arbitrary domains or URLs.
- `/api/stats` allows GET and one range enum only. No cookie/identity, write API,
  SQL input or live upstream request. Missing days stay null; a genuine stored 0
  remains 0. Totals cover archived days only. Partial collection history is
  disclosed. Rankings need every day in the known interval through yesterday;
  interior gaps or incomplete dimensions hide them. Percentages are against Site
  page loads over that same interval, not an invented Top-10 denominator.
- `scheduled()` is opt-in and handles two completed UTC days serially, with B's
  current Settings limits/timeouts and no extra automatic retry. A failed run
  leaves a safe audit classification. Content inventory observes the deployed
  manifest on the execution day only; it is distinct from A's retrospective curve.
- Read and synchronization flags are separate and default off. C1's example
  enables local reading only. Synthetic tests do not prove account permissions,
  full Dashboard equivalence or production sampling coverage. C2's maintainer-
  supplied Explorer evidence establishes the RUM bot filter, as recorded below.

## C2 bot-filter alignment — 2026-10-19

The maintainer verified `rumPageloadEventsAdaptiveGroups` with `bot: 0` in
GraphQL Explorer: 2026-10-17 UTC changed from 26 Page Views / 14 Visits to
24 / 12; both queries reported Sample Interval 1 and `errors: null`.
See the [Data Contract Audit](../statistics-rum-audit.md) for provenance and limits.
This task did not repeat the live request or use any production credentials.

The shared discriminator is required by the reader, archive, REST and browser.
Archive input with mixed/old scope is refused; REST refuses stored rows with
another scope instead of relabeling them. The independent, not-yet-deployed
`0001_stats.sql` now accepts only the new scope. **An old C1 local database is
not upgraded by rerunning an already-recorded migration.** Use a fresh isolated
local store for verification, or retain the old store separately. Do not update
old `unverified` rows' labels to pretend they were fetched with `bot: 0`.
No existing local data is reset, and no remote migration is authorized here.

Local verification for this alignment:

```sh
pnpm exec vitest run tests/rum-adapter.test.ts tests/stats-archive.test.ts tests/stats-readership.test.ts --maxWorkers=2
pnpm exec vitest run tests/stats-archive.test.ts --maxWorkers=1
pnpm --filter @gopheratlas/web typecheck
```

RUM adapter: 83 passed; readership UI: 9 passed; local D1 archive/API: 17 passed
(109 distinct tests). The archive-only rerun followed a test-harness correction:
the D1 proxy cannot be method-spied, so the legacy-row response test now uses an
explicit wrapper around real D1 reads. Web typecheck passed for 82 files with no
errors, warnings or hints. Strict standalone TypeScript and scoped ESLint/Prettier
also passed. No static rebuild, full repository check, browser re-acceptance or
live Cloudflare query was run for this contract/copy-only correction.

## Remaining production gates (no execution in C1/C2 alignment)

1. **Bot-filter support confirmed by the maintainer; deployment acceptance still
   pending:** verify the actual minimal Analytics Read credential, Site Tag versus
   Beacon Token, exact fixed queries/Settings, UTC Host scope and current retention
   for the deployment. Inspect grouped coverage and compare Dashboard only with
   matching scope. The contract claims exactly RUM `bot: 0`, not WAF scoring or
   guaranteed human traffic; do not fall back silently to unfiltered queries.
2. **C3, separate authorization:** create a real D1 and apply only the independent
   `stats/migrations`; fill the actual ID in production config. Bind `STATS_DB`
   and `ASSETS`, set the Worker entry and exactly the two API Worker-first patterns.
   Preserve existing assets/redirects/404 handling. Never copy the local fake ID.
3. Supply `RUM_ACCOUNT_ID`, `RUM_SITE_TAG`, `RUM_ANALYTICS_TOKEN` via controlled
   server configuration (the token is a Secret), and a verified `RUM_GROUP_LIMIT`.
   No `PUBLIC_`/`VITE_` credentials. Choose an actual Cron and finite backfill policy
   separately; do not automatically query 90 days to fill a chart.
4. Enable sync only after scope acceptance and resource checks. Verify independent
   dimension states, safe persisted rows, marker/manifest identity, then enable
   reading (`STATS_READ_ENABLED=true`). Check API, bilingual pages, static routes,
   Pagefind, RSS/sitemap and redirects. Cache headers alone do not prove edge hits.
5. Rollback: disable reads to hide traffic while retaining A; disable sync and
   Cron to stop collection. Keep D1 data intact. Restoring Static Assets-only
   production configuration removes the API without changing CMS or publication.

No production resource, secret, migration, traffic backfill or deployment is
performed or implied by these steps. C1/C2 alignment stops at local acceptance.
