-- name: ListTags :many
SELECT * FROM tags WHERE id > sqlc.arg(after_id)
AND (sqlc.arg(search) = '' OR instr(lower(slug), lower(sqlc.arg(search))) > 0
OR instr(lower(name), lower(sqlc.arg(search))) > 0
OR EXISTS (SELECT 1 FROM tag_translations tr WHERE tr.tag_id = tags.id AND tr.locale = 'en' AND instr(lower(tr.name), lower(sqlc.arg(search))) > 0))
ORDER BY id LIMIT sqlc.arg(page_size);

-- name: GetTag :one
SELECT * FROM tags WHERE id = ?;

-- name: CountExistingTags :one
SELECT count(*) FROM tags WHERE id IN (sqlc.slice('ids'));

-- name: CountCuratedContent :one
SELECT count(*) FROM content_items WHERE id IN (sqlc.slice('ids')) AND type = 'curated_article';

-- name: FindTagConflict :one
SELECT count(*) FROM tags WHERE id != sqlc.arg(exclude_id) AND (normalized_name = sqlc.arg(normalized_name) OR slug = sqlc.arg(slug));

-- name: CreateTag :one
INSERT INTO tags(name, normalized_name, slug, description, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *;

-- name: UpdateTag :one
UPDATE tags SET name = ?, normalized_name = ?, description = ?, updated_at = ? WHERE id = ? RETURNING *;

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

-- name: GetTagTranslation :one
SELECT * FROM tag_translations WHERE tag_id = ? AND locale = 'en';

-- name: PutTagTranslation :exec
INSERT INTO tag_translations (tag_id, locale, name, description) VALUES (?, 'en', ?, ?)
ON CONFLICT (tag_id, locale) DO UPDATE SET name = excluded.name, description = excluded.description;

-- name: DeleteTagTranslation :exec
DELETE FROM tag_translations WHERE tag_id = ? AND locale = 'en';

-- name: GetNoteGroup :one
SELECT * FROM note_groups WHERE id = ?;

-- name: GetNoteGroupBySlug :one
SELECT * FROM note_groups WHERE slug = ?;

-- name: ListNoteGroups :many
SELECT * FROM note_groups WHERE id > sqlc.arg(after_id)
AND (sqlc.arg(search) = '' OR instr(lower(slug), lower(sqlc.arg(search))) > 0
OR instr(lower(name), lower(sqlc.arg(search))) > 0 OR instr(lower(name_en), lower(sqlc.arg(search))) > 0)
ORDER BY id LIMIT sqlc.arg(page_size);

-- name: CreateNoteGroup :one
INSERT INTO note_groups (slug, name, description, name_en, description_en, sort_order, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *;

-- name: UpdateNoteGroup :one
UPDATE note_groups SET name = ?, description = ?, name_en = ?, description_en = ?, sort_order = ?, updated_at = ? WHERE id = ? RETURNING *;

-- name: PublishedRevisionUsesGroup :one
SELECT EXISTS (SELECT 1 FROM content_items c JOIN content_revisions r ON r.id = c.published_revision_id AND r.content_id = c.id
WHERE c.type = 'note' AND c.archived_at IS NULL AND json_extract(r.payload_json, '$.groupSlug') = sqlc.arg(slug));

-- name: LegacyNoteGroupSources :many
SELECT c.id AS content_id, 'draft' AS source, d.version AS version, d.payload_json
FROM content_items c JOIN content_drafts d ON d.content_id = c.id WHERE c.type = 'note'
UNION ALL
SELECT c.id AS content_id, 'published' AS source, r.id AS version, r.payload_json
FROM content_items c JOIN content_revisions r ON r.id = c.published_revision_id AND r.content_id = c.id
WHERE c.type = 'note' AND c.archived_at IS NULL
ORDER BY content_id, source;

-- name: GetTaxonomyState :one
SELECT * FROM taxonomy_state WHERE id = 1;

-- name: CompleteTaxonomyUpgrade :execrows
UPDATE taxonomy_state SET ready = 1, source_sha256 = ? WHERE id = 1 AND ready = 0;
