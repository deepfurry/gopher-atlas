# Persistence boundary

No database is opened in P0-0. P0-1 adds `database/sql` with `modernc.org/sqlite`,
connection pragmas, explicit goose migrations, and sqlc output in `sqlc/`.
Application services call generated queries and own transactions directly;
there is no generic repository/DAO wrapper. See `contracts/data.md`.
