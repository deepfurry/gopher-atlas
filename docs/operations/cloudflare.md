# Cloudflare boundary (deferred)

Public deployment will use Workers Static Assets and Workers Builds with repository
root as build context. Configure Node from `.node-version` (currently 24.15.0) and
pnpm from root packageManager. The local `pnpm --filter @gopheratlas/web build`
already works without Cloudflare; it only builds the version 0 empty fixture.
There is intentionally no production deploy script in P0-1.

P0-4/P0-5 must replace the fixture with validated published R2 content, add reviewed
deploy commands and verify the generated workspace on Workers. Build secrets use
the separate `gopheratlas-web-build` RO content credential. The CMS uses RW S3
credentials. Never expose deploy-hook URLs or S3 credentials through PUBLIC_/VITE_
variables. `gopheratlas-content` stays private with no domain/r2.dev/CORS; public
immutable assets use `assets.gopheratlas.com`.

OAuth, R2 endpoint/keys, hook URL, account/build configuration, private DNS and
production paths are manual inputs. Do not invent or commit their values.
