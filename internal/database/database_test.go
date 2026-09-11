package database_test

import (
	"context"
	"database/sql"
	"testing"

	"github.com/deepfurry/gopher-atlas/internal/database"
	dbsqlc "github.com/deepfurry/gopher-atlas/internal/database/sqlc"
	"github.com/deepfurry/gopher-atlas/internal/testkit"
)

func TestMigrationsReadinessAndRollback(t *testing.T) {
	ctx := context.Background()
	pool := testkit.Open(t)
	if database.Ready(ctx, pool) == nil {
		t.Fatal("empty schema was ready")
	}
	var count int
	if err := pool.QueryRow("SELECT count(*) FROM sqlite_master WHERE type='table'").Scan(&count); err != nil || count != 0 {
		t.Fatal("readiness mutated empty schema")
	}
	provider := testkit.Migrate(t, pool)
	if err := database.Ready(ctx, pool); err != nil {
		t.Fatal(err)
	}
	tx, err := pool.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	q := dbsqlc.New(tx)
	if _, err := q.CreateUser(ctx, dbsqlc.CreateUserParams{GithubUserID: 1, GithubLogin: "example", Role: "editor", Status: "pending"}); err != nil {
		t.Fatal("real user insert failed")
	}
	if err := tx.Rollback(); err != nil {
		t.Fatal(err)
	}
	if _, err := dbsqlc.New(pool).GetUserByGitHubID(ctx, 1); err != sql.ErrNoRows {
		t.Fatal("transaction did not roll back")
	}
	if _, err := pool.Exec("INSERT INTO users (github_user_id, github_login, role, status, created_at, updated_at) VALUES (1, 'example', 'owner', 'active', 0, 0)"); err == nil {
		t.Fatal("invalid role accepted")
	}
	if _, err := provider.Down(ctx); err != nil {
		t.Fatal("down migration failed")
	}
	if database.Ready(ctx, pool) == nil {
		t.Fatal("removed schema was ready")
	}
	if err := pool.QueryRow("SELECT count(*) FROM users").Scan(&count); err != nil {
		t.Fatal("down migration 2 removed identity schema")
	}
	if _, err := provider.Up(ctx); err != nil {
		t.Fatal("reapply failed")
	}
	if err := database.Ready(ctx, pool); err != nil {
		t.Fatal("reapplied editorial schema not ready")
	}
	if _, err := pool.Exec("ALTER TABLE audit_events RENAME COLUMN request_id TO missing_request_id"); err != nil {
		t.Fatal(err)
	}
	if database.Ready(ctx, pool) == nil {
		t.Fatal("broken editorial schema was ready")
	}
	if _, err := pool.Exec("ALTER TABLE audit_events RENAME COLUMN missing_request_id TO request_id"); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec("ALTER TABLE sessions RENAME COLUMN csrf_token_hash TO missing_hash"); err != nil {
		t.Fatal(err)
	}
	if database.Ready(ctx, pool) == nil {
		t.Fatal("broken session schema was ready")
	}
	_ = pool.Close()
	if database.Ready(ctx, pool) == nil {
		t.Fatal("closed database was ready")
	}
}

func TestPragmasAcrossPoolAndReplacementConnections(t *testing.T) {
	pool := testkit.Database(t)
	if pool.Stats().MaxOpenConnections != database.PoolSize {
		t.Fatal("unbounded or changed pool")
	}
	for round := 0; round < 2; round++ {
		connections := make([]*sql.Conn, 0, database.PoolSize)
		for i := 0; i < database.PoolSize; i++ {
			conn, err := pool.Conn(context.Background())
			if err != nil {
				t.Fatal(err)
			}
			connections = append(connections, conn)
			for pragma, want := range map[string]string{"journal_mode": "wal", "foreign_keys": "1", "busy_timeout": "5000", "synchronous": "1"} {
				var got string
				if err := conn.QueryRowContext(context.Background(), "PRAGMA "+pragma).Scan(&got); err != nil || got != want {
					t.Fatalf("connection %d pragma %s incorrect", i, pragma)
				}
			}
			if _, err := conn.ExecContext(context.Background(), "INSERT INTO author_profiles(user_id, slug, display_name, created_at, updated_at) VALUES(999, 'missing', 'Missing', 0, 0)"); err == nil {
				t.Fatal("foreign key not enforced")
			}
		}
		pool.SetMaxIdleConns(0)
		for _, conn := range connections {
			_ = conn.Close()
		}
		pool.SetMaxIdleConns(database.PoolSize)
	}
}

func TestEditorialMigrationPreservesIdentityAcrossUpgradeAndDown(t *testing.T) {
	ctx := context.Background()
	pool := testkit.Open(t)
	provider := testkit.Migrate(t, pool)
	if _, err := provider.DownTo(ctx, 1); err != nil {
		t.Fatal(err)
	}
	q := dbsqlc.New(pool)
	user, err := q.CreateUser(ctx, dbsqlc.CreateUserParams{GithubUserID: 42, GithubLogin: "preserved", Role: "admin", Status: "active"})
	if err != nil {
		t.Fatal(err)
	}
	if database.Ready(ctx, pool) == nil {
		t.Fatal("P0-1-only schema accepted")
	}
	for round := 0; round < 2; round++ {
		if _, err := provider.Up(ctx); err != nil {
			t.Fatal(err)
		}
		if database.Ready(ctx, pool) != nil {
			t.Fatal("current schema not ready")
		}
		got, err := q.GetUser(ctx, user.ID)
		if err != nil || got.GithubUserID != 42 {
			t.Fatal("upgrade lost identity")
		}
		if _, err := provider.DownTo(ctx, 1); err != nil {
			t.Fatal(err)
		}
		got, err = q.GetUser(ctx, user.ID)
		if err != nil || got.GithubUserID != 42 {
			t.Fatal("down 2 lost identity")
		}
		if database.Ready(ctx, pool) == nil {
			t.Fatal("down 2 still ready")
		}
		var editorialTables int
		if err := pool.QueryRow("SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN ('content_items','audit_events')").Scan(&editorialTables); err != nil || editorialTables != 0 {
			t.Fatal("readiness migrated missing editorial tables")
		}
	}
}
