# ADR 0017 — Project code licensing and Public legal notices

- Date: 2026-10-13
- Status: Accepted at the maintainer's request
- Scope: Project code license, provenance documentation and Public legal pages

## Context and review

Before this change, root LICENSE contained MIT with Copyright (c) 2026 DeepFurry.
The local history reachable from all refs at `e34c60c` contains two author names
sharing one email, with no Co-authored-by trailers. The initial commit `3aa6aaf`
contains only LICENSE. Git metadata is provenance evidence, not proof of ownership;
the maintainer explicitly authorizes a change for project-owned code only.

The copyright/provenance scan identified inherited gofurry Public work at
`e1a623b20389422421a7d808134ee093b28b491d`, the shadcn/ui adaptation, Phosphor MIT
and font OFL notices. These remain under their existing notices and permissions.
Dependencies retain their package licenses. No third-party rights are reassigned.

## Decision

Use the [OSI BSD-3-Clause text](https://opensource.org/license/bsd-3-clause) for
project-owned code, retaining Copyright (c) 2026 DeepFurry. Preserve the former root
MIT text in `docs/licenses/DeepFurry-MIT.txt`; prior MIT grants are not withdrawn.
`docs/third-party-notices.md` records exceptions and retained notices. A blanket
relicense of all repository files was rejected because articles and assets have
separate rights holders and terms.

Serve `/legal/` and `/en/legal/` through the existing SitePage/Markdown renderer,
with a single localized Footer link. As source-owned bilingual pages, each has
its own canonical and reciprocal hreflang and is included in sitemap. Reserve
both paths against publication redirects. Keep the existing Pagefind index scope.

The four sections separate code/original writing/external curated content/assets,
record asset provenance, explain current privacy behavior, and provide usage and
contact guidance. Giscus loads near the comments area or on request; it is not a
click-only consent mechanism. Pagefind matches locally while downloading static
index resources. Theme preference uses localStorage. Hosting/CDN and comment
services may process network/account information; no zero-collection promise is made.
Public Issues must not solicit sensitive evidence; no unconfigured private contact
address or legal entity is invented.

## Consequences and open item

The homepage AVIF remains unchanged. Its supplied [Wallhaven listing](https://wallhaven.cc/w/0jz7gm)
identifies a listing source only. The creator and public-website permission remain
unverified, and BSD-3-Clause does not cover it. The maintainer must verify the
original creator and applicable permission separately; this task grants none.

No new dependencies, CMS/Admin behavior, schema, publication pipeline or Production
configuration changes. The Public Footer's joint site credit is distinct from the
project code's DeepFurry copyright line.
