-- name: CreateReview :one
INSERT INTO content_reviews(content_id, revision_id, reviewer_user_id, decision, comment_markdown, created_at)
VALUES (?, ?, ?, ?, ?, ?) RETURNING *;

-- name: GetRevisionReview :one
SELECT * FROM content_reviews WHERE revision_id = ?;

-- name: ListReviewHistory :many
SELECT * FROM content_reviews WHERE id > sqlc.arg(after_id) ORDER BY id LIMIT sqlc.arg(page_size);

-- name: ListPendingReviews :many
SELECT r.id, r.content_id, r.revision_no, r.title, r.byline_user_id, r.created_at, c.owner_user_id
FROM content_items c JOIN content_revisions r ON r.id = c.pending_review_revision_id AND r.content_id = c.id
WHERE r.id > sqlc.arg(after_id) AND c.editorial_state = 'in_review' AND c.archived_at IS NULL
AND (sqlc.arg(is_admin) OR (c.owner_user_id != sqlc.arg(actor_id) AND r.byline_user_id != sqlc.arg(actor_id)))
ORDER BY r.id LIMIT sqlc.arg(page_size);
