// Package outbox couples a public mutation to its durable generation/job using
// the caller's transaction. It has no external I/O or service dependencies.
package outbox

import (
	"context"
	dbsqlc "github.com/deepfurry/gopher-atlas/internal/database/sqlc"
	"github.com/deepfurry/gopher-atlas/internal/fault"
	"sync"
)

// Fence serializes public mutations with latest/Hook stages in the single CMS
// writer process. Acquire BEFORE opening a business transaction. External stages
// hold no SQLite transaction; a newer generation cannot commit mid-stage.
type Fence struct{ sync.Mutex }

func MarkDirty(ctx context.Context, q *dbsqlc.Queries, now int64) error {
	generation, err := q.IncrementGeneration(ctx, now)
	if err != nil {
		return fault.Unavailable
	}
	_, err = q.CreatePublicationJob(ctx, dbsqlc.CreatePublicationJobParams{Generation: generation, CreatedAt: now, UpdatedAt: now})
	if err != nil {
		return fault.Unavailable
	}
	return nil
}
