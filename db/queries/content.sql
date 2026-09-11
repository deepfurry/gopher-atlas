-- name: CreateContent :one
INSERT INTO content_items(type, owner_user_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?) RETURNING *;

-- name: GetContent :one
SELECT * FROM content_items WHERE id = ?;

-- name: GetDraft :one
SELECT * FROM content_drafts WHERE content_id = ?;

-- name: CreateDraft :exec
INSERT INTO content_drafts(content_id, byline_user_id, payload_schema_version, payload_json, updated_by, updated_at)
VALUES (?, ?, 1, ?, ?, ?);

-- name: SaveDraft :execrows
UPDATE content_drafts SET cover_asset_id = sqlc.narg(cover_asset_id), title = sqlc.arg(title), slug = sqlc.arg(slug), summary = sqlc.arg(summary), body_markdown = sqlc.arg(body_markdown), byline_user_id = sqlc.arg(byline_user_id), language = sqlc.arg(language), featured = sqlc.arg(featured), seo_title = sqlc.arg(seo_title), seo_description = sqlc.arg(seo_description), payload_schema_version = sqlc.arg(payload_schema_version), payload_json = sqlc.arg(payload_json),
version = version + 1, updated_by = sqlc.arg(updated_by), updated_at = sqlc.arg(updated_at)
WHERE content_id = sqlc.arg(content_id) AND version = sqlc.arg(expected_version);

-- name: MarkDraftEdited :exec
UPDATE content_items SET editorial_state = CASE WHEN editorial_state = 'synced' THEN 'draft' ELSE editorial_state END, updated_at = ? WHERE id = ?;

-- name: SetPendingRevision :exec
UPDATE content_items SET editorial_state = 'in_review', pending_review_revision_id = ?, updated_at = ? WHERE id = ?;

-- name: ClearPendingRevision :exec
UPDATE content_items SET editorial_state = ?, pending_review_revision_id = NULL, updated_at = ? WHERE id = ?;

-- name: PublishRevision :exec
UPDATE content_items SET published_revision_id = sqlc.arg(revision_id), pending_review_revision_id = NULL,
editorial_state = 'synced', first_published_at = COALESCE(first_published_at, sqlc.arg(now)),
last_published_at = sqlc.arg(now), updated_at = sqlc.arg(now) WHERE id = sqlc.arg(id);

-- name: UnpublishContent :exec
UPDATE content_items SET published_revision_id = NULL, pending_review_revision_id = NULL,
editorial_state = 'draft', updated_at = ? WHERE id = ?;

-- name: ArchiveContent :exec
UPDATE content_items SET archived_at = sqlc.arg(now), published_revision_id = NULL,
pending_review_revision_id = NULL, editorial_state = 'draft', updated_at = sqlc.arg(now) WHERE id = sqlc.arg(id);

-- name: RestoreArchive :exec
UPDATE content_items SET archived_at = NULL, editorial_state = 'draft', updated_at = ? WHERE id = ?;

-- name: SnapshotDraft :one
INSERT INTO content_revisions(content_id, revision_no, title, slug, summary, body_markdown, byline_user_id, language, featured, seo_title, seo_description, payload_schema_version, payload_json, cover_asset_id, created_by, created_at)
SELECT d.content_id, (SELECT COALESCE(MAX(r.revision_no), 0) + 1 FROM content_revisions r WHERE r.content_id = d.content_id),
d.title, d.slug, d.summary, d.body_markdown, d.byline_user_id, d.language, d.featured, d.seo_title, d.seo_description, d.payload_schema_version, d.payload_json, d.cover_asset_id, sqlc.arg(actor_id), sqlc.arg(now)
FROM content_drafts d WHERE d.content_id = sqlc.arg(content_id) RETURNING *;

-- name: GetRevision :one
SELECT * FROM content_revisions WHERE content_id = ? AND revision_no = ?;

-- name: GetRevisionByID :one
SELECT * FROM content_revisions WHERE content_id = ? AND id = ?;

-- name: ListRevisions :many
SELECT r.id, r.content_id, r.revision_no, r.title, r.slug, r.byline_user_id, r.created_by, r.created_at, review.decision
FROM content_revisions r LEFT JOIN content_reviews review ON review.revision_id = r.id
WHERE r.content_id = sqlc.arg(content_id) AND r.revision_no > sqlc.arg(after_no)
AND (sqlc.arg(only_revision_id) = 0 OR r.id = sqlc.arg(only_revision_id))
ORDER BY r.revision_no LIMIT sqlc.arg(page_size);

-- name: ListContent :many
SELECT c.*, d.title AS draft_title, r.title AS revision_title, d.byline_user_id AS draft_byline, r.byline_user_id AS revision_byline
FROM content_items c JOIN content_drafts d ON d.content_id = c.id
LEFT JOIN content_revisions r ON r.id = c.pending_review_revision_id AND r.content_id = c.id
WHERE c.id > sqlc.arg(after_id)
AND (c.archived_at IS NULL OR sqlc.arg(include_archived))
AND (sqlc.arg(is_admin) OR c.owner_user_id = sqlc.arg(actor_id)
OR (sqlc.arg(is_reviewer) AND c.editorial_state = 'in_review'))
AND (sqlc.arg(content_type) = '' OR c.type = sqlc.arg(content_type))
AND (sqlc.arg(editorial_state) = '' OR c.editorial_state = sqlc.arg(editorial_state))
AND (sqlc.arg(owner_id) = 0 OR c.owner_user_id = sqlc.arg(owner_id))
AND (sqlc.arg(search) = '' OR instr(lower(CASE WHEN sqlc.arg(is_admin) OR c.owner_user_id = sqlc.arg(actor_id)
THEN d.title || ' ' || d.summary ELSE r.title || ' ' || r.summary END), lower(sqlc.arg(search))) > 0)
ORDER BY c.id LIMIT sqlc.arg(page_size);
