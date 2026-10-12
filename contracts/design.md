# Design contract — mandatory for Public and Admin

This is an engineering constraint, not optional visual inspiration. Implementation
tokens and examples are documented in `docs/design-system.md`. New screens must
be checked in light/dark themes, narrow layouts and reduced-motion mode.

## Public: Modern Geek Editorial

ADR 0016 supersedes the legacy visual requirements in ADRs 0012/0009. Product,
published data, route, safety and editorial semantics stay unchanged.

- Use a text-only GopherAtlas wordmark, self-hosted IBM Plex Sans (400/500/600)
  and IBM Plex Mono (400), system CJK fallbacks, and static Phosphor Regular SVGs.
  No compass, Sora/Jakarta branding, decorative glow or glass panels.
- Dark defaults to #101215 / #e8e9e7; Light to #f6f6f3 / #202326. Secondary text
  and controls must remain readable in both. Central semantic tokens own colors.
- The 72 px header is transparent over the black homepage Hero, and becomes an
  opaque reading surface after it. Brand links home; short Articles/Topics/Notes,
  Search, GitHub, theme and locale controls remain. Mobile menu closes on Escape
  and restores focus. Footer follows the whole content flow, without a border.
- Hero uses the supplied 1920×1080 AVIF, unchanged. Its baked-in localhost text
  is never duplicated as visible HTML. Use contain; mobile may trim surrounding
  black space but must retain every character. Alt text supplies equivalent
  semantics. Hero stays black in Light theme. No image animation or filters.
- Below the Hero: Notes, Curated Articles, then Topics. A 1200 px maximum shell
  uses a 28/72 editorial grid, stacking below 768 px. Home Notes use descending
  lastPublishedAt; group pages retain groupOrder/order. Empty Topics are omitted.
  All titles, dates, ratings and counts come from published snapshot data.
- Curated rows show source/language, title, short summary, small Mono rating,
  external original and internal editorial links. Full metadata/rationale stays
  in details. Filters keep all existing parameters, legacy links and 12-item pages;
  advanced conditions restore visibly. No new business fields or endpoints.
- Note groups and Topics are text directories. Groups keep four-item pagination
  and full-group links. Topics render one ordered list, marking its leading
  recommendedCount entries without duplicating them.
- Reading uses a 740 px body with no outer card, 17 px / 1.85 type, 13–14 px code,
  32–46 px H1 and a 210 px sticky TOC. Below 1100 px TOC is collapsible. Group
  access lives at the heading and previous/next/group links at the end.
- StyleX definitions live in ordinary TS modules, consumed by static Astro
  templates. Preserve global CSS for reset/fonts, tokens, safe Markdown/Shiki and
  DOM-driven states. Public has no Tailwind or hydrated React runtime. Do not
  import Admin styles, components, clients or private services.
- All canonical paths, /en/ chrome aliases, search, Markdown safety, Giscus,
  transient Draft Preview, RSS/sitemap/SEO and direct redirects remain intact.
- Single Focus Indicator Contract: search/text fields and Select triggers have
  one continuous focus edge, without a second outline or external glow. Public
  links/buttons keep visible keyboard focus; never globally disable focus-visible.
  Listbox options retain keyboard highlighting and an inset focus indicator.
- ScrollDock replaces Back to Top: 48 px square, 10 px corners, 3.5 px progress
  stroke, Phosphor arrow and existing theme tokens. Click scrolls up 25% of the
  total scrollable distance. Hide when that distance is <=320 px or scrollY <=72.
  Honor safe areas and reserve separate space above it for Toast. Only hide the
  document scrollbar visually; native wheel/touch/keyboard scrolling stays intact.
  Internal listboxes, code, tables and TOCs use thin, visible scrollbars.
- Motion mini enhances initial header/Hero copy and user-driven list, Select and
  ScrollDock changes. Interaction transitions last 160–200 ms and move 0–4 px;
  existing Hero entry may use 550 ms / 8 px. Apply new state immediately, cancel
  obsolete work and restore CSS when animation ends. Closing overlays become
  inert immediately. Content stays readable without JS; reduced motion settles
  active animations and skips new ones. Never add repeated scroll reveals.
- Native same-origin cross-document View Transitions may crossfade for 180 ms
  when motion is allowed; unsupported browsers keep ordinary navigation. No
  ClientRouter, client route interception or replacement of history/scroll semantics.

## Admin: dense, calm editorial workspace

- Chinese is the only Admin UI language; no i18n framework or bilingual labels.
  Central mappings own role/state/type/action names. Technical identifiers and
  user-authored content retain their original values. See ADR 0010.
- A 208 px sidebar collapses to 56 px, with tooltips and permission-aware groups.
  A 48 px top bar contains breadcrumbs, scoped search, create, theme and account.
  Below 768 px navigation becomes a modal drawer; the workspace stays full width.
- Phosphor is the Admin icon family. Base UI wrappers in `components/ui` provide
  consistent controls, keyboard/focus semantics, bounded overlays and scrollbars.
  The Markdown-first editor has a grouped inspector and separate history view.
- React + Vite, **shadcn/ui with Base UI primitives**, Tailwind CSS v4. Do not mix
  Radix or React Aria primitives without an ADR explaining a concrete need.
- Medium/high information density; flat surfaces, small 6–8 px radii, restrained
  shadows, predictable desktop navigation. Baseline text 14 px, controls 32 px high.
- Use semantic colors for surfaces, text, borders, focus and actions. Density must
  preserve readable labels, keyboard access and clearly associated errors.
- Role-aware navigation/actions arrive with real server policy. Do not present
  fake role controls or make unfinished workflows look functional.
- Monitor remains a protected ordinary link, without iframe or copied metrics.
- Show editorial state separately from “已在 CMS 发布”. Never imply a public
  build/deploy completed. Save status uses aria-live; conflicts require explicit
  recovery and preserve local text. High-impact actions use Base UI AlertDialog.

## Shared interaction and accessibility requirements

- Public defaults to dark with a persisted light/dark toggle. Admin offers 跟随系统 / 浅色 / 深色;
  only theme and sidebar-collapse preferences may use localStorage. Draft content may not.
- Honor `prefers-reduced-motion`. Admin transitions are 150–250 ms; Public
  uses 180 ms hover transitions and the reduced-motion-aware entry timings above.
- Visible keyboard focus, semantic headings/landmarks, skip links, named controls,
  status announcements, and meaningful image alt text are required.
- Aim for WCAG AA contrast (4.5:1 normal text, 3:1 large text/control indicators).
  Color alone must not communicate status. Check overflow at 360 px width.
- App-specific tokens are intentionally separate. Do not force Public into the
  Admin component system to reuse styles.
