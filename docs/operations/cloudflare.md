# Production Cloudflare Workers Builds

Environments are Development and Production. Development uses `dev`, persistent local SQLite and FileStore. Tests alone use
explicit fixtures and fake dependencies. Production builds **main**; non-production builds
are disabled. These are user-reported deployed facts (2026-09-11), not settings
changed by the implementation agent.

- Worker: **gopheratlas-web**, unchanged in `apps/web/wrangler.jsonc`.
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
