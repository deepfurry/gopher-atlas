package editorialupgrade

import (
	"context"
	"database/sql"
	"fmt"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/deepfurry/gopher-atlas/internal/database"
	"github.com/deepfurry/gopher-atlas/internal/publication"
	"github.com/deepfurry/gopher-atlas/internal/testkit"
)

// A synthetic consistent Schema-4 backup/copy rehearsal, never a production DB.
func TestProtectedSchema4CopyActivationAndHistoryPreservation(t *testing.T) {
	ctx := context.Background()
	original := testkit.Open(t)
	p := testkit.Provider(t, original)
	check := func(err error) {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
	}
	_, err := p.UpTo(ctx, 4)
	check(err)
	for _, statement := range []string{
		"INSERT INTO users(id,github_user_id,github_login,role,status,created_at,updated_at) VALUES(1,1,'synthetic','admin','active',1,1)",
		"INSERT INTO author_profiles(user_id,slug,display_name,created_at,updated_at) VALUES(1,'synthetic','Synthetic',1,1)",
		"INSERT INTO tags(id,name,normalized_name,slug,description,created_by,created_at,updated_at) VALUES(1,'Go','go','go','',1,1,1)",
		"INSERT INTO note_groups(id,slug,name,description,sort_order,created_at,updated_at) VALUES(1,'go','Go','',0,1,1)",
		"UPDATE site_state SET publication_generation=15,updated_at=1",
	} {
		_, err = original.Exec(statement)
		check(err)
	}
	for i := 1; i <= 12; i++ {
		_, err = original.Exec("INSERT INTO content_items(id,type,owner_user_id,created_by,created_at,updated_at,first_published_at,last_published_at,published_revision_id) VALUES(?,'note',1,1,1,1,1,2,?)", i, i)
		check(err)
		_, err = original.Exec(`INSERT INTO content_drafts(content_id,title,slug,body_markdown,byline_user_id,language,payload_schema_version,payload_json,updated_by,updated_at) VALUES(?, ?, ?, '## Original Markdown',1,'zh',1,'{"group":"Go","groupSlug":"go","order":1}',1,1)`, i, fmt.Sprint("Note ", i), fmt.Sprint("note-", i))
		check(err)
		_, err = original.Exec(`INSERT INTO content_revisions(id,content_id,revision_no,title,slug,body_markdown,byline_user_id,language,payload_schema_version,payload_json,created_by,created_at) SELECT ?,content_id,1,title,slug,body_markdown,byline_user_id,language,payload_schema_version,payload_json,1,1 FROM content_drafts WHERE content_id=?`, i, i)
		check(err)
		_, err = original.Exec("INSERT INTO content_routes(content_id,path,kind,created_at) VALUES(?,?,'canonical',1)", i, fmt.Sprintf("/notes/go/note-%d/", i))
		check(err)
		_, err = original.Exec("INSERT INTO revision_tags VALUES(?,1)", i)
		check(err)
	}
	// Preserve an older immutable candidate and its review as well as current Notes.
	_, err = original.Exec(`INSERT INTO content_revisions(id,content_id,revision_no,title,slug,body_markdown,byline_user_id,language,payload_schema_version,payload_json,created_by,created_at) SELECT 13,content_id,2,'Historical title',slug,'Historical Markdown',byline_user_id,language,payload_schema_version,payload_json,1,3 FROM content_drafts WHERE content_id=1`)
	check(err)
	_, err = original.Exec("INSERT INTO content_reviews(content_id,revision_id,reviewer_user_id,decision,comment_markdown,created_at) VALUES(1,13,1,'changes_requested','Historical review',4)")
	check(err)
	before := history(t, original)
	path := filepath.Join(t.TempDir(), "working-copy.db")
	_, err = original.Exec("VACUUM INTO ?", path)
	check(err)
	copy, err := database.Open(ctx, path)
	check(err)
	defer copy.Close()
	_, err = testkit.Provider(t, copy).Up(ctx)
	check(err)
	if database.Ready(ctx, copy) == nil {
		t.Fatal("new writer activated before explicit gate")
	}
	if Activate(ctx, copy, 999, 15) == nil || Activate(ctx, copy, 1, 14) == nil {
		t.Fatal("actor/stale gate missing")
	}
	_, err = copy.Exec("CREATE TRIGGER reject_activation_audit BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT,'synthetic'); END")
	check(err)
	if Activate(ctx, copy, 1, 15) == nil {
		t.Fatal("audit failure accepted")
	}
	var unchanged int
	check(copy.QueryRow("SELECT publication_generation FROM site_state").Scan(&unchanged))
	if unchanged != 15 {
		t.Fatal("failed activation advanced generation")
	}
	_, err = copy.Exec("DROP TRIGGER reject_activation_audit")
	check(err)
	check(Activate(ctx, copy, 1, 15))
	check(database.Ready(ctx, copy))
	if Activate(ctx, copy, 1, 16) == nil {
		t.Fatal("repeat activation accepted")
	}
	var gen int
	check(copy.QueryRow("SELECT publication_generation FROM site_state").Scan(&gen))
	if gen != 16 {
		t.Fatal("generation not incremented once")
	}
	if !reflect.DeepEqual(before, history(t, copy)) || !reflect.DeepEqual(before, history(t, original)) {
		t.Fatal("migration modified original business/history fields")
	}
	var integrity string
	check(copy.QueryRow("PRAGMA integrity_check").Scan(&integrity))
	if integrity != "ok" {
		t.Fatal("integrity")
	}
	rows, err := copy.Query("PRAGMA foreign_key_check")
	check(err)
	if rows.Next() {
		t.Fatal("foreign key violation")
	}
	check(rows.Close())
	exported, err := (&publication.Exporter{DB: copy}).Export(ctx, 16)
	check(err)
	if exported.Snapshot.SchemaVersion != 3 || len(exported.Snapshot.Content) != 12 {
		t.Fatal("12 Notes lost in v3 export")
	}
	if _, err = testkit.Provider(t, copy).Down(ctx); err == nil {
		t.Fatal("activated writer downgrade accepted")
	}
}

func history(t *testing.T, db *sql.DB) map[string]string {
	t.Helper()
	result := map[string]string{}
	queries := map[string]string{
		"items":     "SELECT json_group_array(json_array(id,type,published_revision_id,first_published_at,last_published_at)) FROM content_items",
		"drafts":    "SELECT json_group_array(json_array(content_id,version,title,summary,body_markdown,payload_json)) FROM content_drafts",
		"revisions": "SELECT json_group_array(json_array(id,content_id,revision_no,title,summary,body_markdown,payload_json,created_at)) FROM content_revisions",
		"routes":    "SELECT json_group_array(json_array(content_id,path,kind)) FROM content_routes",
		"tags":      "SELECT json_group_array(json_array(revision_id,tag_id)) FROM revision_tags",
		"reviews":   "SELECT json_group_array(json_array(id,revision_id,comment_markdown)) FROM content_reviews",
	}
	for key, query := range queries {
		var value string
		if err := db.QueryRow(query).Scan(&value); err != nil {
			t.Fatal(err)
		}
		result[key] = value
	}
	return result
}
