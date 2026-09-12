# GopherAtlas agent entry point

GopherAtlas is a Go knowledge atlas and multi-author Markdown publication.
This repository implements **P0-5.5: Product Realignment & Legacy-Ready Rebuild**, on the existing publication pipeline.
During early development the user authorizes work on clean, synchronized `dev`;
commit/push there within task authorization. Never modify `main`, the Production
release snapshot. Development and Production are the only environments.
Production operations require a separate request; use no production credentials.

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
- Admin is Chinese-only, with Phosphor icons and shared Base UI wrappers. Use
  centralized presentation mappings and ADR 0010; preserve server permissions,
  full-snapshot autosave and safe preview. Only theme/sidebar preferences persist.
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
  dev-web/dev use the same precedence. Only Development Web entry points may
  fill missing CONTENT_R2_* from corresponding CMS R2_*; explicit fixture wins.
  Build/Production never load root .env or use fallback. Tests use synthetic env
  files only. `make dev` owns/cleans all child trees; it never migrates the DB.
- ADR 0011: Development watches the configured content bucket; only changed,
  validated generations restart Public. CMS/Admin survive controlled restarts.
  Explicit fixtures disable watching. The local Draft preview POST route is
  injected only by Astro dev, reuses Public rendering and never persists data,
  advances generation or performs storage I/O. Production excludes the capability.
- Preserve migrations 00001–00003 and schema version 3. No auto migration.
- Public routes use snapshot canonicalPath. Derived pages/indexes fail on broken
  references or route/group conflicts. Redirect overflow fails, never truncates.
  See ADR 0009; no Public runtime CMS/R2/API or backend contract expansion.
- Admin features consume server action projections. One autosave queue owns full
  snapshots/versions; a conflict requires explicit reload. No browser Draft storage.
- Preview never creates uncontrolled image elements, even before a save. UIW is
  source-only; the production module graph excludes raw HTML preview. See ADR 0007.
- Public mutations atomically commit business state + Audit + generation/job.
  Worker R2/Hook I/O is outside transactions. Public mutations take the shared
  publication fence BEFORE their transaction; see ADR 0008. One active writer only.
- Cover belongs to the full Draft snapshot; assets/generation snapshots are
  immutable and only latest.json is mutable. Never physically delete assets.
- Snapshot v1 exports selected published Revisions only. Web requires explicit
  fixture or private R2 read-only input, no silent fallback or browser credentials.
- UI says Published in CMS with independent marker status. P0-5 builds Public
  routes/search/SEO from snapshot v1 only. P0-5.5 imports Development legacy content; P0-6 Production migration/cutover remains deferred.

Completion gate: **`make check`**. Report actual commands and results, inspect the
complete diff, and preserve local files. Commit/push only within user authorization.
Run `make generate` for SQL/OpenAPI changes. `make build-cms` builds Admin then
compiles with `adminembed`; plain Go tooling intentionally has no production SPA.

Product alignment: curated_article / topic / note are the normal workflows; post
is compatibility-only. Read ADR 0012 before product/import changes. Topic targets
must be Curated; Note group metadata is payload-derived and consistent. Legacy
logo/visuals/interactions are acceptance criteria. Import plan is read-only; apply
uses existing Asset/Content services and explicit author mapping, never raw SQL
content insertion or relaxed Markdown safety. No migration is needed for P0-5.5.
