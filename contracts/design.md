# Design contract — mandatory for Public and Admin

This is an engineering constraint, not optional visual inspiration. Implementation
tokens and examples are documented in `docs/design-system.md`. New screens must
be checked in light/dark themes, narrow layouts and reduced-motion mode.

## Public: Technical Journal × Knowledge Atlas

- Astro owns layouts, pages and article rendering. React islands are for necessary
  interactions only. **No shadcn/ui or Admin component imports in Public.**
- Use self-hosted Geist Sans Variable for Latin/UI and JetBrains Mono Variable for
  code. CJK fallback: PingFang SC, Microsoft YaHei, Noto Sans CJK SC, Source Han
  Sans SC, system sans-serif. Do not download large external CJK webfonts.
- Reading column: 720–760 px (baseline 736 px). Body ~17 px, line height 1.75–1.8;
  H1 42–48 px on desktop, H2 28–32 px, H3 21–24 px; code 14–15 px / 1.6–1.65.
  An optional desktop TOC is 240–280 px. Narrow screens shrink type and columns.
- Warm-paper/graphite light theme; graphite/warm-black dark surfaces; restrained
  teal/cyan accents. Colors must use semantic tokens; token literals belong in
  their declaration block, with matching fixed colors allowed in the favicon.
- Structure with typography, borders, numbering, whitespace, metadata and tags.
  Long-form text must never stretch across a wide desktop viewport.
- No glassmorphism, decorative-gradient surfaces, neon branding, or pervasive
  large rounded cards. Do not turn the publication into a SaaS dashboard.

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

- Public follows OS light/dark preference. Admin offers 跟随系统 / 浅色 / 深色;
  only theme and sidebar-collapse preferences may use localStorage. Draft content may not.
- Honor `prefers-reduced-motion`. Normal transitions should be 150–250 ms.
- Visible keyboard focus, semantic headings/landmarks, skip links, named controls,
  status announcements, and meaningful image alt text are required.
- Aim for WCAG AA contrast (4.5:1 normal text, 3:1 large text/control indicators).
  Color alone must not communicate status. Check overflow at 360 px width.
- App-specific tokens are intentionally separate. Do not force Public into the
  Admin component system to reuse styles.
