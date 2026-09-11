package identity

import (
	"context"
	"database/sql"
	"fmt"
	"github.com/deepfurry/gopher-atlas/internal/auth"
	dbsqlc "github.com/deepfurry/gopher-atlas/internal/database/sqlc"
	"testing"
	"time"
)

func Principal(t testing.TB, db *sql.DB, id int64, role string) auth.Principal {
	t.Helper()
	ctx := context.Background()
	q := dbsqlc.New(db)
	now := time.Now().UnixMilli()
	u, err := q.CreateUser(ctx, dbsqlc.CreateUserParams{GithubUserID: id, GithubLogin: fmt.Sprintf("fixture-%d", id), Role: role, Status: "active", CreatedAt: now, UpdatedAt: now})
	if err != nil {
		t.Fatal(err)
	}
	if err = q.CreateProfile(ctx, dbsqlc.CreateProfileParams{UserID: u.ID, Slug: fmt.Sprintf("author-%d", id), DisplayName: fmt.Sprintf("Author %d", id), CreatedAt: now, UpdatedAt: now}); err != nil {
		t.Fatal(err)
	}
	token, err := auth.RandomToken()
	if err != nil {
		t.Fatal(err)
	}
	csrf, err := auth.RandomToken()
	if err != nil {
		t.Fatal(err)
	}
	session, err := q.CreateSession(ctx, dbsqlc.CreateSessionParams{UserID: u.ID, TokenHash: auth.Hash(token), CsrfTokenHash: auth.Hash(csrf), CreatedAt: now, ExpiresAt: now + 3600000, LastSeenAt: now})
	if err != nil {
		t.Fatal(err)
	}
	return auth.Principal{User: u, Session: session}
}
