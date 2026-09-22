# GopherAtlas design system baseline

`contracts/design.md` is mandatory. This guide maps it to current implementation;
The P0-5.5 product rebuild preserves the current Admin Shell.

## Public implementation

ADR 0012 and the original GopherAtlas define the product baseline. Public CSS is
split into tokens, chrome, legacy hero, products, reading and motion; global.css contains
base rules in a lower CSS layer so component/keyboard/mobile rules win correctly.

| Token      | Light   | Dark    |
| ---------- | ------- | ------- |
| Background | #e4dbcf | #11161a |
| Text       | #1f2526 | #ece8e1 |
| Secondary  | #5f6668 | #bbb9b3 |
| Accent     | #6d857f | #a6bbbd |

The official compass, Sora wordmark, Plus Jakarta Sans and small GitHub/theme icons
are self-hosted with attribution/license files. The max 1440 px shell, 72 px header,
hero proportions, warm light / graphite dark colors and editorial rows follow the
old implementation. Theme defaults dark and persists explicitly; reduced motion
stops hero motion. Mobile navigation is expandable, focusable and Escape-dismissed.

Public product components are Articles/CuratedCard, ProductDirectory, TopicBody and
ContentDetail. Curated title/read actions lead externally. Topic recommendations
occupy the leading recommendedCount entries with two-entry pagination. Notes show
group metadata and four-entry pagination. Post routes remain compatible but hidden
from primary UX, RSS and Pagefind.

Note reading restores the full-width legacy heading and 8 px panel, with a 240 px
TOC beside the body, 17 px / 1.9 body, restrained H2/H3, Shiki
light/dark code with language/copy controls, scrollable code/tables, safe images,
footnotes and same-group previous/next links. Below 1100 px the TOC is inline.
Curated rationale and Topic guides use the same parser without forced TOCs.

Seven site-owned /en/ pages translate static guidance. All content and auxiliary
collection pages also have /en/ chrome aliases, including pagination. The language
control preserves the current path/query/fragment; canonical detail routes and
Markdown remain unchanged, aliases stay outside sitemap/Pagefind.

The legacy transition is 500 ms. PublicSelect uses the old SVG chevron, 48 px
trigger, 288 px scrollable menu and opacity/8 px translate transition. Closed lists
are inert/aria-hidden immediately while the visual transition completes.
Header subtitle remains visible at 768 px; Topic grid is 1/2/3 columns at
1024/1280 px. Article Hero splits at 768 px and filter fields at 1280 px.
Home hero-rise enters at 80/180/300/380 ms (780 ms duration), the visual at 440 ms.
Page/card/stats entries use 820 ms; reduced motion disables them. The footer uses
Copyright 2026[-current year] DeepFurry with contribution/about/search/RSS links.
Giscus uses public configuration,
lazy Note-only loading, stable note terms and theme messages; the disabled/error
states never obstruct reading. It is disabled in transient Draft Preview.

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
