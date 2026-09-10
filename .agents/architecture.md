# Architecture map

The public and control planes have different availability and trust boundaries:

```text
Private CMS → published snapshot in private R2 → Astro build → static public site
     └─────→ immutable assets in public R2 ─────────────────→ public readers
```

CMS downtime must not break public HTML, search, RSS, sitemap, or assets. Content
belongs in the future CMS, not routine Git commits. About/contribute remain in Git.

Current executable scope: static Web pages with an empty local snapshot fixture,
Admin connection preview, Fiber liveness shell, shared Markdown rules, and tooling.
There are no database tables, authentication, publication jobs, or R2 adapters.
Planned directories are added when implementation needs them; see the phase map.

Dependency direction:

- `apps/web` → shared Markdown; never Admin/API client/private services.
- `apps/admin` → API client and, when the editor arrives, shared Markdown.
- `cmd` → `internal/app` composition → HTTP transport → future services/policy →
  sqlc queries and SQLite transactions. Go code does not import TS packages.
- Shared TS packages never import apps. Generated API types have no business logic.

`internal/app` is the single middleware assembly point. P0-1 will add one shared
Zap logger, an endpoint-specific admin guard, an app-wide Monitor with `Next`, and
Recover after Monitor. Validate real ordering with error/panic/authorization tests.
Do not expose Monitor while authentication is absent.

Contracts own stable semantics. `openapi.yaml` currently describes only liveness
and error envelopes. The snapshot schema is explicitly version 0, accepts empty
arrays only, and must not be mistaken for the production version 1 format.
