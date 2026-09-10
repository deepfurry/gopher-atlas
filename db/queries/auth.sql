-- name: CreateState :exec
INSERT INTO oauth_states (state_hash, created_at, expires_at) VALUES (?, ?, ?);

-- name: ConsumeState :execrows
UPDATE oauth_states SET consumed_at = sqlc.arg(now)
WHERE state_hash = sqlc.arg(state_hash) AND consumed_at IS NULL AND expires_at > sqlc.arg(now);

-- name: CleanupStates :exec
DELETE FROM oauth_states WHERE expires_at <= ?;

-- name: CreateSession :one
INSERT INTO sessions (user_id, token_hash, csrf_token_hash, created_at, expires_at, last_seen_at)
VALUES (?, ?, ?, ?, ?, ?) RETURNING *;

-- name: GetSession :one
SELECT * FROM sessions WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?;

-- name: TouchSession :exec
UPDATE sessions SET last_seen_at = ? WHERE id = ? AND last_seen_at < ? AND revoked_at IS NULL;

-- name: RevokeSession :exec
UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL;

-- name: RevokeUserSessions :exec
UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL;

-- name: CleanupSessions :exec
DELETE FROM sessions WHERE expires_at <= ?;
