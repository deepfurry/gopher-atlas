# ADR 0018 — B1 Public Snapshot v1/v2 compatibility

- Date: 2026-10-17
- Status: Accepted; B1 deployed with v1 and confirmed by the operator on 2026-10-17
- Scope: Public consumer only; supersedes the v1-only reader and payload-derived
  Public taxonomy assumptions in ADRs 0009/0012, not the current CMS writer

## Decision

Keep `content-snapshot.schema.json` and the existing v1 fixture unchanged. Add an
independent closed `content-snapshot.v2.schema.json`. Select the schema strictly
by numeric schemaVersion (1 or 2), then validate the existing safety/reference
invariants. Both remote and Development file readers require latest and snapshot
versions, generation, exportedAt and exact SHA-256 to agree. The build marker
records the source version and hash, never the normalized representation.

v2 adds required `nameEn` (0–100 characters) and `descriptionEn` (0–1000) on tags;
empty English fields are valid. `groups` contains only referenced groups with
unique positive IDs and kebab-case slugs, required Chinese name/description,
optional-in-value English fields and integer order 0–1,000,000. Its bound is
10,000, the maximum number of published content items. Every Note groupSlug must
resolve and every group must be used. v2 Note payload contains only groupSlug/order.
Other public fields, references, routes and safety limits match v1.

After validation, one adapter creates the reader model. v1 derives consistent
groups from the historical embedded metadata (ID null, no invented identity);
v2 uses its independent groups directly. Both expose translated tags/groups and
minimal Note payloads. All indexes/templates consume this model; group ordering,
route slugs and comment terms do not depend on translated text. Each English
display field falls back separately to Chinese. Directory/detail/filter/home
labels and collection SEO use the same helper. Authored body, article metadata,
canonical/hreflang, redirects, feed and Pagefind inclusion rules stay unchanged.
The Development Draft preview still accepts its existing v1 projection and adapts
its presentation locally; there is no Admin payload/API change.

## Verification and alternatives

Tests exercise both reader paths, schema closure, version/hash mismatch, duplicate
IDs/slugs, missing/unused groups, legacy consistency, routes and localized metadata.
The unchanged v1 fixture and a separate synthetic v2 fixture run through the same
static artifact checks. `make check` builds the workspace once with v1, then only
Web with v2; each result receives route/SEO/Markdown/RSS/sitemap/Pagefind/marker and
privacy checks. This small orchestration extension avoids two full checks and
does not introduce fixture fallback in ordinary Development/Production builds.

Modifying v1 or branching version logic throughout templates was rejected: both
would obscure compatibility and encourage dual metadata authority. There is no
new dependency, runtime CMS request, taxonomy API or storage migration in B1.

## Required release order (not automation)

1. Operator independently promotes/deploys B1 Public and verifies the existing
   Production v1 input, URLs, comments, search and marker. No CMS writer update.
2. Only after that acceptance may B2 be implemented/released with explicit
   migration approval: schema 00004, Go DTO/exporter v2, Admin taxonomy management,
   plan/apply tooling and tests. Snapshot version, SQLite schema and content
   payload_schema_version remain separate concepts. B2 must preserve immutable
   Revisions and route ownership and supply only one v2 writer.
3. Production backup/copy rehearsal, stopped-writer migration, CMS replacement
   and recovery decisions require separate operator authorization. B1 does not
   run those steps or certify readiness for a Production data upgrade.
