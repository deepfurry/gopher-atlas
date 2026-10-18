# Third-party notices

## Scope and historical permissions

The root [BSD-3-Clause license](../LICENSE) applies to project-owned code, not
automatically to publication content or third-party assets/code. Keep the notices
below and all applicable dependency licenses when redistributing their material.
This migration does not claim ownership of or relicense these third-party parts.

The previous [DeepFurry MIT license](licenses/DeepFurry-MIT.txt) is preserved for
versions released under it; existing MIT permissions are not withdrawn. The
history/provenance review and the maintainer-authorized scope are recorded in
[ADR 0017](decisions/0017-code-license-and-public-legal-notices.md).

Inherited Public work from gofurry/gopher-atlas at
`e1a623b20389422421a7d808134ee093b28b491d` retains its
[MIT notice](../apps/web/public/licenses/legacy-MIT.txt) (Copyright (c) 2026 gofurry)
and [attribution](../apps/web/public/legacy-attribution.txt). The historical
[Sora](../apps/web/public/licenses/Sora-OFL.txt) and
[Plus Jakarta Sans](../apps/web/public/licenses/PlusJakartaSans-OFL.txt) OFL notices
remain intact even though those fonts and the compass artwork are no longer used.

Original writing and editorial commentary remain with their authors/rights holders
under any explicit content-specific permissions. External curated articles remain
with their original rights holders; links and excerpts do not grant a new license.

## shadcn/ui

The Admin Button is adapted from shadcn/ui, under the MIT License:

Copyright (c) 2023 shadcn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

Other dependency licenses remain with their packages, including Admin's self-hosted
Geist font distribution.

## Current Public assets

Public uses [IBM Plex](https://github.com/IBM/plex) Sans Latin 400/500/600 and
Mono Latin 400, distributed by @fontsource 5.3.0 and self-hosted as WOFF2 with
font-display: swap. Its [SIL OFL 1.1](../apps/web/public/licenses/IBM-Plex-OFL.txt)
ships in Public output. No remote font service or CJK font download is used.

Regular SVGs from [Phosphor Icons](https://github.com/phosphor-icons/core) 2.1.1
are compiled into HTML; [MIT license](../apps/web/public/licenses/Phosphor-MIT.txt)
ships with the site. Motion 14.1.0 and StyleX 0.19.1 retain package MIT notices.

The monochrome Bluesky sharing mark comes from
[Simple Icons](https://github.com/simple-icons/simple-icons/blob/develop/icons/bluesky.svg),
whose icon data uses [CC0 1.0](https://github.com/simple-icons/simple-icons/blob/develop/LICENSE.md).
Brand trademarks remain with their owners; inclusion does not imply endorsement.
X, Reddit and link icons use the existing Phosphor distribution. The Hacker News
button uses a plain Y mark. The default OG artwork is project-owned vector art;
it does not reuse the homepage's third-party background photograph.

The user supplied background.avif for the homepage: actual AVIF/AV1, 1920×1080,
60,533 bytes, preserved without recompression. The supplied listing source is
[Wallhaven 0jz7gm](https://wallhaven.cc/w/0jz7gm). Wallhaven is the listing source,
not an identified original creator. The original creator and permission for use
on a public website remain unverified; no authorization is claimed. This image
is explicitly outside the BSD-3-Clause license. It is retained unchanged in this
task, pending the maintainer's rights verification. No alternate fallback is shipped.

The earlier compass/Sora/Plus Jakarta Sans assets are no longer loaded or shipped.
Historical MIT/OFL notices remain for inherited work; the legacy generator was
never included. Admin's existing fonts, UI provenance and licenses are unchanged.
