# Markdown contract

Authoring uses UTF-8 CommonMark + GFM body content. Metadata is held in CMS fields,
not frontmatter. Page templates supply the single H1; bodies use H2–H6.

Supported syntax: paragraphs, emphasis, lists, task lists, blockquotes, links,
controlled images, tables, strikethrough, inline/fenced code and autolinks.
No MDX processing, JSX execution, raw HTML, script, iframe, Mermaid or KaTeX in P0.
Never enable `rehype-raw` or an executable content pipeline.

`packages/markdown` exports a validator and a shared remark plugin list. Links allow
HTTP(S), mailto, anchors and root-relative paths; protocol-relative URLs, control
characters, backslashes, credential-bearing URLs and unsafe schemes are rejected.
Images, including references, require the exact HTTPS origin
`https://assets.gopheratlas.com` and nonblank alt text. Other image hosts and data
URLs are rejected. Alt text belongs to usage, not the global asset record.

The shared fixture suite checks the syntax/safety boundary. Astro uses
the shared plugins and Shiki configuration. The actual Admin editor/preview,
heading anchors, TOC and copy-code UI belong to P0-3/P0-5. When added, Admin preview
must use the same plugin list and renderer parity fixtures. Go submit/publish
validation must independently enforce this contract; browser validation is not a
security boundary. Go Goldmark/GFM validates author biographies and, in P0-2,
every saved/submitted body and Review comment against the same safety rules.
Bodies are at most 512 KiB UTF-8; comments at most 16 KiB. P0-2 adds no editor UI.
