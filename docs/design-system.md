# GopherAtlas design system baseline

`contracts/design.md` is mandatory. This guide maps it to current implementation;
P0-3 Admin is implemented; the full P0-5 public publication design remains deferred.

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
Homepage sections use numbered rows and separators. Repository-managed pages use
`<article class="prose">`; future CMS bodies must use the same measure.

Dark mode follows `prefers-color-scheme`. Transitions use `--motion: 180ms` and
are disabled for reduced-motion users. Existing pages intentionally need no
hydrated React islands. Search will add an island when its interface is built.

## Admin implementation

`apps/admin/src/styles.css` owns separate semantic tokens mapped through Tailwind
v4's `@theme inline`. The 224 px sidebar, 14 px body, 32 px buttons and 6 px radius
provide the working density. At 760 px and below, a named keyboard-accessible
button expands navigation above the content. The editor uses a 320 px metadata
rail; below 1150 px it stacks under source/preview, and at 360 px metadata becomes
one column. Tables scroll inside named regions rather than widening the page.

`components.json` selects shadcn's `base-nova` style and Lucide icons. The local
Button is adapted from the [shadcn Base UI Button](https://ui.shadcn.com/docs/components/base/button)
and its [registry source](https://ui.shadcn.com/r/styles/base-nova/button.json),
retrieved 2026-09-10. It uses `@base-ui/react/button`, CVA and the local `cn` helper;
only the variants currently needed are retained. shadcn code is MIT licensed;
see `docs/third-party-notices.md`. Future components should be added from this
Base UI family. Public must never import this directory.

TanStack Query owns server caches; React Router data routes split the major feature
pages. React Hook Form/Zod own Draft metadata; TanStack Table renders the shared
content table. Native labeled controls and the Base UI Button/AlertDialog preserve
keyboard behavior. Sonner announces significant successes, never every autosave.

The header shows independent editorial and Published-in-CMS badges, workflow
actions from the server, and aria-live save/version status. Conflicts remain
visible with explicit reload, copy and inspect controls. Navigation and beforeunload
protect unsaved/in-flight edits; no Draft is written to browser storage.

UIW supplies only source input and an H2/H3/formatting toolbar. Source, Preview and
Split all use the same in-memory Draft. Preview uses react-markdown/GFM with safe
URL and image renderers; raw HTML is omitted, external images become warnings,
and Markdown feedback does not rewrite source. P0-4 adds a separate Asset picker/upload action with required alt; it does not
enable UIW raw image URLs or HTML preview.
Reviewer workspaces and history display immutable snapshots without Draft inputs.

System / Light / Dark uses the existing light/dark token pairs and stores only
`gopheratlas-theme`. Global reduced-motion rules disable transitions/animations.
Error text uses #a12c32 / #ffabb0; focus rings remain visible in both themes.
High-impact confirmation describes exact Revision selection or preserved history.
Monitor remains a normal Admin-only link. Authors are separate from account RBAC.

The optional AJV resolver adapter reports a pnpm peer-range warning against the
repository's existing ajv-formats 3. Admin imports only the Zod adapter; no AJV
adapter or replacement validator version is added to the application.

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
reduced-motion/focus rules are unchanged. No metrics iframe or P0-5 public design.
