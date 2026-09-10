# sqlc query sources

Add named SQLite queries here alongside the P0-1 migrations. Run `make generate`
and commit `internal/database/sqlc` with the SQL changes. Bootstrap has no runtime
queries; `make check` exercises the same sqlc configuration against a disposable
fixture. Once real queries exist, it also detects generated output drift.
