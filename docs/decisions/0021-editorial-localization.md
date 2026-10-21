# ADR 0021 — One editorial identity with versioned Chinese and English text

- Date: 2026-10-21
- Status: Accepted for Issue #20 implementation; Production upgrade requires separate authorization
- Scope: Curated articles and Topics; Note/Post language semantics stay unchanged

## Decision

Keep one Content ID, mutable Draft, optimistic version, review candidate and selected
published Revision. Chinese/English title, summary, Markdown and SEO are versioned
together with shared source facts, byline, cover, slug, tags and ordered Topic targets.
English publication is explicit, never inferred from populated fields. Enabled English
requires nonblank title/summary/body and the same Markdown safety policy; SEO may be
empty and falls back only to that language's title/summary. Chinese publication does
not require an English translation. Existing primary-text validation and optional
fields stay compatible; historical published Revisions remain exportable unchanged.

Migration 00005 adds Schema 5 with English TEXT columns on Drafts and Revisions,
an enabled flag and a small strict source-label JSON structure. Markdown never enters
the 32 KiB typed payload. Payload schema remains 1; migrations 1–4 and historical
Revision values are not rewritten. Old English fields read empty/disabled. Down must
refuse any English data loss. Readiness requires Schema 5. A scoped bounded Draft
request ceiling accommodates two 512 KiB bodies and JSON escaping; other requests
keep their existing ceiling.

One full-snapshot RHF/Autosave queue saves both languages and shared relations
atomically. Restore replaces both languages; reviewed publish selects the original
immutable candidate. Separate mounted instances of the existing MarkdownEditor keep
each language's native selection/Undo state. Language switches invalidate insertion
captures, coordinate Focus Mode and do not reset forms or save queues. Notes retain
their original editor. Source/curation and Topic reading order become full-width
workspace modules; publishing properties remain below, preserving A2/C's vertical
layout rather than restoring the old 320 px Inspector. Topic tags remain forbidden.

## Public contract

Add an independent closed Snapshot v3. Keep v1/v2 schemas and fixtures immutable.
Public validates the numeric wire version before one normalization step. v3 adds
editorialEn (null or a complete enabled English projection) only on Curated/Topic.
Disabled/partial translation drafts never enter the snapshot. Public statistics count
Content identities, not language views. Shared structures/URLs are not duplicated.

Complete English details use /en + the existing canonical path, true English text,
self canonical, matching SEO/OG and reciprocal zh-CN/en hreflang. Incomplete English
details are small English noindex compatibility pages linking the Chinese original,
without translated body, Pagefind, sitemap or invalid hreflang. English references
without translation show the actual source language and link the real original.
Existing Note/Post aliases, taxonomy fallback, routes and Giscus terms are preserved.
RSS remains one main-language entry per Content. Search retains its existing single
Pagefind index while adding valid English editorial pages.

## Release and recovery

Deploy the v1/v2/v3 Public reader first and verify current v2/Notes/marker. Separately
authorize stopped-writer consistent backup, protected-copy Schema 4→5 rehearsal and
matching CMS/Admin installation. Do not start the new writer before this gate.
Allocate one fresh publication generation for v3; never rewrite an immutable v2
generation key. Latest/hash/marker validators all recognize v3. Existing publication
fence, outbox and Hook order remain unchanged. No startup migration or network I/O
inside editorial transactions.

Rollback Public only to a v3-capable reader after v3 exists. Schema-4 CMS rejects
Schema 5; prefer stopped writes and a forward fix. Down refuses nonempty translations;
backup recovery must preserve subsequent writes and reconcile remote generation high
water, not silently delete English or overwrite immutable objects. prod-update does
not run migrations. Development implementation never operates Production.

## Verification

Exercise Schema-4 copies, immutable history, guarded Down, full snapshot conflicts,
reviewed selection and restore; disabled/partial/enabled English and unsafe Markdown;
closed v1/v2/v3 schemas and graphs; true/fallback language SEO/routes/search; shared
Topic ordering/dependency gates; editor selection/Undo/image capture/Focus; unchanged
Note workflows and identity counts. Use offline fixtures, synthetic builds and local
browser checks, then make check. Production backup recovery remains a separate drill.
