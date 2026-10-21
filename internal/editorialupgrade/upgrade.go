// Package editorialupgrade activates the v3 writer only after an explicit offline migration.
package editorialupgrade

import (
	"context"
	"database/sql"
	"fmt"
	"github.com/deepfurry/gopher-atlas/internal/audit"
	dbsqlc "github.com/deepfurry/gopher-atlas/internal/database/sqlc"
	"github.com/deepfurry/gopher-atlas/internal/outbox"
	"time"
)

func Activate(ctx context.Context, db *sql.DB, actor, generation int64) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("transaction unavailable")
	}
	defer tx.Rollback()
	var version, ready int
	if tx.QueryRowContext(ctx, "SELECT MAX(version_id) FROM goose_db_version WHERE is_applied=1").Scan(&version) != nil || version != 5 {
		return fmt.Errorf("schema 5 required")
	}
	if tx.QueryRowContext(ctx, "SELECT ready FROM editorial_localization_state WHERE id=1").Scan(&ready) != nil || ready != 0 {
		return fmt.Errorf("activation not pending")
	}
	q := dbsqlc.New(tx)
	taxonomy, err := q.GetTaxonomyState(ctx)
	if err != nil || taxonomy.Ready != 1 {
		return fmt.Errorf("taxonomy activation required")
	}
	user, err := q.GetUser(ctx, actor)
	if err != nil || user.Role != "admin" || user.Status != "active" {
		return fmt.Errorf("active Admin required")
	}
	state, err := q.GetSiteState(ctx)
	if err != nil || state.PublicationGeneration != generation {
		return fmt.Errorf("generation changed")
	}
	now := time.Now().UnixMilli()
	if err = outbox.MarkDirty(ctx, q, now); err != nil {
		return fmt.Errorf("generation allocation failed")
	}
	job, err := q.LatestPublicationJob(ctx)
	if err != nil {
		return fmt.Errorf("job unavailable")
	}
	if err = audit.Append(ctx, q, audit.Event{ActorID: actor, Action: "publication.editorial_v3_activated", EntityType: "publication", EntityID: job.ID}, now); err != nil {
		return fmt.Errorf("audit failed")
	}
	if _, err = tx.ExecContext(ctx, "UPDATE editorial_localization_state SET ready=1,activated=1 WHERE id=1 AND ready=0"); err != nil {
		return fmt.Errorf("activation failed")
	}
	return tx.Commit()
}
