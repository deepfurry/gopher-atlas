-- The public projection exclusively selects immutable published revisions.
-- name: CountPublishedContent :one
SELECT count(*) FROM content_items WHERE published_revision_id IS NOT NULL AND archived_at IS NULL;

-- name: ExportPublishedContent :many
SELECT c.type, c.first_published_at, c.last_published_at, r.*,
(SELECT path FROM content_routes WHERE content_id=c.id AND kind='canonical') AS canonical_path
FROM content_items c JOIN content_revisions r ON r.id=c.published_revision_id AND r.content_id=c.id
WHERE c.published_revision_id IS NOT NULL AND c.archived_at IS NULL AND c.id > sqlc.arg(after_id)
ORDER BY c.id LIMIT sqlc.arg(page_size);

-- name: ExportPublishedRoutes :many
SELECT r.path,r.kind,r.content_id FROM content_routes r JOIN content_items c ON c.id=r.content_id
WHERE c.published_revision_id IS NOT NULL AND c.archived_at IS NULL AND r.path > sqlc.arg(after_path)
ORDER BY r.path LIMIT sqlc.arg(page_size);
