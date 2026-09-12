# ADR 0012 — Three product lines and legacy-ready publication

- Date: 2026-09-12
- Status: Accepted implementation; visual acceptance remains a human release gate
- Scope: P0-5.5, supersedes the product/visual portions of ADRs 0009 and 0010

## Context

The original GopherAtlas is the product and visual source of truth. The rebuilt
repository owns the CMS, security and publication architecture. The previous
generic publication UX obscured the original distinction between curated external
articles, topic reading paths and original learning notes.

The audited legacy input is `gofurry/gopher-atlas` at
`e1a623b20389422421a7d808134ee093b28b491d`: 27 curated articles, seven topics,
one note, 118 tags and three external Markdown images. Its MIT visual assets and
OFL font distributions are attributed in Public output. Its generator is not reused.

## Decision

1. Normal product navigation and creation expose curated_article, topic and note.
   Post remains a compatible database/API/detail-route type; it is absent from
   normal creation, the home page, primary navigation, RSS and Pagefind.
2. Curated bodies are editorial rationale, never copied source articles. Public
   titles/read actions lead to sourceUrl; internal archive routes retain metadata,
   rationale and a subordinate curator byline. Topics contain curated identities
   only. recommendedCount divides one immutable ordered list, without a new table.
3. Note group/name/description/order live in typed payloads. Same-group published
   metadata must agree. No NoteGroup/Category model is introduced. Admin infers
   groups from authorized paginated content reads.
4. No migration: schema remains 3. Note payload adds groupDescription/groupOrder;
   Topic adds recommendedCount; Curated difficulty/rating use closed enums.
   Incomplete Drafts may have empty enums. Complete submission/publication may not.
   Legacy stored payloads deserialize omitted fields to defaults; immutable rows
   are never rewritten. Invalid existing publications fail export until corrected.
5. This is the expressly authorized pre-cutover revision of snapshot v1. The closed
   schema now requires the new fields; consumers fail closed on old incomplete
   snapshot files. Deploy matching exporter/consumer code and regenerate a complete
   snapshot before a later production cutover. Do not overwrite immutable snapshots.
6. A read-only Node plan follows exact legacy loader semantics, then a Development
   offline Go apply uses existing Asset and Content services. Per-content direct
   publish preserves original Content/publication dates in the same transaction as
   pointer/routes/Audit/generation/job. Revision/Audit timestamps remain actual import
   time. No fake review, raw SQL content insertion or alternative publication flow.
7. Asset downloads validate public HTTPS destinations and bounded bytes, then use
   the existing MIME/dimension/hash/R2 immutable upload. Only AST-located Markdown
   image destinations are rewritten; code examples and external source links remain
   unchanged. No global Markdown safety relaxation.
8. Public carries forward legacy logo, warm light/graphite dark tokens, hero,
   header/footer, editorial article rows, filter semantics, topic and note grouping.
   Note reading gets a 752 px column, 256 px TOC, Shiki/code copy, accessible tables,
   images and footnotes. One safe renderer serves all types and Draft Preview.
9. English is site-owned chrome on seven /en/ routes. Content is not translated;
   canonical detail paths remain untouched. Detail locale aliases are deferred.
   Giscus loads only on published Notes, with public configuration and stable
   `note:<groupSlug>/<slug>` terms; no local comment/reaction persistence.

## Consequences and verification

The Admin Shell, action projections, full-snapshot save queue, conflict recovery,
review identities, publication fence and development watcher/preview remain intact.
The only new HTTP projection is optional product metadata on already-authorized
Content list rows. Non-owner reviewers receive pending Revision metadata, not Draft
fields. Inverse Topic labels are batch reads, not browser N+1 requests.

Apply is deliberately one-shot and per-content transactional. Preflight rejects
collisions/re-runs before mutation; a later external failure can leave immutable
orphan images or a partial import. The operator must inspect the bounded counts
and restore/recreate a disposable Development DB before retrying. Apply queues
normal jobs but does not run the worker or call the Deploy Hook.

Tests cover strict payloads, Topic eligibility, group consistency, date/outbox
rollback, plan routes/AST rewrites, importer services, list privacy, product forms,
filter/select/pagination, Markdown/giscus/i18n, and static artifacts. P0-6 retains
the production backup/restore drill, controlled production apply, public route
comparison, main release snapshot and DNS/cutover. No Production operation is
part of this implementation.
