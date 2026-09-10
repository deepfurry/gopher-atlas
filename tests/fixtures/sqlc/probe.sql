-- name: ReadProbe :one
SELECT id FROM bootstrap_probe WHERE id = ?;
