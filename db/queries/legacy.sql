-- Offline importer only. Publication service calls the date update in its own
-- direct-publish transaction; no handler exposes it and no Revision is edited.
-- name: RestoreLegacyPublicationDates :exec
UPDATE content_items SET first_published_at=?,last_published_at=?,created_at=?,updated_at=? WHERE id=?;

-- name: LegacyContentCollision :one
SELECT count(*) FROM content_items c JOIN content_drafts d ON d.content_id=c.id
WHERE c.type=sqlc.arg(content_type) AND d.slug=sqlc.arg(slug);

-- name: LegacyOwnedRoute :one
SELECT count(*) FROM content_routes WHERE path=?;
