package taxonomyupgrade

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"testing"

	"github.com/deepfurry/gopher-atlas/internal/database"
	dbsqlc "github.com/deepfurry/gopher-atlas/internal/database/sqlc"
	"github.com/deepfurry/gopher-atlas/internal/editorialupgrade"
	"github.com/deepfurry/gopher-atlas/internal/publication"
	"github.com/deepfurry/gopher-atlas/internal/testkit"
	"github.com/pressly/goose/v3"
)

var ctx = context.Background()

func must(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}
func seedV3(t *testing.T) (*sql.DB, *goose.Provider) {
	t.Helper()
	db := testkit.Open(t)
	p := testkit.Provider(t, db)
	_, err := p.UpTo(ctx, 3)
	must(t, err)
	for _, stmt := range []string{
		"INSERT INTO users(id,github_user_id,github_login,role,status,created_at,updated_at) VALUES(1,1,'admin','admin','active',1,1),(2,2,'editor','editor','active',1,1)",
		"INSERT INTO author_profiles(user_id,slug,display_name,created_at,updated_at) VALUES(1,'author','作者',1,1)",
		"INSERT INTO tags VALUES(7,'技术','技术','tech','中文说明',1,1,1)",
		"INSERT INTO content_items(id,type,owner_user_id,created_by,created_at,updated_at) VALUES(1,'note',1,1,1,1),(2,'note',1,1,1,1)",
		`INSERT INTO content_drafts(content_id,title,slug,summary,body_markdown,byline_user_id,language,payload_schema_version,payload_json,updated_by,updated_at) VALUES(1,'旧文章','legacy','摘要','## Original body',1,'zh',1,'{"group":"旧分组","groupSlug":"original","groupDescription":"原说明","groupOrder":2,"order":3}',1,1),(2,'','','','',1,'',1,'{}',1,1)`,
		`INSERT INTO content_revisions(id,content_id,revision_no,title,slug,summary,body_markdown,byline_user_id,language,payload_schema_version,payload_json,created_by,created_at) SELECT 9,content_id,1,title,slug,summary,body_markdown,byline_user_id,language,payload_schema_version,payload_json,1,123 FROM content_drafts WHERE content_id=1`,
		`INSERT INTO content_revisions(id,content_id,revision_no,title,slug,body_markdown,byline_user_id,language,payload_schema_version,payload_json,created_by,created_at) VALUES(10,1,2,'历史草稿','history','Historical',1,'zh',1,'{"group":"不再使用","groupSlug":"historical","order":0}',1,125)`,
		"UPDATE content_items SET published_revision_id=9,editorial_state='synced',first_published_at=123,last_published_at=124 WHERE id=1",
		"INSERT INTO content_routes VALUES(1,1,'/notes/original/legacy/','canonical',123),(2,1,'/notes/original/old/','redirect',120)",
		"INSERT INTO revision_tags VALUES(9,7)",
		"INSERT INTO draft_tags VALUES(1,7)",
		"INSERT INTO content_reviews VALUES(1,1,9,2,'approved','Preserved review',123)",
		"INSERT INTO audit_events VALUES(99,1,'content.published','content',1,9,'{}','',123)",
		"UPDATE site_state SET publication_generation=14,updated_at=124 WHERE id=1",
		"INSERT INTO publication_jobs(generation,state,snapshot_key,snapshot_sha256,created_at,updated_at,triggered_at) VALUES(14,'build_triggered','snapshots/generation-14.json','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',124,124,124)",
	} {
		_, err = db.Exec(stmt)
		must(t, err)
	}
	return db, p
}
func history(t *testing.T, db *sql.DB) map[string]string {
	t.Helper()
	result := map[string]string{}
	for _, table := range []string{"content_items", "content_drafts", "content_revisions", "content_reviews", "content_routes", "tags", "revision_tags", "draft_tags"} {
		rows, err := db.Query("SELECT * FROM " + table + " ORDER BY 1")
		must(t, err)
		cols, err := rows.Columns()
		must(t, err)
		all := [][]any{}
		for rows.Next() {
			v := make([]any, len(cols))
			p := make([]any, len(cols))
			for i := range v {
				p[i] = &v[i]
			}
			must(t, rows.Scan(p...))
			all = append(all, v)
		}
		must(t, rows.Err())
		must(t, rows.Close())
		data, err := json.Marshal(all)
		must(t, err)
		result[table] = string(data)
	}
	return result
}
func TestPlanApplyPreservesExistingPublicationAndRefusesLossyDown(t *testing.T) {
	db, p := seedV3(t)
	before := history(t, db)
	plan, err := Inspect(ctx, db)
	must(t, err)
	if len(plan.Groups) != 1 || len(plan.Issues) != 0 || plan.SkippedDrafts != 1 || plan.Generation != 14 {
		t.Fatalf("unexpected plan: %+v", plan)
	}
	if !reflect.DeepEqual(before, history(t, db)) {
		t.Fatal("plan mutated source")
	}
	_, err = p.UpTo(ctx, 4)
	must(t, err)
	if database.Ready(ctx, db) == nil {
		t.Fatal("unimported schema 4 ready")
	}
	afterSchema, err := Inspect(ctx, db)
	must(t, err)
	if plan.Fingerprint != afterSchema.Fingerprint {
		t.Fatal("schema changed plan source")
	}
	_, err = Apply(ctx, db, plan.Fingerprint, 2)
	if !errors.Is(err, ErrActor) {
		t.Fatal(err)
	}
	_, err = Apply(ctx, db, "stale", 1)
	if !errors.Is(err, ErrStale) {
		t.Fatal(err)
	}
	// A failed Audit append must roll back all groups, state and generation.
	_, err = db.Exec("CREATE TRIGGER fail_import BEFORE INSERT ON audit_events WHEN NEW.entity_type='note_group' BEGIN SELECT RAISE(ABORT,'forced'); END")
	must(t, err)
	_, err = Apply(ctx, db, plan.Fingerprint, 1)
	if !errors.Is(err, ErrUnavailable) {
		t.Fatal(err)
	}
	var count int
	must(t, db.QueryRow("SELECT count(*) FROM note_groups").Scan(&count))
	if count != 0 {
		t.Fatal("partial import")
	}
	_, err = db.Exec("DROP TRIGGER fail_import")
	must(t, err)
	_, err = Apply(ctx, db, plan.Fingerprint, 1)
	must(t, err)
	if database.Ready(ctx, db) == nil {
		t.Fatal("Schema 4 unexpectedly ready for Schema 5 CMS")
	}
	if !reflect.DeepEqual(before, history(t, db)) {
		t.Fatal("upgrade changed article/history/route/tag rows")
	}
	q := dbsqlc.New(db)
	state, err := q.GetSiteState(ctx)
	must(t, err)
	if state.PublicationGeneration != 15 {
		t.Fatal("did not allocate fresh immutable generation")
	}
	_, err = Apply(ctx, db, plan.Fingerprint, 1)
	if !errors.Is(err, ErrApplied) {
		t.Fatal("repeat import not detected", err)
	}
	_, err = p.Up(ctx)
	must(t, err)
	must(t, editorialupgrade.Activate(ctx, db, 1, 15))
	must(t, database.Ready(ctx, db))
	exported, err := (&publication.Exporter{DB: db}).Export(ctx, 16)
	must(t, err)
	s := exported.Snapshot
	if s.SchemaVersion != 3 || len(s.Groups) != 1 || s.Groups[0].Slug != "original" || len(s.Content) != 1 || string(s.Content[0].Payload) != `{"groupSlug":"original","order":3}` {
		t.Fatal("v2 export did not preserve original grouping")
	}
	if s.Tags[0].ID != 7 || s.Tags[0].NameEn != "" || s.Content[0].RevisionNo != 1 || s.Content[0].CanonicalPath != "/notes/original/legacy/" || s.Content[0].FirstPublishedAt != 123 {
		t.Fatal("export identity/date changed")
	}
	for _, stmt := range []string{"UPDATE audit_events SET action='lost'", "DELETE FROM audit_events", "UPDATE content_revisions SET title='lost'", "DELETE FROM note_groups", "UPDATE note_groups SET slug='lost'", "UPDATE tags SET slug='lost'"} {
		if _, err = db.Exec(stmt); err == nil {
			t.Fatal("immutable boundary missing", stmt)
		}
	}
	_, err = p.Down(ctx)
	if err == nil {
		t.Fatal("lossy downgrade accepted")
	}
	must(t, database.Ready(ctx, db))
	must(t, db.QueryRow("SELECT count(*) FROM audit_events WHERE id=99 AND action='content.published'").Scan(&count))
	if count != 1 {
		t.Fatal("old audit lost")
	}
	var integrity string
	must(t, db.QueryRow("PRAGMA integrity_check").Scan(&integrity))
	if integrity != "ok" {
		t.Fatal(integrity)
	}
	rows, err := db.Query("PRAGMA foreign_key_check")
	must(t, err)
	defer rows.Close()
	if rows.Next() {
		t.Fatal("broken foreign key")
	}
}
func TestPlanReportsEachConflictAndApplyIsAtomic(t *testing.T) {
	for _, field := range []string{"group", "groupDescription", "groupOrder"} {
		t.Run(field, func(t *testing.T) {
			db, p := seedV3(t)
			value := any("Conflicting value")
			if field == "groupOrder" {
				value = 9
			}
			_, err := db.Exec("UPDATE content_drafts SET payload_json=json_set(payload_json,?,?) WHERE content_id=1", "$."+field, value)
			must(t, err)
			before := history(t, db)
			plan, err := Inspect(ctx, db)
			must(t, err)
			if len(plan.Issues) != 1 || plan.Issues[0].Code != "conflicting_metadata" || len(plan.Issues[0].Sources) != 2 {
				t.Fatal("conflict hidden", plan)
			}
			_, err = p.UpTo(ctx, 4)
			must(t, err)
			_, err = Apply(ctx, db, plan.Fingerprint, 1)
			if !errors.Is(err, ErrConflict) {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(before, history(t, db)) {
				t.Fatal("conflict rewrote source")
			}
		})
	}
}
func TestSchemaFourConstraintsAndEmptyReversibleMigration(t *testing.T) {
	db := testkit.Database(t)
	p := testkit.Provider(t, db)
	_, err := p.Down(ctx)
	must(t, err)
	_, err = p.Up(ctx)
	must(t, err)
	must(t, database.Ready(ctx, db))
	for _, v := range []string{"'bad_slug','Name',0", "'bad--slug','Name',0", "'good','',0", "'good','Name',-1"} {
		_, err = db.Exec(fmt.Sprintf("INSERT INTO note_groups(slug,name,sort_order,created_at,updated_at) VALUES(%s,0,0)", v))
		if err == nil {
			t.Fatal("invalid group accepted")
		}
	}
}
