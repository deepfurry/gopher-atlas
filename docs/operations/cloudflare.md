# Production Cloudflare Workers Builds

Environments are Development and Production. Development uses `dev`, persistent local SQLite and FileStore. Tests alone use
explicit fixtures and fake dependencies. Production builds **main**; non-production builds
are disabled. These are user-reported deployed facts (2026-09-11), not settings
changed by the implementation agent.

- Worker: **gopheratlas-web**, unchanged in `apps/web/wrangler.jsonc`.
- Prepared on dev (2026-10-19): the statistics Worker entry and D1 binding keep
  Static Assets at `./dist`; only `/api/stats` and `/api/stats/*` run Worker-first.
  Read/sync switches are false and Cron is empty. This is not a deployment record.
- `gopheratlas-content`: private R2, no public domain or browser access.
- `gopheratlas-assets`: `https://assets.gopheratlas.com`.
- Web Build: separate content-bucket **read-only** credential.
- CMS: assets/content **read/write** credential and Production Deploy Hook.

Repository-root Build command:

```sh
pnpm --filter @gopheratlas/web build
```

Configured deploy command (operator/Cloudflare only):

```sh
npx wrangler deploy --config apps/web/wrangler.jsonc
```

The existing command remains compatible with the prepared Worker entry: Wrangler
bundles it after the unchanged Astro build produces `dist`. Root package.json pins
Wrangler; `pnpm exec wrangler deploy --config apps/web/wrangler.jsonc` is the
equivalent explicitly pinned command. No custom Wrangler build step, remote
migration or CMS action is added to Workers Builds. See the single
[statistics release checklist](statistics.md#maintainer-production-release-checklist).

Local dry-run uses the same config and synthetic static build, with credentials
absent, metrics disabled and dotenv loading disabled. It checks bundling and
binding declarations only; it does not prove remote D1 schema or permissions.

Use pinned Node 24.15.0 and pnpm 12.3.4; installation must preserve the frozen
lockfile. Build Secrets are CONTENT_R2_ACCESS_KEY_ID and
CONTENT_R2_SECRET_ACCESS_KEY. Build Variables are CONTENT_R2_ENDPOINT and
CONTENT_R2_BUCKET=gopheratlas-content. Never set CONTENT_SNAPSHOT_FILE in
Production, prefix credentials with PUBLIC_/VITE_, or reuse CMS RW credentials.
The Hook belongs only in the CMS environment file. PUBLIC_SITE_URL points at the
current Production Worker origin; binding gopheratlas.com is a separate P0-6 task.

## Production acceptance (2026-09-22)

Real CMS login, health/readiness and immutable Asset upload/read have succeeded.
The operator has now published generation 1: the Admin screenshot shows desired
and public generation 1 with synced status, and the Worker homepage is accessible.
A Hook 2xx alone means accepted, not deployed. Independent marker hash comparison
and detailed public-route checks are still pending. See the
[verified Production runbook](production-runbook.md) for evidence and commands. Initial builds without valid latest.json fail closed. A configured CMS
can immediately process existing queued jobs; never use it as a local smoke test.

No implementation check accesses real R2/Hook/OAuth or changes Cloudflare/DNS.
ADR 0015 cancels Production legacy import: the blog starts afresh. Remaining
cutover work covers the domain and new-site verification, preserving existing
Production data. Backup success does not claim a completed restore drill.

## Local build

From root, set CONTENT_SNAPSHOT_FILE to the absolute path of
`tests/fixtures/content-snapshot-v1.json`, then run the same Web build command.
`make check` selects it explicitly and scans synthetic secrets in output.
The loader validates pointer/hash/schema/graph before writing ignored
`apps/web/.generated/published-snapshot.json`. Missing or corrupt input fails;
there is no automatic fixture fallback and no private credential in Astro/browser
code. The public marker contains only schemaVersion, generation, snapshotSha256,
builtAt, commitSha and buildId.

## Public resources and sharing

`favicon.svg` remains the source for PNG/ICO/Apple icon resources. The default
1200×630 OG artwork is `src/assets/og-default.svg`, rasterized to
`public/images/og-default.png`. `node scripts/generate-public-images.mjs` explicitly
regenerates them locally using Astro's existing Sharp dependency; publication
builds only copy the committed outputs. Text rasterization uses the SVG's font
stack available on the generating machine. A cover's actual MIME type/dimensions
override the default image; original body language and canonical routes remain.

`/.well-known/security.txt` uses the maintainer-confirmed email and expires on
**2027-10-01 UTC**. Review/renew its contact and expiry before then; do not invent a
bounty or disclosure policy. `llms.txt` is a short list of actual public links,
not a content dump or ranking promise. The build gate verifies its local targets.

Share links use static platform intents (X, Reddit, Bluesky and Hacker News),
plus the existing Clipboard/Toast. They share the current public GopherAtlas
locale path, excluding query/fragment, never the curated source URL. Draft preview
does not render share controls. External service completion remains user-driven.
Sources: [Bluesky intent](https://bsky.app/profile/bsky.app/post/3kmjboaopvn2f),
[HN bookmarklet](https://news.ycombinator.com/bookmarklet.html),
[RFC 9116](https://www.rfc-editor.org/rfc/rfc9116.html).
