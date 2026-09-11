// Package testkit provides isolated test resources, never environment-selected data.
package testkit

import (
	"context"
	"database/sql"
	"io"
	"io/fs"
	"log/slog"
	"path/filepath"
	"testing"

	migrations "github.com/deepfurry/gopher-atlas/db"
	"github.com/deepfurry/gopher-atlas/internal/database"
	"github.com/pressly/goose/v3"
)

func Open(t testing.TB) *sql.DB {
	t.Helper()
	pool, err := database.Open(context.Background(), filepath.Join(t.TempDir(), "identity.db"))
	if err != nil {
		t.Fatal("open isolated database failed")
	}
	t.Cleanup(func() { _ = pool.Close() })
	return pool
}

func Provider(t testing.TB, pool *sql.DB) *goose.Provider {
	t.Helper()
	files, err := fs.Sub(migrations.Migrations, "migrations")
	if err != nil {
		t.Fatal(err)
	}
	provider, err := goose.NewProvider(goose.DialectSQLite3, pool, files, goose.WithSlog(slog.New(slog.NewTextHandler(io.Discard, nil))))
	if err != nil {
		t.Fatal("migration provider failed")
	}
	return provider
}
func Migrate(t testing.TB, pool *sql.DB) *goose.Provider {
	t.Helper()
	provider := Provider(t, pool)
	if _, err := provider.Up(context.Background()); err != nil {
		t.Fatal("migration failed")
	}
	return provider
}

func Database(t testing.TB) *sql.DB { t.Helper(); pool := Open(t); Migrate(t, pool); return pool }
