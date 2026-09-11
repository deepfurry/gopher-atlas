package database_test

import (
	"context"
	"github.com/deepfurry/gopher-atlas/internal/database"
	"github.com/deepfurry/gopher-atlas/internal/testkit"
	"testing"
)

func TestPublicationMigrationPreservesV2History(t *testing.T) {
	ctx := context.Background()
	db := testkit.Open(t)
	p := testkit.Provider(t, db)
	if _, err := p.UpTo(ctx, 2); err != nil {
		t.Fatal(err)
	}
	for _, sql := range []string{
		"INSERT INTO users(id,github_user_id,github_login,role,status,created_at,updated_at) VALUES(1,42,'preserved','admin','active',1,1)",
		"INSERT INTO content_items(id,type,owner_user_id,created_by,created_at,updated_at) VALUES(1,'post',1,1,1,1)",
		"INSERT INTO content_drafts(content_id,byline_user_id,payload_schema_version,payload_json,updated_by,updated_at) VALUES(1,1,1,'{}',1,1)",
		"INSERT INTO audit_events(id,actor_user_id,action,entity_type,entity_id,request_id,created_at) VALUES(7,1,'content.created','content',1,'',1)",
	} {
		if _, err := db.Exec(sql); err != nil {
			t.Fatal(err)
		}
	}
	if database.Ready(ctx, db) == nil {
		t.Fatal("v2 ready for v3 binary")
	}
	for round := 0; round < 2; round++ {
		if _, err := p.Up(ctx); err != nil {
			t.Fatal(err)
		}
		if database.Ready(ctx, db) != nil {
			t.Fatal("v3 not ready")
		}
		var n int
		if err := db.QueryRow("SELECT count(*) FROM audit_events WHERE id=7 AND action='content.created'").Scan(&n); err != nil || n != 1 {
			t.Fatal("audit history lost")
		}
		if err := db.QueryRow("SELECT publication_generation FROM site_state WHERE id=1").Scan(&n); err != nil || n != 0 {
			t.Fatal("generation initialization")
		}
		if _, err := db.Exec("SELECT cover_asset_id FROM content_drafts UNION ALL SELECT cover_asset_id FROM content_revisions"); err != nil {
			t.Fatal("cover columns missing")
		}
		for _, sql := range []string{"UPDATE audit_events SET action='changed'", "DELETE FROM audit_events", "INSERT INTO site_state VALUES(2,0,0)", "UPDATE site_state SET publication_generation=-1", "INSERT INTO publication_jobs(generation,state,created_at,updated_at) VALUES(1,'invalid',1,1)", "INSERT INTO publication_jobs(generation,state,created_at,updated_at) VALUES(1,'build_triggered',1,1)"} {
			if _, err := db.Exec(sql); err == nil {
				t.Fatal("constraint missing", sql)
			}
		}
		if _, err := p.Down(ctx); err != nil {
			t.Fatal("v3 down", err)
		}
		if err := db.QueryRow("SELECT count(*) FROM content_items WHERE id=1").Scan(&n); err != nil || n != 1 {
			t.Fatal("editorial identity lost")
		}
		if err := db.QueryRow("SELECT count(*) FROM audit_events WHERE id=7").Scan(&n); err != nil || n != 1 {
			t.Fatal("down lost audit")
		}
	}
	if _, err := p.Up(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec("INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id,request_id,created_at) VALUES(1,'publication.retry_requested','publication',1,'',1)"); err != nil {
		t.Fatal("new audit entity rejected")
	}
	if _, err := p.Down(ctx); err == nil {
		t.Fatal("downgrade discarded new audit history")
	}
	if database.Ready(ctx, db) != nil {
		t.Fatal("failed downgrade did not roll back")
	}
	if _, err := db.Exec("DELETE FROM site_state"); err != nil {
		t.Fatal(err)
	}
	if database.Ready(ctx, db) == nil {
		t.Fatal("missing singleton ready")
	}
}
