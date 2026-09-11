-- name: AuthorSummaries :many
SELECT user_id, slug, display_name, avatar_url FROM author_profiles
WHERE user_id IN (sqlc.slice('ids')) ORDER BY user_id;

-- name: ListAuthors :many
SELECT user_id, slug, display_name, avatar_url FROM author_profiles
WHERE user_id > sqlc.arg(after_id)
AND (sqlc.arg(search) = '' OR instr(lower(display_name), lower(sqlc.arg(search))) > 0 OR instr(slug, lower(sqlc.arg(search))) > 0)
ORDER BY user_id LIMIT sqlc.arg(page_size);

-- name: GetReviewByID :one
SELECT * FROM content_reviews WHERE id = ?;

-- name: LatestContentReview :one
SELECT * FROM content_reviews WHERE content_id = ? ORDER BY id DESC LIMIT 1;

-- name: RevisionLabels :many
SELECT id, title, revision_no FROM content_revisions WHERE id IN (sqlc.slice('ids'));

-- name: GetTagsByIDs :many
SELECT * FROM tags WHERE id IN (sqlc.slice('ids')) ORDER BY id;

-- name: TopicTargetSummaries :many
SELECT c.*, d.title AS draft_title, p.title AS published_title, r.title AS pending_title
FROM content_items c JOIN content_drafts d ON d.content_id=c.id
LEFT JOIN content_revisions p ON p.id=c.published_revision_id AND p.content_id=c.id
LEFT JOIN content_revisions r ON r.id=c.pending_review_revision_id AND r.content_id=c.id
WHERE c.id IN (sqlc.slice('ids'));
