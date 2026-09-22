package legacy

import (
	"context"
	"database/sql"
	"time"

	"github.com/deepfurry/gopher-atlas/internal/auth"
	dbsqlc "github.com/deepfurry/gopher-atlas/internal/database/sqlc"
	"github.com/deepfurry/gopher-atlas/internal/fault"
)

func nowMillis() int64 { return time.Now().UnixMilli() }

// OperatorPrincipal is available only to the offline CLI with direct DB access.
// It uses an existing active Admin, never invents a GitHub user, and creates a
// bounded session so ordinary services keep their transaction reauthorization.
// No raw token is printed or returned; the caller must revoke on completion.
func OperatorPrincipal(ctx context.Context, db *sql.DB, id int64) (auth.Principal, func(), error) {
	q := dbsqlc.New(db)
	u, err := q.GetUser(ctx, id)
	if err != nil || u.Role != "admin" || u.Status != "active" {
		return auth.Principal{}, nil, fault.Permission
	}
	token, err := auth.RandomToken()
	if err != nil {
		return auth.Principal{}, nil, err
	}
	csrf, err := auth.RandomToken()
	if err != nil {
		return auth.Principal{}, nil, err
	}
	now := nowMillis()
	session, err := q.CreateSession(ctx, dbsqlc.CreateSessionParams{UserID: id, TokenHash: auth.Hash(token), CsrfTokenHash: auth.Hash(csrf), CreatedAt: now, LastSeenAt: now, ExpiresAt: now + time.Hour.Milliseconds()})
	if err != nil {
		return auth.Principal{}, nil, fault.Unavailable
	}
	revoke := func() {
		cleanup, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_, _ = db.ExecContext(cleanup, "UPDATE sessions SET revoked_at=? WHERE id=?", nowMillis(), session.ID)
	}
	return auth.Principal{User: u, Session: session}, revoke, nil
}
