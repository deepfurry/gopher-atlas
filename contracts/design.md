# Design contract — mandatory for Public and Admin

This is an engineering constraint, not optional visual inspiration. Implementation
tokens and examples are documented in `docs/design-system.md`. New screens must
be checked in light/dark themes, narrow layouts and reduced-motion mode.

## Public: legacy GopherAtlas product identity

ADR 0012 supersedes the earlier generic journal direction. The old repository at
`e1a623b` is the A-grade visual/interaction baseline, not optional inspiration.

- Preserve the official compass logo, Sora wordmark and Plus Jakarta Sans Latin
  font files. CJK uses local Noto Sans SC / Microsoft YaHei / system fallbacks;
  do not download large external CJK webfonts. Font licenses ship with Public.
- Preserve legacy warm light / graphite dark semantic tokens, subtle hero glows,
  72 px header, active underline, primary product navigation and footer hierarchy.
  The shell is at most 1440 px with 24 px desktop / 12 px narrow gutters.
- Home remains the single-screen brand introduction and compass visual. Curated
  lists are editorial rows with external source/title/read actions, Topic chips,
  ratings, rationale, tags and source metadata. Do not replace them with SaaS cards.
- Topics retain guide/recommended-reading columns and ordered curated lists.
  Notes retain group cards and four-entry group pagination. Only Notes get a full
  long-form reading system: 752 px body, 256 px TOC, 17 px / 1.9 body and 14 px / 1.75
  code. Narrow pages stack, provide an inline TOC, and scroll wide code/tables.
- Legacy rounded/translucent directory panels and subtle decorative glows are
  explicitly allowed for Public. Do not propagate this visual language to Admin.
- Astro owns static pages and one shared safe Markdown/Shiki renderer. No shadcn,
  Admin client/components, runtime CMS/API/SQLite or private R2 access in Public.
- Default Chinese canonical routes are preserved. Seven /en/ site-owned routes
  localize chrome; content is never automatically translated. Search/Tag/Author
  remain auxiliary navigation. Post is compatibility-only.

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

- Public defaults to legacy dark with a persisted light/dark toggle. Admin offers 跟随系统 / 浅色 / 深色;
  only theme and sidebar-collapse preferences may use localStorage. Draft content may not.
- Honor `prefers-reduced-motion`. Normal transitions should be 150–250 ms.
- Visible keyboard focus, semantic headings/landmarks, skip links, named controls,
  status announcements, and meaningful image alt text are required.
- Aim for WCAG AA contrast (4.5:1 normal text, 3:1 large text/control indicators).
  Color alone must not communicate status. Check overflow at 360 px width.
- App-specific tokens are intentionally separate. Do not force Public into the
  Admin component system to reuse styles.
