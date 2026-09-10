-- +goose Up
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    github_user_id INTEGER NOT NULL UNIQUE CHECK (github_user_id > 0),
    github_login TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'reviewer', 'editor')),
    status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'disabled')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_login_at INTEGER
);
CREATE INDEX users_active_admins ON users(status, role);

CREATE TABLE author_profiles (
    user_id INTEGER PRIMARY KEY REFERENCES users(id),
    slug TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    bio_markdown TEXT NOT NULL DEFAULT '',
    avatar_url TEXT NOT NULL DEFAULT '',
    website_url TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE sessions (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    token_hash BLOB NOT NULL UNIQUE CHECK (length(token_hash) = 32),
    csrf_token_hash BLOB NOT NULL CHECK (length(csrf_token_hash) = 32),
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL CHECK (expires_at > created_at),
    last_seen_at INTEGER NOT NULL,
    revoked_at INTEGER
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX sessions_expiry ON sessions(expires_at);

CREATE TABLE oauth_states (
    state_hash BLOB PRIMARY KEY NOT NULL CHECK (length(state_hash) = 32),
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL CHECK (expires_at > created_at),
    consumed_at INTEGER
);
CREATE INDEX oauth_states_expiry ON oauth_states(expires_at);

-- +goose Down
DROP TABLE oauth_states;
DROP TABLE sessions;
DROP TABLE author_profiles;
DROP TABLE users;
