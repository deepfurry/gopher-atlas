# ADR 0020 — Independent statistics archive and conditional readership

Date: 2026-10-19. Status: Implemented for local C1; production enablement pending.

## Context

Issue #12 freezes Statistics A/B/C. A reads Published Snapshot at build time; B
provides a server RUM reader with unverified bot scope and conservative group
coverage. C1 may implement/test locally; C2 live query validation and C3 production
resources require separate authorization. This adds an optional statistics read
plane to ADR 0009 without changing publication, CMS or static content availability.

## Decision

- Keep Astro static and the production Wrangler configuration unchanged. A separate
  local configuration exercises a small Worker, with Worker-first restricted to
  `/api/stats` and `/api/stats/*`. The fallback delegates to the Assets binding.
  No SSR, public synchronization endpoint or CMS dependency.
- A separate D1 database has five aggregate/audit tables plus per-day dimension
  state. Prepared SQL and transactional batches replace a day's eligible dimensions
  atomically. Timestamps prevent older overlapping runs from overwriting newer
  results. The latest 100 audit entries contain only fixed classifications.
- Site values remain usable vendor observations/estimates when groups are partial.
  Sampled or unknown Site readings retain their quality. Partial group results
  never overwrite earlier complete rows. API availability considers the latest
  attempt independently for each dimension and hides unreliable rankings.
- Build a small public manifest from the validated publication, with counts,
  routes, canonical mapping, public titles, generation and snapshot hash. The
  Worker verifies it against the deployed marker via Assets. Only manifest paths
  can be archived; unknown paths lower page coverage without being persisted.
  Recheck the current manifest before exposing archived pages. Referers become
  three categories; internal hosts and arbitrary domain names are not stored.
- The scheduler is disabled unless explicitly enabled, rereads two completed UTC
  days serially, and records current content inventory only on its observation day.
  No historical inventory reconstruction or automatic traffic backfill.
- Public GET reads only D1 and Assets, never GraphQL. It returns explicit missing
  days and dimension coverage, bounded 7/30/90-day windows, no internal audit data,
  and caching directives (not a guarantee of edge-cache activation). Rankings
  require complete dimensions over a contiguous known interval through yesterday;
  leading uncollected history is disclosed, never filled with zero.
- Statistics alone loads small browser code. Missing service/data hides traffic
  sections and retains A. SVG segments break at missing days, tables remain
  accessible, and all values are provider data with Visits explicitly distinct
  from UV. B's unverified filtering label remains unchanged.

## Alternatives and consequences

Sharing CMS SQLite, embedding private data in Snapshot, full-site SSR, generic
GraphQL/ORM frameworks, storing arbitrary URLs/domains, discarding valid Site
estimates with incomplete rankings, and inventing historical zeros were rejected.
Wrangler is a pinned development tool for local workerd/D1 and routing tests;
it adds no browser dependency. Partial rankings may remain hidden for a long time
under sampling. A future policy to show estimated Top-N requires a separate decision.

Production remains D1-free until C2 validates exact queries, Settings, UTC/Host,
sampling and bot policy, then C3 provisions real resources and enables bindings,
read/sync flags and Cron. See [local verification and rollout](../operations/statistics.md).

## C2 amendment — 2026-10-19

The maintainer supplied successful GraphQL Explorer evidence for RUM `bot: 0`;
see the [audit](../statistics-rum-audit.md). This supersedes the original C1
`unverified` filtering label only. Site, Pages and Referrers now use the same
literal filter, with `cloudflare-rum-bot-0` as the shared reader/D1/REST/browser
discriminator. It describes Cloudflare's RUM scope, not guaranteed human traffic
or WAF Bot Score. Sampling and independent completeness gates remain unchanged.
The initial statistics migration is amended before production provisioning;
old local rows are never relabeled as filtered data. No production configuration,
resource, secret, migration or deployment is enabled by this amendment.

## Release configuration preparation — 2026-10-19

The maintainer subsequently created `gopheratlas-statistics` and authorized its
binding in the existing `gopheratlas-web` configuration. The repository now
prepares that binding and the Worker entry with both flags false and Cron empty.
Only the two statistics API patterns run Worker-first; other routes retain Static
Assets handling. This supersedes C1's unchanged-config boundary, without executing
remote migration, Secret changes or deployment. Operator steps remain in the
existing [statistics runbook](../operations/statistics.md).
