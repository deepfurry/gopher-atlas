# GopherAtlas agent entry point

GopherAtlas is a Go knowledge atlas and multi-author Markdown publication.
This repository implements **P0-3: Admin Editorial UX**, on the existing P0-1/P0-2
runtime and editorial domain. External publication remains deferred.
Daily work branches from latest `dev` and returns there by PR. `main` is a release
snapshot; never develop directly on either integration branch.

Read `.agents/architecture.md`, `.agents/playbook.md`, relevant `contracts/*`,
and the corresponding ADR before changing an area. Inspect implementation and
tests before assuming a later-phase capability exists.

| Area                                 | Responsibility                                                 |
| ------------------------------------ | -------------------------------------------------------------- |
| `apps/web`                           | Static Astro public publication; no runtime CMS dependency     |
| `apps/admin`                         | React/Vite private editorial UI; shadcn with Base UI only      |
| `packages/markdown`                  | Shared Markdown syntax and safety boundary                     |
| `packages/api-client`                | Admin transport and OpenAPI-generated types                    |
| `cmd/gopheratlas-cms`, `internal`    | Single Go module; runtime, identity, policy, HTTP and embed    |
| `internal/content`, `internal/audit` | Editorial transactions, immutable history and safe audit       |
| `db`, `sqlc.yaml`                    | Immutable goose identity/editorial migrations and sqlc queries |
| `contracts`, `docs/decisions`        | Constraints, machine-readable interfaces, durable decisions    |

Sources of truth: code/tests → SQL, OpenAPI and JSON Schema inputs → build
configuration → explanatory documentation. Surface disagreements; documentation
does not prove an unimplemented feature exists. The rebuild plan's adopted
architecture and current scope are summarized in `docs/implementation-status.md`.

- Use pnpm and one root Go module. Never introduce another JS lockfile.
- Public uses Astro layouts and React islands only when interaction needs them.
  Never import Admin, its API client, or shadcn into Public.
- Follow `contracts/design.md` and `docs/design-system.md` for both interfaces.
- Services call sqlc directly. Immediate SQLite transactions protect bootstrap,
  actor reauthorization, last-active-Admin and editorial invariants; no DAO wrapper.
- Draft writes require expected version and replace fields/tags/topic entries
  atomically. Revisions/reviews are immutable. Reviewed publish selects the exact
  pending Revision; route ownership is permanent. See ADR 0006 and contracts/data.md.
- Significant mutations and safe Audit append share a transaction; Draft save has
  no Audit. Never put Markdown, review comments, payloads or credentials in Audit.
- No automatic migrations, runtime public CMS API, or external network I/O inside
  publication transactions. No PostgreSQL, Redis, containers, orchestration,
  Turborepo/Nx, or copied legacy generator.
- Do not read/copy local secrets into source, logs, fixtures, or browser bundles.
- Generated artifacts come from their inputs. Record significant changes in ADRs.
- State/Session/CSRF persist hashes only. No raw provider errors, callback query,
  credentials, body, cookies or untrusted request IDs in logs. Follow the exact
  guard → app-wide Monitor → Recover order in `internal/app`.
- `make dev-cms` explicitly loads optional `.env` without replacing process env;
  tests/checks/migrations do not load it. Production runs with process env only.
- P0-3 adds no migration: preserve 00001/00002 and schema version 2.
- Admin features consume server action projections. One autosave queue owns full
  snapshots/versions; a conflict requires explicit reload. No browser Draft storage.
- Preview never creates uncontrolled image elements, even before a save. UIW is
  source-only; the production module graph excludes raw HTML preview. See ADR 0007.
- Publish ends at SQLite pointer + route + Audit. UI says Published in CMS.
  Assets/R2/generation/jobs/snapshots/hooks are P0-4. Import/deploy remain deferred.

Completion gate: **`make check`**. Report actual commands and results, inspect the
complete diff, and preserve local files. Commit/push only within user authorization.
Run `make generate` for SQL/OpenAPI changes. `make build-cms` builds Admin then
compiles with `adminembed`; plain Go tooling intentionally has no production SPA.
