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

- React + Vite, **shadcn/ui with Base UI primitives**, Tailwind CSS v4. Do not mix
  Radix or React Aria primitives without an ADR explaining a concrete need.
- Medium/high information density; flat surfaces, small 6–8 px radii, restrained
  shadows, predictable desktop navigation. Baseline text 14 px, controls 32 px high.
- Use semantic colors for surfaces, text, borders, focus and actions. Density must
  preserve readable labels, keyboard access and clearly associated errors.
- Role-aware navigation/actions arrive with real server policy. Do not present
  fake role controls or make unfinished workflows look functional.
- Monitor is protected operational telemetry, not a dashboard widget.

## Shared interaction and accessibility requirements

- Support light and dark themes; following OS preference satisfies the bootstrap.
- Honor `prefers-reduced-motion`. Normal transitions should be 150–250 ms.
- Visible keyboard focus, semantic headings/landmarks, skip links, named controls,
  status announcements, and meaningful image alt text are required.
- Aim for WCAG AA contrast (4.5:1 normal text, 3:1 large text/control indicators).
  Color alone must not communicate status. Check overflow at 360 px width.
- App-specific tokens are intentionally separate. Do not force Public into the
  Admin component system to reuse styles.
