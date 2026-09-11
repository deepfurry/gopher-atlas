-- name: AppendAudit :exec
INSERT INTO audit_events(actor_user_id, action, entity_type, entity_id, revision_id, metadata_json, request_id, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?);

-- name: ListAudit :many
SELECT * FROM audit_events WHERE id > sqlc.arg(after_id) ORDER BY id LIMIT sqlc.arg(page_size);
