# GopherAtlas agent entry point

GopherAtlas is a Go knowledge atlas and multi-author Markdown publication.
This repository currently implements **P0-0: engineering foundation only**.

Read `.agents/architecture.md`, `.agents/playbook.md`, relevant `contracts/*`,
and the corresponding ADR before changing an area. Inspect implementation and
tests before assuming a later-phase capability exists.

| Area                              | Responsibility                                              |
| --------------------------------- | ----------------------------------------------------------- |
| `apps/web`                        | Static Astro public publication; no runtime CMS dependency  |
| `apps/admin`                      | React/Vite private editorial UI; shadcn with Base UI only   |
| `packages/markdown`               | Shared Markdown syntax and safety boundary                  |
| `packages/api-client`             | Admin transport and OpenAPI-generated types                 |
| `cmd/gopheratlas-cms`, `internal` | Single Go module; composition, HTTP, future services        |
| `db`, `sqlc.yaml`                 | Versioned goose SQL and sqlc inputs; no business schema yet |
| `contracts`, `docs/decisions`     | Constraints, machine-readable interfaces, durable decisions |

Sources of truth: code/tests → SQL, OpenAPI and JSON Schema inputs → build
configuration → explanatory documentation. Surface disagreements; documentation
does not prove an unimplemented feature exists. The rebuild plan's adopted
architecture and current scope are summarized in `docs/implementation-status.md`.

- Use pnpm and one root Go module. Never introduce another JS lockfile.
- Public uses Astro layouts and React islands only when interaction needs them.
  Never import Admin, its API client, or shadcn into Public.
- Follow `contracts/design.md` and `docs/design-system.md` for both interfaces.
- Services will call sqlc and own transactions; no generic DAO/repository layer.
- No automatic migrations, runtime public CMS API, or external network I/O inside
  publication transactions. No PostgreSQL, Redis, containers, orchestration,
  Turborepo/Nx, or copied legacy generator.
- Do not read/copy local secrets into source, logs, fixtures, or browser bundles.
- Generated artifacts come from their inputs. Record significant changes in ADRs.
- Implement only the requested phase. Do not fill future directories with empty
  abstractions or implement OAuth/content/publication while bootstrapping.

Completion gate: **`make check`**. Report actual commands and results, inspect the
complete diff, and preserve local files. Commit/push only within user authorization.
