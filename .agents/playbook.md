# Change workflow

1. Inspect branch/status and preserve pre-existing local changes. Read the current
   scope in `docs/implementation-status.md`, then affected code, contracts and ADRs.
   Sync `dev` and branch from it for daily work. PRs target `dev`; `main` records
   release snapshots. Do not change repository administration settings implicitly.
2. Use narrow existing checks to establish a baseline. `pnpm install --frozen-lockfile`
   and the pinned Go toolchain reproduce dependency inputs without secrets.
3. Change authoritative inputs first: SQL, OpenAPI, schema or tokens. Run
   `make generate` for generated files. Never fix drift by editing generated code.
4. Test observable behavior and safety boundaries. Update the relevant contract
   when behavior changes; use an ADR for decisions expensive to reverse.
5. Run `make check`. This checks formatting, Go analysis/tests/build, TS checks,
   contracts, generation drift, disposable SQL tooling and static build artifacts.
   The final Go build uses freshly built Admin assets and `adminembed`; Linux CI
   also runs `go test -race -tags=adminembed ./...`.
6. Review the full diff, generated changes and dependency additions. Check that
   `.env`, database/log files and build outputs are excluded. Update the changelog
   for notable changes. Commit only coherent, authorized work.
7. Report what actually ran, what passed, and what remains outside the phase.

Run commands from the repository root unless README says otherwise. Tests and
builds must work without OAuth/R2/Cloudflare secrets and without a running CMS.
Go tooling fixtures are disposable and must never point at `DATABASE_PATH`.
