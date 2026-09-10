-- name: GetUser :one
SELECT * FROM users WHERE id = ?;

-- name: GetUserByGitHubID :one
SELECT * FROM users WHERE github_user_id = ?;

-- name: CreateUser :one
INSERT INTO users (github_user_id, github_login, role, status, created_at, updated_at, last_login_at)
VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *;

-- name: RefreshLogin :one
UPDATE users SET github_login = ?, last_login_at = ?, updated_at = ? WHERE id = ? RETURNING *;

-- name: ListUsers :many
SELECT * FROM users WHERE id > sqlc.arg(after_id) ORDER BY id LIMIT sqlc.arg(page_size);

-- name: CountActiveAdmins :one
SELECT count(*) FROM users WHERE role = 'admin' AND status = 'active';

-- name: SetUserAccess :one
UPDATE users SET role = ?, status = ?, updated_at = ? WHERE id = ? RETURNING *;

-- name: CreateProfile :exec
INSERT INTO author_profiles (user_id, slug, display_name, avatar_url, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?);

-- name: GetProfile :one
SELECT * FROM author_profiles WHERE user_id = ?;

-- name: UpdateProfile :one
UPDATE author_profiles SET display_name = ?, bio_markdown = ?, website_url = ?, updated_at = ?
WHERE user_id = ? RETURNING *;
