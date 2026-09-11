# First staging: Cloudflare Workers Builds (manual, not executed by P0-4)

Keep `apps/web/wrangler.jsonc` name **gopheratlas-web**. Build context is repository
root; initial staging may build **dev** by explicit user request. Future release
snapshots use main. This phase does not synchronize main or change production DNS.

## Manual configuration checklist

1. Review this implementation and back up the private SQLite database. Apply
   migration 00003 explicitly before starting the matching CMS/Admin binary.
2. Prepare separate assets/content R2 buckets. Content remains private: no public
   domain, r2.dev or broad CORS. Configure the controlled assets origin
   `https://assets.gopheratlas.com` separately; do not repoint gopheratlas.com.
   CMS image validation intentionally allows only this controlled assets origin.
3. Issue a bucket-scoped CMS RW S3 credential for both buckets. Put only on the
   private CMS host: R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
   R2_ASSETS_BUCKET, R2_CONTENT_BUCKET, R2_ASSETS_PUBLIC_URL,
   CLOUDFLARE_DEPLOY_HOOK_URL and PUBLIC_SITE_URL. The last value is the staging
   Worker URL. All eight are required in production, alongside identity settings.
4. Connect Workers Builds to the repository/dev. Use pinned Node 24.15.0 and pnpm
   12.3.4. Build command from repository root:
   `pnpm install --frozen-lockfile && pnpm --filter @gopheratlas/web build`.
   Configure the Workers deployment command to use the existing Wrangler config:
   `pnpm exec wrangler deploy --config apps/web/wrangler.jsonc` in the Cloudflare
   environment where Wrangler is supplied. Do not add a runtime CMS dependency.
5. Issue a separate **read-only content-bucket** credential for Web builds. Build
   Secrets: CONTENT_R2_ACCESS_KEY_ID, CONTENT_R2_SECRET_ACCESS_KEY. Build Variables:
   CONTENT_R2_ENDPOINT, CONTENT_R2_BUCKET=gopheratlas-content. Never configure
   CONTENT_SNAPSHOT_FILE there; no silent fixture fallback exists. CMS RW keys
   must never be copied into build/browser environment. Do not prefix secrets
   VITE_/PUBLIC_. Hook URL is a CMS-only secret.
6. Create the staging Deploy Hook and store it only in CMS process configuration.
   Initial builds before the first valid latest.json intentionally fail. Once
   configured, a CMS public mutation creates the first generation; the worker
   uploads snapshot/latest before triggering a build. If earlier offline jobs
   exist, starting a configured worker coalesces and processes the newest one.
7. In private Admin, upload a harmless image, choose a cover/insert with alt, and
   publish a small staging Post. Check job transitions, immutable objects and
   metadata/cache policy. The first published snapshot may contain content but
   P0-4 public pages still show the bootstrap interface (P0-5 renders content).
8. Confirm `/.well-known/gopheratlas-build.json` on the staging Worker: generation
   and snapshotSha256 match latest.json and the CMS desired generation. Hook 2xx
   only means accepted. Check Publication status and a second mutation/rebuild.
9. Test a controlled failure/retry and restart. Never print credentials, Hook URL,
   raw provider responses, OAuth values or browser cookies in a validation report.

No steps above were executed against real Cloudflare/R2 during implementation.
No dashboard/DNS change or live deployment is implied by passing local checks.

## Local build

From root, explicitly choose the committed synthetic fixture with an absolute path
in CONTENT_SNAPSHOT_FILE, then run `pnpm --filter @gopheratlas/web build`.
`make check` selects it automatically and scans synthetic secrets in both output
bundles. The loader writes ignored `apps/web/.generated/published-snapshot.json`
and verifies full schema v1, graph and hash. The final marker has only schemaVersion,
generation, snapshotSha256, builtAt, commitSha and buildId.
