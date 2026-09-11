# GopherAtlas design system baseline

`contracts/design.md` is mandatory. This guide maps it to current implementation;
Both Admin and the P0-5 Public publication are implemented.

## Public implementation

`apps/web/src/styles/global.css` owns Public tokens; `Layout.astro` owns shared
landmarks, metadata and navigation. Fontsource's variable Latin WOFF2 assets are
bundled locally. CJK uses the reader's installed system fonts.

| Token       | Light     | Dark      | Use                         |
| ----------- | --------- | --------- | --------------------------- |
| `--paper`   | `#f7f5ef` | `#191d1c` | Page surface                |
| `--surface` | `#eeece5` | `#252b29` | Code/subtle inset surface   |
| `--ink`     | `#252a29` | `#eceee7` | Reading text                |
| `--muted`   | `#5b6461` | `#adb8b2` | Metadata and secondary text |
| `--line`    | `#cfd3cc` | `#414b46` | Dividers                    |
| `--accent`  | `#086a67` | `#77ccc2` | Links and focus             |

The outer shell is 72 rem; `.prose` is 46 rem (736 px at the default root size).
Body is 17 px / 1.8. H1 caps at 48 px; H2 is 30.4 px; H3 is 22.4 px;
code is 14.4 px / 1.65. `--toc-width` reserves 16 rem for later article layouts.
The homepage pairs a reading introduction with four navigation directions, then
uses section labels beside compact content lists. Source pages and published
Markdown share the same reading measure. Canonical detail pages have a desktop
TOC; below 1000 px it is omitted to preserve the reading column.

Dark mode follows `prefers-color-scheme`. Transitions use `--motion: 180ms` and
are disabled for reduced-motion users. Reading pages need no hydrated React islands. Search alone loads a small browser
module and lazily imports the local Pagefind API on a query.

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
