# Versioned goose migrations

The first application migration belongs to P0-1. Do not invent business tables or
an empty production migration for bootstrap. Files will use sequential names such
as `00001_identity.sql` with `-- +goose Up` and `-- +goose Down` annotations.
Never rewrite a released migration. Startup never invokes goose.

`make db-status` and `make db-up` require an explicit `DATABASE_PATH` and use the
pinned goose SQLite driver. Checks only migrate a disposable tooling fixture.
