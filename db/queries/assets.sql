-- name: GetAsset :one
SELECT * FROM assets WHERE id = ?;

-- name: GetAssetByHash :one
SELECT * FROM assets WHERE sha256 = ?;

-- name: ListAssets :many
SELECT * FROM assets WHERE id > sqlc.arg(after_id)
AND (deleted_at IS NULL OR sqlc.arg(include_deleted)) ORDER BY id LIMIT sqlc.arg(page_size);

-- name: CreateAsset :one
INSERT INTO assets(sha256,object_key,mime_type,byte_size,width,height,created_by,created_at)
VALUES (?,?,?,?,?,?,?,?) RETURNING *;

-- name: SetAssetDeleted :one
UPDATE assets SET deleted_at = ? WHERE id = ? RETURNING *;

-- name: GetAssetsByIDs :many
SELECT * FROM assets WHERE id IN (sqlc.slice('ids')) ORDER BY id;
