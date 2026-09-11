-- name: GetRoute :one
SELECT * FROM content_routes WHERE path = ?;

-- name: ContentRoutes :many
SELECT * FROM content_routes WHERE content_id = sqlc.arg(content_id) AND id > sqlc.arg(after_id)
ORDER BY id LIMIT sqlc.arg(page_size);

-- name: DemoteCanonical :exec
UPDATE content_routes SET kind = 'redirect' WHERE content_id = ? AND kind = 'canonical';

-- name: ClaimCanonical :exec
INSERT INTO content_routes(content_id, path, kind, created_at) VALUES (?, ?, 'canonical', ?)
ON CONFLICT(path) DO UPDATE SET kind = 'canonical';

-- name: ResolveRoute :one
SELECT original.content_id, original.kind, canonical.path AS canonical_path, c.published_revision_id, c.archived_at
FROM content_routes original JOIN content_items c ON c.id = original.content_id
JOIN content_routes canonical ON canonical.content_id = c.id AND canonical.kind = 'canonical'
WHERE original.path = ?;
