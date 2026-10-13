# GopherAtlas design system baseline

`contracts/design.md` is mandatory. This guide maps it to current implementation;
The P0-5.5 product rebuild preserves the current Admin Shell.

## Public implementation

ADR 0016 defines Modern Geek Editorial, replacing legacy visual fidelity while
retaining ADR 0012's three product lines. Astro 7 renders static pages from the
existing snapshot. The explicit unified Markdown processor and HTML whitespace
compression preserve the established safety pipeline and inline spacing.

StyleX's official Vite plugin compiles layout/home/products TS style modules into
static CSS. Do not put stylex.create in Astro frontmatter. Use border longhands;
border shorthand is not emitted by this compiler. Explicit CSS layer order keeps
development's virtual stylesheet and built CSS consistent. Theme colors remain
semantic custom properties selected by data-theme before paint. The dev-only
virtual stylesheet/HMR import is stripped from static builds.

| Token      | Dark    | Light   |
| ---------- | ------- | ------- |
| Background | #101215 | #f6f6f3 |
| Text       | #e8e9e7 | #202326 |
| Secondary  | #aeb4b9 | #62676b |
| Accent     | #8495a6 | #657a8c |
| Separator  | #30353a | #d5d8d8 |

IBM Plex Sans Latin 400/500/600 and Mono Latin 400 are bundled locally as WOFF2
with swap; Chinese uses system fonts. Icon.astro selects trusted static Phosphor
Regular SVGs. Neither fonts nor icons need a remote request or hydration.

The 1200 px shell and 28/72 editorial grid stack below 768 px. The black Hero
uses the original AVIF without recompression; contain and a mobile image frame
trim only black margins, retaining the baked-in text. Copy occupies a separate
lower safe area. Header is 72 px; Footer follows the real content flow.
Footer reads © 2026 DeepFurry & LibreCosta; builds after 2026 output the range
2026–YYYY. `copyrightYears` is evaluated by Layout at build time, never a client timer.
Only artwork disables pointer events/selection; the image also declares
draggable=false and -webkit-user-drag:none. Keep loading priority, preload and
original AVIF bytes. Chinese Hero copy is “代码之内，自有旷野。” followed by
“我们试着理解世界，也不愿停止想象。”; English and CTA wording stay unchanged.
Home Notes sort by lastPublishedAt; group order and Topic sequence are unchanged.

Curated rows have external source/title and internal editorial links. Search text
retains published rationale/source authors/tags even though long rationale now
lives in details. Advanced filter conditions restore on load and popstate, with a
visible summary when collapsed. Groups retain four-item paging and full-group
links. Topics render each entry once and mark the recommendedCount prefix.
Advanced filters have no decorative bottom border: the final tag group has no
bottom margin, followed by 14 px padding and a local 12 px action gap. Hidden
More Tags controls reserve no space; other shared action groups are unchanged.
Topic reading headings and counts share a wrapping baseline row. The number/
Featured column is 84 px; below 768 px it becomes a compact row above the article.

Note bodies are 740 px with a 210 px sticky TOC at 104 px from the viewport top;
below 1100 px the TOC becomes collapsible. Anchor offset is 96 px. Header group
links and end-of-article previous/next/group links replace the floating toolbar.
Shared safe Markdown/Shiki, copy controls, table overflow, footnotes and lazy
Giscus remain. The same template serves private/no-store/noindex Draft Preview.

Search, author/tag directories, collections, About/Contribute and 404 use this
type/grid system. Locale aliases preserve authored Markdown, canonical routes
and query/fragment navigation. Post compatibility remains outside normal discovery.
Motion mini uses independent scopes for each operated region: Curated results,
each Note group, Pagefind results/status, each Select and ScrollDock. DOM state
changes immediately; a new operation cancels old animation work and restores its
inline opacity/transform. Curated/Search results enter for 200 ms / 4 px; only appended Pagefind
rows animate on load-more. Unchanged filter results do not reanimate. Select opens
for 180 ms and closes for 160 ms, becoming inert/aria-hidden before visual exit.
Reduced-motion changes and pagehide settle animations, including pending exits.
No-JS authored content remains visible; no CSS entrance hides it before script load.
Notes use 160 ms opacity only, with no Y displacement. Each multi-page list
reserves its own largest measured four-item page so the tail page's controls and
the following group stay still. Measure real rows synchronously without clones,
restore the current page before paint, and recompute on width/font changes.
Single-page groups and no-JS lists have no reserved height.

Normal Astro dev does not generate the complete Pagefind index. Validate Search
with `pnpm --filter @gopheratlas/web preview` after the fixture build in `make check`;
an unavailable index in dev alone is not a production search failure.

