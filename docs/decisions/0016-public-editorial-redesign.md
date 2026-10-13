# ADR 0016 — Public editorial design and Astro 7

- Date: 2026-10-13
- Status: Accepted for implementation; visual release signoff remains human
- Scope: Public presentation and build dependencies only

## Decision

Adopt the user's Modern Geek Editorial brief: original Notes first, text-based
resource directories, IBM Plex typography, static Phosphor Regular icons, a black
Hero using the supplied AVIF, and restrained Motion mini. This supersedes the
compass, legacy fonts/glows/cards and transition requirements of ADRs 0009/0012;
those records remain historical. Content, publication and security contracts,
Admin, Go CMS and schema 3 are unchanged.

At the user's subsequent request, upgrade Astro 6.4.8 to 7.3.8 (Vite 8), keeping
the explicit unified Markdown pipeline and compressHTML: true. Remove unused
Public React/Tailwind integrations; no pages become hydrated components.

## StyleX admission

Tested @stylexjs/unplugin 0.19.1 and one community candidate, unplugin-stylex 0.6.3,
in a tiny Astro page plus TS module. Both leave frontmatter stylex.create calls
uncompiled. The community candidate's module-only build inserts CSS through JS.
The official plugin successfully emits static CSS from external TS definitions
on Astro 6 and 7, without client StyleX or React. Its documented CSS-only virtual
module plus a dev-only stylesheet link supports HMR; browser checks confirmed
live font-size changes and mobile media rules. Adopt this official path.

Style modules own component layout. Small global sheets retain semantic theme
variables, font/reset rules, Markdown/Shiki and DOM-driven state selectors.
Declare layer order before development's virtual CSS; use border longhands.
The virtual module is compiled out of production. Avoid patching Astro or the
plugin and keep the same static renderer for Draft Preview.

## Consequences

Home selects recent published Notes independently of group reading order.
Curated rows link to complete editorial details; their filter text retains
rationale/author/tag/topic search semantics. Topics render one ordered list with
a marked recommendation prefix. Route ownership, /en/ aliases, Pagefind, Markdown
validation, image policies, Giscus terms, snapshots and generations are unchanged.

Supplied background is AVIF/AV1, 1920×1080, 60,533 bytes; source bytes are retained.
Copyright/license was not supplied and remains unknown. Plex OFL and Phosphor MIT
notices ship with the site. No production access, deployment or migration occurs.

## Interaction follow-up (2026-10-13)

After initial visual acceptance, retain the layout/type/color design and extend
Motion mini to cancellable state transitions. The Public design contract now
defines one focus edge for input/Select controls and a proportional ScrollDock
with native scrolling. Native cross-document View Transitions are a CSS-only,
reduced-motion-aware enhancement; no client router or architecture change is needed.
