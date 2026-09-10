# Persistence

`database.go` opens a bounded four-connection modernc SQLite pool with per-connection
DSN PRAGMAs and immediate write transactions. It never runs migrations.
`Ready` checks the applied migration version and required identity columns.

Services call generated `sqlc/` queries directly and own their transactions.
`db/migrations` and `db/queries` are the sources of truth; `make generate` refreshes
output and `make check` verifies drift. See `contracts/data.md` and ADR 0005.