Homepage entrance uses independent sibling groups, inspired by the grouping and
cubic-bezier(0.4,0,0.2,1) easing of [DeepFurry](https://github.com/deepfurry/website/blob/main/src/styles/global.css):
brand 0/380 ms, desktop nav or mobile controls 90/380 ms, eyebrow 160/450 ms,
H1 300/550 ms, subtitle 460/470 ms, CTA group 620/450 ms, scroll hint 780/420 ms
(start/duration). The maximum displacement is 11 px on H1; other groups use 5–7 px.
Do not animate header-inner/hero-copy along with their children. Other pages keep
the existing immediate 320 ms header fade. Focus or pointer interaction finishes
the Hero entrance immediately. Pagehide/reduced motion restore CSS; bfcache resume
does not replay it. There are no entrance timers or hidden SSR styles.

Only the scroll hint's Phosphor arrow pulses 0→3→0 px and 0.7→1→0.7 opacity every
2.6 s after its entrance. IntersectionObserver pauses it outside Hero; pagehide or
a hidden document pauses it too. Reduced motion disables it. Text/anchor stay still,
and the existing narrow-screen hiding rule remains.

Native same-origin cross-document navigation opts into a 180 ms root crossfade
only under prefers-reduced-motion: no-preference. There is no ClientRouter or
navigation interception. Unsupported browsers navigate normally. This follows
the [native View Transition contract](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@view-transition).
Theme changes separately use `document.startViewTransition` and a native 420 ms
clip-path circle on the new root snapshot (cubic-bezier(0.22,1,0.36,1)), centered
on the theme button and sized to the farthest viewport corner. Only
`html[data-theme-transition='reveal']` overrides snapshot stacking/default fades.
Both directions put the new theme above the old one. Repeat clicks are suppressed
while active. No API/reduced motion/hidden documents switch immediately; failed
snapshots/animations, resize, pagehide/pageswap and reduced-motion changes settle
and remove the marker. Each accepted change updates DOM, optional preference
storage and the Giscus theme event once, even if a skipped callback runs late.

### Public focus and scroll controls

Single Focus Indicator Contract: controls.css overrides only the search input and
Select trigger focus. A 1 px border plus contiguous 1 px inset in --ring forms a
single 2 px edge, with no outer outline/glow or layout shift. Search appearance
is reset so browser-native decoration does not add a second edge. Global
:focus-visible remains for links, buttons and keyboard controls; listbox options
use an inset outline and surface highlight. Do not add a second focus ring to
these fields in component CSS. Admin's Base UI system is independent.

The main#main[tabindex=-1] skip target keeps focus behavior but omits its own outline.
Investigation reproduced a page-wide line at the main/footer boundary after
keyboard skip-link focus: computed outline was 2 px solid --ring, offset 4 px,
with no main/Hero border, shadow or active view-transition animation. Removing only
that outline addresses this observed path; standalone F12/devtools focus transfer
was not established in the in-app browser. Ordinary controls retain focus styling.

The five primary navigation links, theme/locale entrances and two Hero CTAs opt into corner-link.
Four independent 8 px L corners use 1.6 px strokes, 2.5 px radii and --ring (including
the fixed-black Hero/header override). They expand 2 px without changing text or
layout, enter in 180 ms and leave in 140 ms. Keyboard focus uses these corners
instead of a second outer outline; pointer hover is restricted to fine hover
devices. Reduced motion has no transition. Preserve aria-current underlining;
brand, footer, content links and ScrollDock do not opt in. GitHub's single anchor
wraps text corners and an external arrow: the arrow stays outside the corners.
Theme/locale use an internal corner span activated by the whole control's hover
or focus-visible, with no second outline. Theme keeps its 44 px hit target; locale
adds hit padding offset by margin, preserving navigation spacing.

ScrollDock.astro and scroll-dock.stylex.ts render a 48×48 px button, 10 px corners
and a static SVG rounded-square track with a 3.5 px progress stroke. Its TS
controller follows GoFurry Card's ScrollDock distance semantics: progress is
scrollY / (scrollHeight - innerHeight), clamped to 0–1; click subtracts 25% of that
total range. A passive scroll listener batches updates with requestAnimationFrame,
and ResizeObserver handles result changes, images and comments changing page height.
Short ranges (<=320 px) and the first 72 px hide the dock; hidden controls are inert.
The translated accessible name includes progress. Motion handles show/hide only;
scrolling remains browser-native and reduced motion uses instant scrolling.

scrollbars.css hides only the document scrollbar chrome. Internal listbox, code,
table and TOC scrollports use thin semantic-color thumbs. Dock offsets include
mobile safe areas; Toast sits above the dock at 84 px plus the bottom safe area.
Hover remains 180 ms. No body overflow lock, custom wheel handling or scroll library.

## Admin implementation

ADR 0010 defines the current Chinese-only editorial workspace. All interface copy
uses shared Chinese terminology; content, enum values and technical identifiers
are preserved. There is no Admin i18n framework.

`styles.css` is the entry point; `styles/tokens.css` owns semantic colors and
Tailwind mappings, with separate base/components/shell/editor/markdown/page layers.
The 208 px sidebar collapses to 56 px; a fixed 48 px top bar provides breadcrumbs,
scoped search (Ctrl/Cmd+K), create, theme and account menus. Sidebar and main work
area scroll independently. Below 768 px the navigation is a Base UI modal drawer.
Main content caps at 1660 px; forms and reading areas use narrower measures.

| Token     | Light     | Dark      |
| --------- | --------- | --------- |
| Canvas    | `#f4f6f8` | `#161b22` |
| Surface   | `#ffffff` | `#1c232d` |
| Text      | `#252e3b` | `#e1e7ef` |
| Secondary | `#667181` | `#a0adbd` |
| Action    | `#315f96` | `#94bdea` |
| Border    | `#dce2e9` | `#323e4c` |

Geist/system CJK, 14 px body, 32 px controls and 6–8 px radii provide working
density. Phosphor is the only Admin icon family. Shadows are limited to overlays.
Thin scrollbars cover the shell, overlays, lists and Markdown source.

`components/ui` wraps Base UI Button, Select, Combobox, Checkbox, Switch, Menu,
Dialog/Sheet, AlertDialog, Tabs, Tooltip and Popover. A Chinese calendar DatePicker
serves the Curated source date, including arrow/Home/End/PageUp/PageDown navigation.
Shared inputs, form fields, headers, toolbars, tables and loading/error/empty
states keep feature pages consistent. Context menus and unused controls are not
added. shadcn Base UI provenance remains in `docs/third-party-notices.md`.

TanStack Query owns caches and cursor pagination; table data references are stable
during lazy navigation. No page-index reset competes with the server cursor.
Search, dashboard counts and local filters explicitly describe their loaded scope.

The editor prioritizes title and Markdown. Its 320 px inspector groups 基础 / 类型 /
搜索展示; below 1100 px it stacks and at 360 px uses one column. 历史与路径 has a
separate view. The sticky header exposes save/workflow actions; the more menu
contains direct publish/unpublish/archive with explicit confirmations.

The unchanged autosave queue serializes full snapshots and versions. Ctrl/Cmd+S,
submit and direct publish flush that queue. Conflict stops retries, preserves
local content, and offers copy/inspect/explicit reload. Navigation and beforeunload
guards protect pending edits. Only `gopheratlas-theme` and `gopheratlas-sidebar`
persist; Drafts never enter browser storage.

UIW remains source-only with a Chinese Phosphor H2/H3/formatting toolbar. 源码 /
预览 / 分栏 share the in-memory Draft. react-markdown/GFM renders controlled
images and safe URLs without raw HTML. External images become warnings before
any request. Asset insertion requires alt text and uses the same save queue.
Review/history views show exact immutable Revisions and separate CMS publication
from observed public synchronization.

Sonner announces significant successes, never every autosave. Theme choices are
跟随系统 / 浅色 / 深色, with a quick toggle in the top bar. Reduced-motion CSS
disables transitions/animations; focus and status text remain visible in both
themes. Monitor remains an Admin-only ordinary link, never an iframe.

The optional AJV resolver peer warning is unchanged: Admin uses only the Zod
adapter, without adding a second validator.

## Review procedure

Run `make check`, then inspect both app previews at desktop and 360 px widths.
Check light/dark surfaces, text contrast, keyboard Tab focus, skip links, absence
of horizontal page overflow, and reduced-motion behavior. A successful compiler
or build is not proof of visual conformance. New shared colors belong in tokens;
use spacing/type/semantic classes in page code. Auth and editor releases require
their own keyboard and assistive-technology checks.

## P0-4 Assets and publication surfaces

Assets is a compact grid of bordered thumbnails with dimensions/MIME/size/time,
copy URL, upload and server-projected delete/restore controls. The shared Base UI
Dialog picker traps focus, returns it on close, and fits 360 px. Cover selection
and required-alt Markdown insertion update the existing RHF/autosave snapshot.
External URLs never create image elements; all thumbnails use the shared safety
helper. Soft deletion explains that historical public URLs remain available.

Publication is visible through retryBuild permission for Reviewer/Admin. It shows
CMS desired generation, observed public marker/status, worker configuration and
bounded job history with safe errors and explicit retry. It never renders config,
Hook URL or arbitrary response properties. Published in CMS remains distinct from
live build observation. Tables scroll inside named regions; tokens/themes and
reduced-motion/focus rules are unchanged. No metrics iframe or shared Public/Admin component system.

## P0-5.5 Admin product surfaces

The unchanged Shell exposes 精选文章 / 话题专区 / 学习随笔. Product tables use
bounded authorized list metadata, with source/rating/Topic/Tag columns for Curated,
entry/recommendation/order columns for Topic, and group/order columns for Notes.
Filters/sorts state when they cover loaded rows only.

Curated emphasizes title/summary/rationale and an original-source/curation inspector.
Topic emphasizes guide plus a wider ordered-list inspector; recommendation and
ordinary entries form one list with a boundary. Dragging and keyboard move controls
serialize into the same full Draft snapshot. Notes preserve the large Markdown
workspace and infer shared groups. All existing save/conflict/workflow controls,
permissions, source-only editor and local Public Draft Preview remain unchanged.
