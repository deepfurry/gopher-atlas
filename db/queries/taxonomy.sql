-- name: ListTags :many
SELECT * FROM tags WHERE id > sqlc.arg(after_id) ORDER BY id LIMIT sqlc.arg(page_size);

-- name: GetTag :one
SELECT * FROM tags WHERE id = ?;

-- name: CountExistingTags :one
SELECT count(*) FROM tags WHERE id IN (sqlc.slice('ids'));

-- name: CountCuratedContent :one
SELECT count(*) FROM content_items WHERE id IN (sqlc.slice('ids')) AND type = 'curated_article';

-- name: PublishedNoteGroupMetadata :many
SELECT r.payload_json FROM content_items c JOIN content_revisions r ON r.id=c.published_revision_id AND r.content_id=c.id
WHERE c.type='note' AND c.archived_at IS NULL AND c.id != sqlc.arg(content_id)
AND json_extract(r.payload_json, '$.groupSlug') = sqlc.arg(group_slug);

-- name: FindTagConflict :one
SELECT count(*) FROM tags WHERE id != sqlc.arg(exclude_id) AND (normalized_name = sqlc.arg(normalized_name) OR slug = sqlc.arg(slug));

-- name: CreateTag :one
INSERT INTO tags(name, normalized_name, slug, description, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *;

-- name: UpdateTag :one
UPDATE tags SET name = ?, normalized_name = ?, slug = ?, description = ?, updated_at = ? WHERE id = ? RETURNING *;

-- name: DraftTagIDs :many
SELECT tag_id FROM draft_tags WHERE content_id = ? ORDER BY tag_id;

-- name: RevisionTagIDs :many
SELECT tag_id FROM revision_tags WHERE revision_id = ? ORDER BY tag_id;

-- name: DeleteDraftTags :exec
DELETE FROM draft_tags WHERE content_id = ?;

-- name: AddDraftTag :exec
INSERT INTO draft_tags(content_id, tag_id) VALUES (?, ?);

-- name: SnapshotTags :exec
INSERT INTO revision_tags(revision_id, tag_id) SELECT sqlc.arg(revision_id), tag_id FROM draft_tags WHERE content_id = sqlc.arg(content_id);

-- name: DraftTopicEntries :many
SELECT position, target_content_id FROM draft_topic_entries WHERE topic_content_id = ? ORDER BY position;

-- name: RevisionTopicEntries :many
SELECT position, target_content_id FROM revision_topic_entries WHERE topic_revision_id = ? ORDER BY position;

-- name: DeleteDraftTopicEntries :exec
DELETE FROM draft_topic_entries WHERE topic_content_id = ?;

-- name: AddDraftTopicEntry :exec
INSERT INTO draft_topic_entries(topic_content_id, position, target_content_id) VALUES (?, ?, ?);

-- name: SnapshotTopicEntries :exec
INSERT INTO revision_topic_entries(topic_revision_id, position, target_content_id)
SELECT sqlc.arg(revision_id), position, target_content_id FROM draft_topic_entries WHERE topic_content_id = sqlc.arg(content_id);

-- name: UnpublishableTopicTargets :one
SELECT count(*) FROM revision_topic_entries e JOIN content_items c ON c.id = e.target_content_id
WHERE e.topic_revision_id = ? AND (c.type != 'curated_article' OR c.published_revision_id IS NULL OR c.archived_at IS NOT NULL);
