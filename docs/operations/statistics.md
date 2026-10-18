# Statistics — local archive, bot contract and rollout

Local C1 implementation, C2 contract alignment and release preparation, 2026-10-19.
The maintainer reports D1 `gopheratlas-statistics` has been created; its real ID is
now bound in `apps/web/wrangler.jsonc`. Worker `gopheratlas-web` retains Static
Assets; only the statistics API enters Worker-first. Reads/sync remain false and
Cron is empty. These are prepared repository settings, not a production deployment.
Local checks need no Cloudflare account/API credentials. The separate
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
uses a fresh `.cache/stats-c1/integration-*` store and sanitized child
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

## Maintainer production release checklist

The commands below are **manual production operations, not run by this task**.
Run from repository root with the accepted dev commit, after verifying the target
account. D1 is independent of CMS SQLite. Its name is `gopheratlas-statistics`, ID
`33474c53-2d09-4c1b-9545-2711f5f8bc2a`, binding `STATS_DB`. Do not create another DB.

1. **Migrate the existing statistics D1 before enabling anything.** Review pending
   migrations, then apply the separate statistics migration. Never apply it to CMS.

   ```sh
   pnpm exec wrangler d1 migrations list STATS_DB --remote --config apps/web/wrangler.jsonc
   pnpm exec wrangler d1 migrations apply STATS_DB --remote --config apps/web/wrangler.jsonc
   ```

   Confirm `0001_stats.sql` is recorded and the six statistics tables exist. An
   already-applied old C1 schema requires review; never relabel old unfiltered data.
   Use an operator identity authorized to migrate this D1; the Analytics Read
   token in the next step is not a D1 migration/deployment credential.

2. **Configure runtime Secrets on `gopheratlas-web`.** Create a separate token
   scoped to the correct account with Analytics Read only, distinct from the
   Workers deployment credential and R2 credentials. Enter values interactively:

   ```sh
   pnpm exec wrangler secret put RUM_ANALYTICS_TOKEN --config apps/web/wrangler.jsonc
   pnpm exec wrangler secret put RUM_ACCOUNT_ID --config apps/web/wrangler.jsonc
   pnpm exec wrangler secret put RUM_SITE_TAG --config apps/web/wrangler.jsonc
   pnpm exec wrangler secret put RUM_GROUP_LIMIT --config apps/web/wrangler.jsonc
   ```

   Site Tag is the GraphQL RUM Site Tag, not the Beacon token. GROUP_LIMIT is a
   positive integer no greater than the actual Settings maxPageSize; use the
   validated account value, not an invented fallback. Account/site IDs are kept
   in encrypted runtime configuration too. Do not place any of these in Git,
   PUBLIC_/VITE_ variables or build logs. `secret put` updates the Worker and may
   produce a deployment; execute only as part of the maintainer's release window.

3. **Release the accepted dev commit to main with both switches still false.**
   Fetch, require a clean workspace and fast-forward only; if branches diverge,
   stop. Push main and wait for GitHub CI and Workers Builds. Keep the existing
   root build/deploy commands and private R2 read-only build input. Do not run CMS
   migrations or updates for this Public release. Check the new public marker's
   commit/generation/hash and static pages. `/api/stats` returning 503 is expected
   while reads are disabled; A's content statistics remain visible.
4. **Activate sync, then reading after archive acceptance.** In the tracked
   Wrangler configuration on dev, set `STATS_SYNC_ENABLED` to string `"true"`
   and `triggers.crons` to `["15 3 * * *"]` (daily 03:15 UTC). Release that reviewed
   change to main. Cron propagates asynchronously (allow up to 15 minutes); the
   next scheduled event reads only the last two completed UTC days. There is no
   public sync/backfill endpoint. Do not use a remote development/test-scheduled
   call as an unreviewed production backfill.

   Inspect `sync_runs`, `daily_dimensions` and the real archived rows. Confirm
   `cloudflare-rum-bot-0`, sampling state, independent group completeness and safe
   paths/categories. Then set `STATS_READ_ENABLED` to string `"true"` in dev and
   release it to main. Keep future automatic Snapshot builds aligned with these
   tracked values: Dashboard-only variable/Cron edits can be overwritten by the
   next Wrangler deployment. Each activation is an operator action, not performed
   by this preparation. No historical 90-day fill is required or enabled.

5. **Minimum acceptance and rollback.** Check `/api/stats?range=7d|30d|90d`,
   `/stats/`, `/en/stats/`, null gaps and real zero, independently hidden Partial
   rankings, and Visits wording. Check `/`, one Note, Curated and Topic page,
   canonical/cover/default OG tags, favicon resources, `/.well-known/security.txt`,
   `/llms.txt`, Pagefind, RSS/sitemap and a historical redirect. Verify sharing
   opens the intended public-page URL and copy works in HTTPS; service composer
   behavior and remote OG caching need real-platform acceptance.

   To roll back statistics, set both switches false and Cron empty, release that
   configuration, and preserve D1 data. For an urgent UI/code rollback restore the
   known prior Worker version through the operator's deployment controls and
   separately verify Cron is disabled (triggers may outlive a version rollback).
   Follow with the corresponding repository config correction so the next build
   cannot reactivate it. Do not drop D1, rewrite CMS data or change DNS/R2/Hook.

References: [D1 migration commands](https://developers.cloudflare.com/d1/wrangler-commands/),
[Worker Secrets](https://developers.cloudflare.com/workers/configuration/secrets/),
[Cron and propagation](https://developers.cloudflare.com/workers/configuration/cron-triggers/).
This task prepares and locally verifies the release, then stops at dev.

### Release-preparation verification — 2026-10-19

- Targeted Vitest: 191 passing tests across site resources/sharing, RUM,
  archive/API/readership, KaTeX and Admin asset pagination/Markdown. Real local
  Wrangler integration: 2 passing tests with production routing and substituted
  local-only D1. No remote database operation occurred.
- `go test ./internal/assets ./internal/markdown -run
'TestListDescendingPageBoundaries|TestListUploadDedupeDeleteRestoreOrder|TestSharedMathSafetyFixtures'
-count=1` passed. Web check: 85 files, zero errors/warnings/hints. Scoped strict
  TypeScript, ESLint, Prettier and diff checks passed.
- Synthetic Snapshot v2 static output: 53 pages. Build assertions verified OG,
  favicon files, llms targets, security.txt, bilingual/canonical metadata, share
  targets, redirects, RSS/sitemap, Pagefind and privacy. An initial preview build
  found the copy button inheriting a 44px global minimum; its local 38px minimum
  was fixed and the final build/artifact gate passed. No full `make check` rerun.
- The exact production configuration passed credential-free `wrangler deploy
--dry-run --config apps/web/wrangler.jsonc` (explicit empty env file, metrics
  off). This does not test live deployment permissions or remote migration state.
- Local browser: Note/Curated/Topic, bilingual statistics, desktop and 360px,
  light/dark, copied feedback and visible keyboard focus checked. All five share
  controls measure 38×38px, color-only transition is 420ms, no horizontal overflow.
  Reduced-motion zero-duration CSS was reviewed, not OS-emulated. No platform
  post was submitted; external composer behavior, remote OG cache and production
  credentials/permissions remain maintainer acceptance items.
