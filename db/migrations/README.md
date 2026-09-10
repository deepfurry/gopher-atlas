# Versioned goose migrations

`00001_identity.sql` creates P0-1 users, author profiles, hashed sessions and OAuth
states. Never rewrite it after merge/release; add the next sequential migration.
CMS startup/readiness never invokes goose.

`make db-status` / `make db-up` require an explicit DATABASE_PATH and use the pinned
goose SQLite driver. Tests apply real up/down migrations only to temporary DBs.
The disposable tooling fixture also remains part of make check.
