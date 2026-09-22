# 0009 — Public static publication from snapshot v1

Date: 2026-09-12. Status: Accepted; implemented in P0-5.

## Context

P0-4 already exports a closed, consistent public projection. The reader site must
remain available when the CMS is offline. P0-5 consumes that projection without
changing migrations, schema 3, sqlc, OpenAPI shapes or publication semantics.

## Decision

- Snapshot v1 is the sole publication input. The existing private Node loader
  accepts an explicit local fixture or complete content-R2 RO settings, verifies
  latest/hash/schema/graph, and writes the ignored generated snapshot. Missing or
  invalid input fails closed; Production never falls back to a fixture. Astro
  revalidates the generated input, then indexes references once at build time.
- A narrow Public layer owns ID maps, deterministic ordering, derived collections
  and strict reference resolution. Canonical detail paths come verbatim from
  snapshot canonicalPath. Author/Tag/Note-group pages are derived public routes,
  not CMS route rows. Conflicting group labels, slugs or page paths fail the build.
  Collections use static pages of 24 items; no browser API pagination is added.
- Post/Curated sort featured, lastPublishedAt and ID descending. Notes sort by
  groupSlug, payload.order, title, ID; Topics by payload.order, title, ID. Text
  ordering uses code points, avoiding host-locale/ICU drift. Home selections are
  featured/recent; RSS uses lastPublishedAt/ID and excludes Topics.
- Astro renders all content, author bios and metadata at build time. Shared
  CommonMark/GFM validation runs before the existing Astro Markdown processor,
  with dangerous HTML disabled and the existing Shiki themes. No image or Curated
  source is fetched during rendering. Markdown images retain authored alt text;
  a cover is decorative beside its title (empty alt), since v1 has no cover-usage
  description. Public never imports Admin components or its API client.
- The existing single Web build writes static HTML, then direct 301 rules in
  dist/_redirects, the unchanged generation marker and Pagefind assets. Historical
  paths resolve Content identity directly to its current canonical; no chains or
  meta refresh. Reject more than 2,000 static rules or a declaration over 1,000
  characters, per [Workers Static Assets limits](https://developers.cloudflare.com/workers/static-assets/redirects/).
  P0-6 must decide a redirect overflow strategy before legacy cutover, if needed.
- Pagefind indexes canonical details and the two source-maintained information
  pages; collection/search/404/redirect/marker output is excluded. Only the search
  page loads a small browser module; the Pagefind API loads on the first query.
  A single forced zh index supports Chinese segmentation and English terms without
  silently hiding English pages from the Chinese search interface. Document lang
  stays correct; language-specific English stemming is deliberately not provided.
  See [Pagefind multilingual behavior](https://pagefind.app/docs/multilingual/).
  Results use safe same-site URLs and text nodes, bounded batches, latest-query
  wins, keyboard submission and empty/error/retry states. No search service.
- Canonical URLs use Astro.site plus the snapshot path; metadata uses SEO overrides
  or title/summary. Sitemap omits redirects/404; RSS and robots are real static
  output. The marker still describes the exact input bytes, not a transformed view.

## Production operations refinement

Development (dev, fixtures/fakes) and Production (main) are the only environments.
The user has manually deployed the systemd CMS under /srv/gopheratlas, loopback
only, with Tailscale Serve HTTPS. The private origin is redacted in public docs.
Workers Builds uses main with non-production builds disabled. This supersedes
earlier provisional host/domain/environment assumptions, not editorial decisions.
Reported login/health/assets evidence is distinct from the unperformed first real
generation → snapshot → Hook → build-marker acceptance.

## Alternatives and consequences

Runtime CMS/SQLite/R2 requests would couple reading to private infrastructure.
Replicating route grammar in templates would risk canonical drift; resolving
everything repeatedly in pages would make large builds quadratic. Hosted search,
SSR, a general Worker router and another Markdown renderer are unnecessary.

Static build latency remains intentional. Deploying dev does not update Production;
main promotion is a separate operator release. P0-6 owns legacy inventory/import,
route preservation and overflow decisions, a consistent backup/restore drill,
the first imported generation acceptance, DNS cutover and legacy-site retirement.
This phase performs none of those Production actions.
