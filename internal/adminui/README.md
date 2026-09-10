# Admin embedding

`pnpm --filter @gopheratlas/admin build` builds `apps/admin/dist` and copies it into
this directory's owned, ignored `dist/`. `make build-cms` then compiles the CMS with
`-tags=adminembed`. The tag embeds real assets and fails if they are absent.

Plain Go tooling selects the development variant: no generated assets required,
SPA returns 503, and Vite provides the local UI. `make check` validates ordinary Go
code, builds frontend assets, runs tagged embed/route tests and compiles the final
production binary. No generated assets are committed, and production needs no Node.

SPA fallback excludes `/api`, `/ops`, `/healthz` and `/readyz`, including subpaths.
Missing assets remain 404. Index/routes use no-store; hashed assets are immutable.
