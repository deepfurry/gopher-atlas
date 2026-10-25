# Markdown contract

Authoring uses UTF-8 CommonMark + GFM body content. Metadata is held in CMS fields,
not frontmatter. Page templates supply the single H1; bodies use H2–H6.

Supported syntax: paragraphs, emphasis, lists, task lists, blockquotes, links,
controlled images, tables, footnotes, strikethrough, inline/fenced code, autolinks,
inline `$...$` math and standalone `$$` math blocks (Issue #6).
No MDX processing, JSX execution, raw HTML, script, iframe or Mermaid.
Never enable `rehype-raw` or an executable content pipeline.

Shared `remark-math` syntax and the shared `rehype-katex` adapter give Admin and
Public the same formula semantics. Public emits HTML + MathML at build time;
only Admin runs the renderer in its preview. Both bundle matching KaTeX CSS/fonts
locally. Code spans/fences, including a `math` fence, remain code. Unmatched `$5`
and adjacent prices such as `$5 and $10` remain text; escape currency as `\$5`
when mixed with formulas to resolve dollar-delimiter ambiguity. Source is unchanged.

KaTeX uses `trust: false`, bounded macro expansion (1000) and sizes (20 em), with
no persistent/shared macros. TeX URL/image/HTML extension commands do not gain
network or DOM privileges, even for asset-origin images. Malformed TeX falls back
to escaped, readable source instead of failing the document. Formula parse
failures do not relax Markdown safety: Go retains an independent GFM validator,
and TS also inspects the original GFM AST so math cannot conceal forbidden HTML,
headings, links or images. Markdown-like unsafe text inside a formula remains
invalid for saving/publishing. The shared math fixtures lock this boundary.

The independent GFM safety parse escapes only a single standalone `=` inside a
closed top-level `$$` display block, avoiding a false Setext H1. Stored/rendered
source is unchanged. Fenced code cannot open such a block. All other headings
(including `===`), raw HTML, unsafe links and external images inside formulas
remain subject to the same Go/TypeScript checks; math blocks are never skipped.

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
