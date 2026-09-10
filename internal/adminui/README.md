# Admin embedding boundary

P0-0 builds `apps/admin/dist` as a standalone local preview. No unauthenticated SPA
is served by the CMS. P0-1 will copy that build into this directory's ignored
`dist/` and add `embed.go` plus explicit asset/SPA routing tests. A clean checkout
must continue to pass `go test ./...` without a prior frontend build.

Do not let the SPA fallback handle `/api/*`, `/ops/*`, `/healthz`, or `/readyz`.
