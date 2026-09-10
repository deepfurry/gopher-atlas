# sqlc query sources

`users.sql` and `auth.sql` define real identity/session operations. Services own
transactions; generated code has no manual business logic. Use named parameters
consistently within statements that reuse a parameter (avoid mixing anonymous `?`
and named args in SQLite sqlc statements).

Run `make generate` and commit `internal/database/sqlc` with SQL changes. `make check`
regenerates into an isolated directory and compares all generated files for drift.
