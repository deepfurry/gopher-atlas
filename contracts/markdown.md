# Markdown contract

Authoring uses UTF-8 CommonMark + GFM body content. Metadata is held in CMS fields,
not frontmatter. Page templates supply the single H1; bodies use H2–H6.

Supported syntax: paragraphs, emphasis, lists, task lists, blockquotes, links,
controlled images, tables, footnotes, strikethrough, inline/fenced code and autolinks.
No MDX processing, JSX execution, raw HTML, script, iframe, Mermaid or KaTeX in P0.
Never enable `rehype-raw` or an executable content pipeline.

`packages/markdown` exports a validator and a shared remark plugin list. Links allow
HTTP(S), mailto, anchors and root-relative paths; protocol-relative URLs, control
characters, backslashes, credential-bearing URLs and unsafe schemes are rejected.
Images, including references, default to the exact Production HTTPS origin
`https://assets.gopheratlas.com` and require nonblank alt text. ADR 0013 introduces
an explicit immutable Development policy for only the configured loopback HTTP
`/__dev/assets` base and validated SHA image keys. No package-global policy mutation,
arbitrary host allowance or Production localhost fallback. Go/TS agree on both
policies. Other image hosts and data URLs are rejected. Alt belongs to usage.

The shared fixture suite checks the syntax/safety boundary. Astro uses
the shared plugins and Shiki configuration. P0-3 Admin previews use react-markdown
with GFM, skipHtml, safe URL transforms and controlled-image renderers. The shared
validator provides non-destructive inline feedback; the throwing remark guard is
reserved for build-time validation. Preview never creates a third-party img, even
for unsaved input. UIW is source-only and its default preview module is replaced
by the safe renderer. Production builds reject rehype-raw in the module graph. Go submit/publish
validation must independently enforce this contract; browser validation is not a
security boundary. Go Goldmark/GFM/Footnote validates author biographies and, in P0-2,
every saved/submitted body and Review comment against the same safety rules.
Bodies are at most 512 KiB UTF-8; comments at most 16 KiB. Preview and feedback
parsing use a 200 ms debounce. Source is never automatically rewritten.

P0-5.5 uses one Public processor for Curated rationale, Topic guides, Note bodies
and Draft Preview. A HAST transformation adds bounded code/table wrappers, language
labels/copy controls and safe image/link attributes; it introduces no raw HTML
bypass. Note templates alone add the full TOC, neighboring-note links and published
Note discussion UI. Importer rewrites only parsed image URL spans before re-running
both validators; ordinary links and code fences are never blanket-replaced.
