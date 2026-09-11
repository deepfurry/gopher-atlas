// Package database owns connection initialization, not schema mutation.
package database

import (
	"context"
	"database/sql"
	"errors"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

const PoolSize = 4
const SchemaVersion = 2

var ErrUnavailable = errors.New("persistence is unavailable or schema is incompatible")

func Open(ctx context.Context, path string) (*sql.DB, error) {
	absolute, err := filepath.Abs(path)
	if err != nil || strings.TrimSpace(path) == "" {
		return nil, ErrUnavailable
	}
	if err := os.MkdirAll(filepath.Dir(absolute), 0700); err != nil {
		return nil, ErrUnavailable
	}
	// A file URL safely escapes literal ?/# in filesystem paths, including Windows.
	name := filepath.ToSlash(absolute)
	if !strings.HasPrefix(name, "/") {
		name = "/" + name
	}
	dsn := url.URL{Scheme: "file", Path: name}
	params := url.Values{}
	for _, pragma := range []string{"busy_timeout(5000)", "journal_mode(WAL)", "foreign_keys(ON)", "synchronous(NORMAL)"} {
		params.Add("_pragma", pragma)
	}
	// Serialize service write transactions before their first read, preventing
	// deferred read-to-write upgrades and concurrent last-Admin/bootstrap races.
	params.Set("_txlock", "immediate")
	dsn.RawQuery = params.Encode()
	pool, err := sql.Open("sqlite", dsn.String())
	if err != nil {
		return nil, ErrUnavailable
	}
	pool.SetMaxOpenConns(PoolSize)
	pool.SetMaxIdleConns(PoolSize)
	pool.SetConnMaxIdleTime(5 * time.Minute)
	if err := pool.PingContext(ctx); err != nil {
		_ = pool.Close()
		return nil, ErrUnavailable
	}
	return pool, nil
}

// Ready is read-only, including when the file is empty or migrations are missing.
func Ready(ctx context.Context, pool *sql.DB) error {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	if err := pool.PingContext(ctx); err != nil {
		return ErrUnavailable
	}
	var version int
	if err := pool.QueryRowContext(ctx, "SELECT COALESCE(MAX(version_id), 0) FROM goose_db_version WHERE is_applied = 1").Scan(&version); err != nil || version != SchemaVersion {
		return ErrUnavailable
	}
	for _, query := range []string{
		"SELECT id, github_user_id, github_login, role, status, created_at, updated_at, last_login_at FROM users LIMIT 0",
		"SELECT user_id, slug, display_name, bio_markdown, avatar_url, website_url, created_at, updated_at FROM author_profiles LIMIT 0",
		"SELECT id, user_id, token_hash, csrf_token_hash, created_at, expires_at, last_seen_at, revoked_at FROM sessions LIMIT 0",
		"SELECT state_hash, created_at, expires_at, consumed_at FROM oauth_states LIMIT 0",
		"SELECT id, type, owner_user_id, editorial_state, pending_review_revision_id, published_revision_id, created_by, first_published_at, last_published_at, created_at, updated_at, archived_at FROM content_items LIMIT 0",
		"SELECT content_id, version, title, slug, summary, body_markdown, byline_user_id, language, featured, seo_title, seo_description, payload_schema_version, payload_json, updated_by, updated_at FROM content_drafts LIMIT 0",
		"SELECT id, content_id, revision_no, title, slug, summary, body_markdown, byline_user_id, language, featured, seo_title, seo_description, payload_schema_version, payload_json, created_by, created_at FROM content_revisions LIMIT 0",
		"SELECT id, content_id, revision_id, reviewer_user_id, decision, comment_markdown, created_at FROM content_reviews LIMIT 0",
		"SELECT id, name, normalized_name, slug, description, created_by, created_at, updated_at FROM tags LIMIT 0",
		"SELECT content_id, tag_id FROM draft_tags LIMIT 0",
		"SELECT revision_id, tag_id FROM revision_tags LIMIT 0",
		"SELECT topic_content_id, position, target_content_id FROM draft_topic_entries LIMIT 0",
		"SELECT topic_revision_id, position, target_content_id FROM revision_topic_entries LIMIT 0",
		"SELECT id, content_id, path, kind, created_at FROM content_routes LIMIT 0",
		"SELECT id, actor_user_id, action, entity_type, entity_id, revision_id, metadata_json, request_id, created_at FROM audit_events LIMIT 0",
	} {
		rows, err := pool.QueryContext(ctx, query)
		if err != nil {
			return ErrUnavailable
		}
		if err := rows.Close(); err != nil {
			return ErrUnavailable
		}
	}
	return nil
}
