// Package audit writes only typed, minimal operation context using the caller's
// transaction. It has no access to request bodies, credentials or Fiber contexts.
package audit

import (
	"context"
	"database/sql"
	"encoding/json"
	"regexp"

	dbsqlc "github.com/deepfurry/gopher-atlas/internal/database/sqlc"
	"github.com/deepfurry/gopher-atlas/internal/fault"
	"github.com/deepfurry/gopher-atlas/internal/policy"
)

type requestKey struct{}

var requestIDPattern = regexp.MustCompile(`^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$`)

// WithRequestID accepts the server-generated UUID only, never an incoming header.
func WithRequestID(ctx context.Context, id string) context.Context {
	if !requestIDPattern.MatchString(id) {
		id = ""
	}
	return context.WithValue(ctx, requestKey{}, id)
}

type Metadata struct {
	Role   string `json:"role,omitempty"`
	Status string `json:"status,omitempty"`
}
type Event struct {
	ActorID    int64
	Action     string
	EntityType string
	EntityID   int64
	RevisionID int64
	Metadata   Metadata
}

func Append(ctx context.Context, q *dbsqlc.Queries, e Event, now int64) error {
	data, err := json.Marshal(e.Metadata)
	if err != nil {
		return fault.Unavailable
	}
	id, _ := ctx.Value(requestKey{}).(string)
	err = q.AppendAudit(ctx, dbsqlc.AppendAuditParams{
		ActorUserID: e.ActorID, Action: e.Action, EntityType: e.EntityType, EntityID: e.EntityID,
		RevisionID:   sql.NullInt64{Int64: e.RevisionID, Valid: e.RevisionID > 0},
		MetadataJson: string(data), RequestID: id, CreatedAt: now,
	})
	if err != nil {
		return fault.Unavailable
	}
	return nil
}
func List(ctx context.Context, q *dbsqlc.Queries, user dbsqlc.User, after int64) ([]dbsqlc.AuditEvent, error) {
	if !policy.For(user.Role, user.Status).ViewAudit {
		return nil, fault.Permission
	}
	if after < 0 {
		return nil, fault.Validation
	}
	rows, err := q.ListAudit(ctx, dbsqlc.ListAuditParams{AfterID: after, PageSize: 100})
	if err != nil {
		return nil, fault.Unavailable
	}
	return rows, nil
}
