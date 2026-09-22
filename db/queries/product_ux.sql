-- Bounded product metadata for IDs already admitted by ListContent policy.
-- No Markdown body is selected, and non-owner Reviewer projections use pending
-- immutable metadata rather than someone else's mutable Draft.
-- name: ProductMetadata :many
SELECT c.id,c.owner_user_id,
d.summary AS draft_summary,d.payload_json AS draft_payload,d.language AS draft_language,d.featured AS draft_featured,
r.summary AS revision_summary,r.payload_json AS revision_payload,r.language AS revision_language,r.featured AS revision_featured,
(SELECT count(*) FROM draft_topic_entries WHERE topic_content_id=c.id) AS draft_entry_count,
(SELECT count(*) FROM revision_topic_entries WHERE topic_revision_id=r.id) AS revision_entry_count
FROM content_items c JOIN content_drafts d ON d.content_id=c.id
LEFT JOIN content_revisions r ON r.id=c.pending_review_revision_id AND r.content_id=c.id
WHERE c.id IN (sqlc.slice('ids')) ORDER BY c.id;

-- name: ProductTags :many
SELECT c.id AS content_id,t.id,t.name,t.slug
FROM content_items c
LEFT JOIN draft_tags d ON d.content_id=c.id AND (sqlc.arg(is_admin) OR c.owner_user_id=sqlc.arg(actor_id))
LEFT JOIN revision_tags r ON r.revision_id=c.pending_review_revision_id AND NOT (sqlc.arg(is_admin) OR c.owner_user_id=sqlc.arg(actor_id))
JOIN tags t ON t.id=COALESCE(d.tag_id,r.tag_id)
WHERE c.id IN (sqlc.slice('ids')) ORDER BY c.id,t.id;

-- name: ProductTopics :many
SELECT target.id AS target_content_id,c.id,
CAST(CASE WHEN sqlc.arg(is_admin) = 1 THEN d.title ELSE r.title END AS TEXT) AS title
FROM content_items c JOIN content_drafts d ON d.content_id=c.id
LEFT JOIN content_revisions r ON r.id=c.published_revision_id AND r.content_id=c.id
LEFT JOIN draft_topic_entries e ON e.topic_content_id=c.id AND sqlc.arg(is_admin)
LEFT JOIN revision_topic_entries p ON p.topic_revision_id=r.id AND NOT sqlc.arg(is_admin)
JOIN content_items target ON target.id=COALESCE(e.target_content_id,p.target_content_id)
WHERE c.type='topic' AND c.archived_at IS NULL AND target.id IN (sqlc.slice('ids'))
ORDER BY target_content_id,c.id LIMIT 10001;
