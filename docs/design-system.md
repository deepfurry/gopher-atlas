# GopherAtlas design system baseline

`contracts/design.md` is mandatory. This guide maps it to current implementation;
it does not claim the final P0-3 Admin or P0-5 publication designs are finished.

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
provide the initial density. Below 640 px, navigation stacks above the content.
Keep later tables/forms compact without compressing labels, focus or validation.

`components.json` selects shadcn's `base-nova` style and Lucide icons. The local
Button is adapted from the [shadcn Base UI Button](https://ui.shadcn.com/docs/components/base/button)
and its [registry source](https://ui.shadcn.com/r/styles/base-nova/button.json),
retrieved 2026-09-10. It uses `@base-ui/react/button`, CVA and the local `cn` helper;
only the variants currently needed are retained. shadcn code is MIT licensed;
see `docs/third-party-notices.md`. Future components should be added from this
Base UI family. Public must never import this directory.

TanStack Query owns the connection request; React Router owns Admin navigation.
The only current action is to recheck CMS connectivity. Tables, forms, editor,
toasts and real workflow navigation are added when their phases supply behavior.

## Review procedure

Run `make check`, then inspect both app previews at desktop and 360 px widths.
Check light/dark surfaces, text contrast, keyboard Tab focus, skip links, absence
of horizontal page overflow, and reduced-motion behavior. A successful compiler
or build is not proof of visual conformance. New shared colors belong in tokens;
use spacing/type/semantic classes in page code. Auth and editor releases require
their own keyboard and assistive-technology checks.
