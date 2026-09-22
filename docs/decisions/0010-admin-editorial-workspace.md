# ADR 0010: Chinese editorial workspace

Status: accepted

## Context

The Admin has complete editorial capabilities but inconsistent controls, English
and Chinese labels, and a long form layout. The reference is GoFurry Admin at
`gofurry/gofurry-nav-site`, commit `9f47e2bb965e094beb50cd3419564536b13d36d7`
(`apps/cn/admin/react`). Its shell, grouped navigation, compact tables, contextual
menus and bounded dialogs inform this design; its business code is not reused.

## Design plan

- A 208 px sidebar collapses to 56 px. A 48 px top bar carries breadcrumbs,
  scoped search, creation, theme and account controls. Navigation and workspace
  scroll independently; narrow screens use a modal navigation drawer.
- Geist with system CJK fallbacks; 14 px baseline, 12 px secondary text, 20 px
  page headings. Controls are 32 px, corners 6–8 px, surfaces flat and bordered.
- Light uses cool gray canvas, white surfaces and restrained blue accents. Dark
  uses slate surfaces and lighter blue accents, with separately tuned contrast.
- Phosphor icons provide one visual vocabulary. Base UI owns focus, keyboard,
  portals and interaction semantics; application wrappers own appearance.
- The editor gives the title and Markdown priority. A 320 px grouped inspector
  holds metadata. History is a separate view; high-impact actions use a menu and
  explicit confirmation. The existing full-snapshot save queue is retained.
- Chinese is the only Admin presentation language. Shared typed mappings name
  roles, states, content types, review decisions and publication/audit actions.
- Theme and sidebar preferences may persist locally. Drafts never do.

## Boundaries

API permissions and action projections remain authoritative. No migrations,
domain, authentication, publication or Public changes are needed. Search and
summaries use existing bounded read APIs; loaded-page counts/filters are labeled
as such and never presented as global totals. CMS publication and observed
public synchronization remain distinct.

## Verification

Retain editorial regression tests and add shell/control/language coverage. Review
the running local Admin in both themes and at desktop/narrow widths, including
keyboard navigation and destructive confirmations. Use disposable local data,
never production credentials or services. Run the repository check and embed
build gates before committing.
