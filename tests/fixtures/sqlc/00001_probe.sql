-- Tooling fixture only. Never part of the application migration directory.
-- +goose Up
CREATE TABLE bootstrap_probe (id INTEGER PRIMARY KEY);

-- +goose Down
DROP TABLE bootstrap_probe;
