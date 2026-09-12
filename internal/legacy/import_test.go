package legacy

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"image"
	"image/png"
	"net"
	"strings"
	"testing"

	"github.com/deepfurry/gopher-atlas/internal/assets"
	"github.com/deepfurry/gopher-atlas/internal/content"
	dbsqlc "github.com/deepfurry/gopher-atlas/internal/database/sqlc"
	"github.com/deepfurry/gopher-atlas/internal/publication"
	"github.com/deepfurry/gopher-atlas/internal/testkit"
	"github.com/deepfurry/gopher-atlas/internal/testkit/identity"
)

func TestImageAddressBoundary(t *testing.T) {
	for _, address := range []string{"127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.1", "100.64.0.1", "169.254.169.254", "198.18.0.1", "192.0.2.1", "240.0.0.1", "::1", "fd00::1", "fe80::1", "::ffff:100.64.0.1", "64:ff9b::a00:1", "2002:a00:1::"} {
		if publicImageIP(net.ParseIP(address)) {
			t.Errorf("special/private address accepted: %s", address)
		}
	}
	for _, address := range []string{"1.1.1.1", "2606:4700:4700::1111", "::ffff:1.1.1.1"} {
		if !publicImageIP(net.ParseIP(address)) {
			t.Errorf("public address rejected: %s", address)
		}
	}
}

func TestPreflightRejectsNoteGroupConflictsBeforeAnyWrites(t *testing.T) {
	db := testkit.Database(t)
	ctx := context.Background()
	actor := identity.Principal(t, db, 1, "admin")
	importer := Importer{DB: db, Content: content.New(db), Assets: assets.New(db, testkit.NewMemoryStore(), "assets")}
	note := func(slug, group string) Item {
		payload, err := json.Marshal(content.NotePayload{Group: group, GroupSlug: "shared", GroupDescription: "A shared group"})
		if err != nil {
			t.Fatal(err)
		}
		return Item{Key: "note:" + slug, Type: "note", Fields: content.Fields{Title: "Note", Slug: slug, BylineUserID: 1, Language: "zh", Payload: payload}}
	}
	plan := Plan{SchemaVersion: 1, OwnerID: 1, Items: []Item{note("first", "Original"), note("second", "Different")}}
	if _, err := importer.Apply(ctx, actor, plan); err == nil || err.Error() != "legacy_note_group_conflict" {
		t.Fatal("conflicting source groups accepted", err)
	}
	state, err := dbsqlc.New(db).GetSiteState(ctx)
	if err != nil || state.PublicationGeneration != 0 {
		t.Fatal("preflight failure mutated generation", err)
	}
	plan.Items = plan.Items[:1]
	if _, err := importer.Apply(ctx, actor, plan); err != nil {
		t.Fatal(err)
	}
	plan.Items = []Item{note("new-note", "Different")}
	if _, err := importer.Apply(ctx, actor, plan); err == nil || err.Error() != "legacy_note_group_conflict" {
		t.Fatal("published group conflict accepted", err)
	}
	var count int
	if err := db.QueryRow("SELECT count(*) FROM content_items").Scan(&count); err != nil || count != 1 {
		t.Fatal("group conflict wrote partial content", err)
	}
}

