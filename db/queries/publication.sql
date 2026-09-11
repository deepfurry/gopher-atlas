-- name: GetSiteState :one
SELECT * FROM site_state WHERE id=1;

-- name: IncrementGeneration :one
UPDATE site_state SET publication_generation=publication_generation+1, updated_at=? WHERE id=1 RETURNING publication_generation;

-- name: CreatePublicationJob :one
INSERT INTO publication_jobs(generation,created_at,updated_at) VALUES (?,?,?) RETURNING *;

-- name: PublishedContentBylineExists :one
SELECT EXISTS(SELECT 1 FROM content_items c JOIN content_revisions r ON r.id=c.published_revision_id AND r.content_id=c.id
WHERE c.archived_at IS NULL AND r.byline_user_id=?) AS found;

-- name: PublishedRevisionUsesTag :one
SELECT EXISTS(SELECT 1 FROM content_items c JOIN revision_tags t ON t.revision_id=c.published_revision_id
WHERE c.archived_at IS NULL AND t.tag_id=?) AS found;

-- name: GetPublicationJob :one
SELECT * FROM publication_jobs WHERE id=?;

-- name: LatestPublicationJob :one
SELECT * FROM publication_jobs ORDER BY generation DESC LIMIT 1;

-- name: ListPublicationJobs :many
SELECT * FROM publication_jobs WHERE id > sqlc.arg(after_id) ORDER BY id LIMIT sqlc.arg(page_size);

-- name: SupersedePublicationJobs :exec
UPDATE publication_jobs SET state='superseded',next_attempt_at=NULL,updated_at=sqlc.arg(now)
WHERE generation < sqlc.arg(generation) AND state IN ('pending','snapshot_uploaded','failed');

-- name: MarkSnapshotUploaded :execrows
UPDATE publication_jobs SET state='snapshot_uploaded',snapshot_key=?,snapshot_sha256=?,last_error='',next_attempt_at=NULL,updated_at=?
WHERE id=? AND state IN ('pending','failed');

-- name: MarkBuildTriggered :execrows
UPDATE publication_jobs SET state='build_triggered',last_error='',next_attempt_at=NULL,updated_at=sqlc.arg(now),triggered_at=sqlc.arg(now)
WHERE id=sqlc.arg(id) AND state IN ('snapshot_uploaded','failed');

-- name: FailPublicationJob :execrows
UPDATE publication_jobs SET state='failed',attempts=attempts+1,last_error=?,next_attempt_at=?,updated_at=?
WHERE id=? AND state IN ('pending','snapshot_uploaded','failed');

-- name: RetryPublicationJob :execrows
UPDATE publication_jobs SET state=CASE WHEN snapshot_key IS NULL THEN 'pending' ELSE 'snapshot_uploaded' END,
attempts=0,last_error='',next_attempt_at=NULL,updated_at=? WHERE id=? AND state='failed';
