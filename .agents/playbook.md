# Change workflow

1. Inspect branch/status and preserve pre-existing local changes. Read the current
   scope in `docs/implementation-status.md`, then affected code, contracts and ADRs.
   For authorized early development, switch to dev, pull --ff-only, require a
   clean tree and record HEAD. Work/commit/push on dev as requested; main records
   Production release snapshots. Do not change repository administration settings implicitly.
2. Use narrow existing checks to establish a baseline. `pnpm install --frozen-lockfile`
   and the pinned Go toolchain reproduce dependency inputs without secrets.
3. Change authoritative inputs first: SQL, OpenAPI, schema or tokens. Run
   `make generate` for generated files. Never fix drift by editing generated code.
4. Test observable behavior and safety boundaries. Update the relevant contract
   when behavior changes; use an ADR for decisions expensive to reverse.
   Editorial changes need real SQLite race scenarios, relation rollback,
   immutable snapshot/published isolation and transactional Audit checks.
   Never edit migrations 00001/00002; P0-4 adds only 00003 and readiness remains
   read-only at schema 3. Publication tests need job-failure rollback, freshness,
   snapshot privacy and worker recovery with fake external dependencies. UI changes need autosave/409/flush/immutable-review
   tests and a preview test proving external images never produce img elements.
   Verify a fresh embedded build in a browser, including first lazy navigation,
   two-tab conflicts, light/dark and 360 px layouts.
5. Run `make generate`, `make check` and Linux race. Never use real R2/Hook
   credentials or deployment for implementation checks. The gate uses an explicit
   v1 fixture and scans synthetic build secrets. This checks formatting, Go analysis/tests/build, TS checks,
   contracts, generation drift, disposable SQL tooling and static build artifacts.
   The final Go build uses freshly built Admin assets and `adminembed`; Linux CI
   also runs `go test -race -tags=adminembed ./...`.
6. Review the full diff, generated changes and dependency additions. Check that
   `.env`, database/log files and build outputs are excluded. Update the changelog
   for notable changes. Commit only coherent, authorized work.
7. Report what actually ran, what passed, and what remains outside the phase.

For Public work, run the explicit v1 fixture build and inspect actual dist with
`node scripts/check-public-build.mjs`. Test canonical/derived routes, reference and
group conflicts, redirect bounds, Markdown safety and query/result states. Check
all four content types, search, keyboard focus, light/dark, 360px and reduced motion
in a local browser. Do not connect to Production to validate implementation.

Run commands from the repository root unless README says otherwise. Tests and
builds must work without OAuth/R2/Cloudflare secrets and without a running CMS.
Go tooling fixtures are disposable and must never point at `DATABASE_PATH`.

For P0-5.5 use ADR 0012 and operations/legacy-import.md. Preserve migrations 1–3.
Compare Public A-grade surfaces against the actual old site, not a generic style.
Use real legacy content in disposable Development verification before fixture-only
polish. Automated gates remain fake/offline. A separately authorized real apply
uses explicit local author/DB mappings and current R2 config; it is not a Production
cutover. Never report a fake-storage rehearsal as an actual R2 upload.