func TestFullImportUsesDomainAssetsDatesAndRejectsRepeat(t *testing.T) {
	db := testkit.Database(t)
	ctx := context.Background()
	actor := identity.Principal(t, db, 1, "admin")
	store := testkit.NewMemoryStore()
	var binary bytes.Buffer
	if err := png.Encode(&binary, image.NewRGBA(image.Rect(0, 0, 2, 3))); err != nil {
		t.Fatal(err)
	}
	importer := Importer{DB: db, Content: content.New(db), Assets: assets.New(db, store, "assets"), Download: func(context.Context, string) ([]byte, error) { return binary.Bytes(), nil }}
	first, last := int64(1704067200000), int64(1704153600000)
	url := "https://images.example.com/diagram.png"
	body := "## Original\n![说明](" + url + ")"
	start := strings.Index(body, url)
	plan := Plan{SchemaVersion: 1, OwnerID: 1, Tags: []content.TagInput{{Name: "Go", Slug: "go"}}, Images: []string{url}, Items: []Item{
		{Key: "curated_article:one", Type: "curated_article", Fields: content.Fields{Title: "Curated", Slug: "one", Summary: "Summary", BodyMarkdown: "Curation only", BylineUserID: 1, Language: "zh", Payload: json.RawMessage(`{"sourceUrl":"https://example.com","rating":"A","difficulty":"beginner"}`)}, TagSlugs: []string{"go"}, FirstPublishedAt: &first, LastPublishedAt: &last},
		{Key: "topic:go", Type: "topic", Fields: content.Fields{Title: "Go", Slug: "go", BylineUserID: 1, Language: "zh", Payload: json.RawMessage(`{"order":1,"recommendedCount":1}`)}, TargetKeys: []string{"curated_article:one"}},
		{Key: "note:note", Type: "note", Fields: content.Fields{Title: "Note", Slug: "note", BodyMarkdown: body, BylineUserID: 1, Language: "zh", Payload: json.RawMessage(`{"group":"Group","groupSlug":"group","groupOrder":1,"groupDescription":"Learning","order":2}`)}, ImageEdits: []ImageEdit{{URL: url, Start: start, End: start + len(url)}}, FirstPublishedAt: &first, LastPublishedAt: &last},
	}}
	if err := importer.Preflight(ctx, actor, plan); err != nil {
		t.Fatal(err)
	}
	var count int
	if err := db.QueryRow("SELECT count(*) FROM content_items").Scan(&count); err != nil || count != 0 {
		t.Fatal("preflight wrote data", err)
	}
	result, err := importer.Apply(ctx, actor, plan)
	if err != nil {
		t.Fatal(err)
	}
	if result.Content != 3 || result.Tags != 1 || result.Assets != 1 || result.Generation != 3 {
		t.Fatalf("unexpected counts: %+v", result)
	}
	exported, err := (&publication.Exporter{DB: db}).Export(ctx, 3)
	if err != nil {
		t.Fatal(err)
	}
	if exported.Snapshot.Content[0].FirstPublishedAt != first || exported.Snapshot.Content[2].LastPublishedAt != last {
		t.Fatal("legacy dates lost")
	}
	if strings.Contains(string(exported.Bytes), url) || !strings.Contains(exported.Snapshot.Content[2].BodyMarkdown, "![说明](https://assets.gopheratlas.com/media/sha256/") {
		t.Fatal("image migration failed")
	}
	if exported.Snapshot.Content[1].TopicEntries[0].TargetContentID != 1 {
		t.Fatal("topic order lost")
	}
	if _, err := importer.Apply(ctx, actor, plan); err == nil {
		t.Fatal("repeat duplicated content")
	}
	state, err := dbsqlc.New(db).GetSiteState(ctx)
	if err != nil || state.PublicationGeneration != 3 {
		t.Fatal("failed rerun mutated generation")
	}
}

func TestFailedImageDownloadDoesNotMutateAndOperatorRevokes(t *testing.T) {
	db := testkit.Database(t)
	ctx := context.Background()
	identity.Principal(t, db, 1, "admin")
	actor, revoke, err := OperatorPrincipal(ctx, db, 1)
	if err != nil {
		t.Fatal(err)
	}
	importer := Importer{DB: db, Content: content.New(db), Assets: assets.New(db, testkit.NewMemoryStore(), "assets"), Download: func(context.Context, string) ([]byte, error) { return nil, errors.New("remote detail") }}
	plan := Plan{SchemaVersion: 1, OwnerID: 1, Images: []string{"https://images.example.com/image.png"}, Items: []Item{{Key: "note:one", Type: "note", Fields: content.Fields{Title: "Note", Slug: "one", BylineUserID: 1, Language: "zh", Payload: json.RawMessage(`{"group":"G","groupSlug":"g"}`)}}}}
	_, err = importer.Apply(ctx, actor, plan)
	if err == nil || err.Error() != "legacy_image_download_failed" {
		t.Fatal("unsafe remote error", err)
	}
	var n int
	if err = db.QueryRow("SELECT count(*) FROM content_items").Scan(&n); err != nil || n != 0 {
		t.Fatal("download failure wrote content")
	}
	revoke()
	if err = importer.Preflight(ctx, actor, plan); err == nil {
		t.Fatal("revoked operator authorized")
	}
	if _, err := DownloadImage(ctx, "http://127.0.0.1/image.png"); err == nil {
		t.Fatal("unsafe download allowed")
	}
}
