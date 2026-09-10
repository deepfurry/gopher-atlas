# 0001 — Static publication and private control plane

Date: 2026-09-10. Status: Accepted.

Content maintenance must no longer depend on Git commits, while public reading
must survive private infrastructure downtime. Adopt the supplied Platform Rebuild
Implementation Plan's two planes in one pnpm workspace and one root Go module.

Astro 6 statically renders the public publication. React 19 islands are introduced
only for interactions. A separate React/Vite Admin will be embedded in Go/Fiber v3.
Shared Markdown rules and generated API types can evolve atomically with the apps.
SQLite/sqlc/goose will supply persistence. Do not add orchestration or extra services.

A runtime headless-CMS public site would couple reader availability to the private
server. A Git-based editorial workflow repeats the original maintenance problem.
The old handwritten generator is not reused. Separate repositories would add
coordination cost for the initially shared ownership and contract changes.

Consequence: content publication eventually needs a snapshot/build pipeline and
has build latency. Public and Admin need different design systems despite sharing
languages. P0-0 supplies executable skeletons only; later phases supply content.

The engineering context adapts the responsibilities of
[agent-engineering-template](https://github.com/deepfurry/agent-engineering-template)
(reviewed 2026-09-10): a concise router, relevant contracts, executable gates and
durable decisions. Its generic application layers are not copied into this system.
