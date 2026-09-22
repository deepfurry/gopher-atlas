package publication

import (
	"bytes"
	"encoding/json"
	"image"
	"image/png"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/deepfurry/gopher-atlas/internal/assets"
	"github.com/deepfurry/gopher-atlas/internal/auth"
	"github.com/deepfurry/gopher-atlas/internal/config"
	"github.com/deepfurry/gopher-atlas/internal/content"
	"github.com/deepfurry/gopher-atlas/internal/database"
	"github.com/deepfurry/gopher-atlas/internal/storage"
	"github.com/deepfurry/gopher-atlas/internal/testkit"
	"github.com/deepfurry/gopher-atlas/internal/testkit/identity"
)

func TestLocalPipelinePersistsRealDomainAndAssetsWithoutExternalCalls(t *testing.T) {
	dir := t.TempDir()
	var requests atomic.Int32
	external := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { requests.Add(1) }))
	defer external.Close()
	env := map[string]string{"DATABASE_PATH": filepath.Join(dir, "gopheratlas.db"), "R2_ENDPOINT": external.URL, "CLOUDFLARE_DEPLOY_HOOK_URL": external.URL, "PUBLIC_SITE_URL": external.URL}
	cfg, err := config.Load(func(k string) string { return env[k] })
	must(t, err)
	db, err := database.Open(ctx, cfg.DatabasePath)
	must(t, err)
	defer func() { _ = db.Close() }()
	testkit.Migrate(t, db)
	actor := identity.Principal(t, db, 1, "admin")
	a := auth.New(db, cfg, nil)
	store, err := storage.NewFile(cfg.Publication.LocalRoot)
	must(t, err)
	c := content.NewWithPolicy(db, cfg.Publication.AssetPolicy(), a.PublicationFence())
	as := assets.New(db, store, "assets", cfg.Publication.AssetPolicy())
	worker := New(db, cfg.Publication, store, a.PublicationFence(), nil)
	var binary bytes.Buffer
	must(t, png.Encode(&binary, image.NewRGBA(image.Rect(0, 0, 3, 4))))
	asset, err := as.Upload(ctx, actor, binary.Bytes())
	must(t, err)
	if !strings.HasPrefix(asset.URL, cfg.Publication.AssetsPublicURL+"/") {
		t.Fatal("local URL")
	}
	duplicate, err := as.Upload(ctx, actor, binary.Bytes())
	must(t, err)
	if duplicate.ID != asset.ID {
		t.Fatal("dedupe")
	}
	key := strings.TrimPrefix(asset.URL, cfg.Publication.AssetsPublicURL+"/")
	stored, err := os.ReadFile(filepath.Join(cfg.Publication.LocalRoot, "assets", filepath.FromSlash(key)))
	must(t, err)
	if !bytes.Equal(stored, binary.Bytes()) {
		t.Fatal("asset bytes not persisted")
	}
	meta, err := store.Head(ctx, "assets", key)
	must(t, err)
	if meta.CacheControl != assets.ImmutableCache || meta.ContentType != "image/png" {
		t.Fatal("asset metadata")
	}
	tag, err := c.PutTag(ctx, actor, 0, content.TagInput{Name: "Local", Slug: "local"})
	must(t, err)
	create := func(kind, slug, payload, body string, targets []content.TopicEntry, cover *int64) content.Detail {
		d, err := c.Create(ctx, actor, kind)
		must(t, err)
		in := d.Draft.DraftInput
		in.Title = slug
		in.Slug = slug
		in.Language = "zh"
		in.BodyMarkdown = body
		in.Payload = json.RawMessage(payload)
		in.CoverAssetID = cover
		in.TopicEntries = targets
		if kind != "topic" {
			in.TagIDs = []int64{tag.ID}
		}
		saved, err := c.Save(ctx, actor, d.ID, in)
		must(t, err)
		if cover != nil && (saved.CoverAsset == nil || saved.CoverAsset.URL != asset.URL) {
			t.Fatal("cover projection")
		}
		d, err = c.PublishDirect(ctx, actor, d.ID, saved.Version)
		must(t, err)
		must(t, worker.ProcessOnce(ctx))
		return d
	}
	article := create("curated_article", "local-curated", `{"sourceUrl":"https://example.com/article","rating":"A","difficulty":"beginner"}`, "收录理由。", nil, nil)
	first, err := store.Get(ctx, "content", "snapshots/generation-1.json", storage.MaxSnapshotBytes)
	must(t, err)
	create("topic", "local-topic", `{"recommendedCount":1}`, "## 本地编排", []content.TopicEntry{{TargetContentID: article.ID}}, nil)
	note := create("note", "local-note", `{"group":"本地","groupSlug":"local","groupDescription":"真实持久化","groupOrder":0,"order":1}`, "## 长篇随笔\n\n"+strings.Repeat("本地持久化阅读内容。\n\n", 300)+"![本地图]("+asset.URL+")", nil, &asset.ID)
	// Soft deletion keeps published covers and immutable image bytes available.
	_, err = as.SetDeleted(ctx, actor, asset.ID, true)
	must(t, err)
	_, err = as.SetDeleted(ctx, actor, asset.ID, false)
	must(t, err)
	status, err := worker.Status(ctx, actor)
	must(t, err)
	if status.Mode != "local" || status.ComputedState != "live" || status.PublicMarker != nil || status.DesiredGeneration != 3 || status.LocalSnapshotGeneration == nil || *status.LocalSnapshotGeneration != 3 {
		t.Fatal("local status")
	}
	latestBytes, err := store.Get(ctx, "content", "latest.json", 8192)
	must(t, err)
	var latest Latest
	must(t, json.Unmarshal(latestBytes, &latest))
	data, err := store.Get(ctx, "content", latest.SnapshotKey, storage.MaxSnapshotBytes)
	must(t, err)
	if storage.Digest(data) != latest.SHA256 {
		t.Fatal("snapshot hash")
	}
	var snapshot Snapshot
	must(t, json.Unmarshal(data, &snapshot))
	if len(snapshot.Content) != 3 || len(snapshot.Tags) != 1 || len(snapshot.Assets) != 1 || snapshot.Assets[0].URL != asset.URL {
		t.Fatal("full projection")
	}
	// Reopen both durable resources; no reseeding or rewriting takes place.
	must(t, db.Close())
	db, err = database.Open(ctx, cfg.DatabasePath)
	must(t, err)
	store, err = storage.NewFile(cfg.Publication.LocalRoot)
	must(t, err)
	a = auth.New(db, cfg, nil)
	c = content.NewWithPolicy(db, cfg.Publication.AssetPolicy(), a.PublicationFence())
	worker = New(db, cfg.Publication, store, a.PublicationFence(), nil)
	must(t, worker.ProcessOnce(ctx))
	note, err = c.Get(ctx, actor, note.ID)
	must(t, err)
	if note.Draft.CoverAsset.URL != asset.URL || !strings.Contains(note.Draft.BodyMarkdown, "本地持久化") {
		t.Fatal("restart lost draft/asset")
	}
	in := note.Draft.DraftInput
	in.BodyMarkdown += "\n\n下一版"
	saved, err := c.Save(ctx, actor, note.ID, in)
	must(t, err)
	_, err = c.PublishDirect(ctx, actor, note.ID, saved.Version)
	must(t, err)
	must(t, worker.ProcessOnce(ctx))
	status, err = worker.Status(ctx, actor)
	must(t, err)
	if status.DesiredGeneration != 4 || *status.LocalSnapshotGeneration != 4 {
		t.Fatal("next generation")
	}
	old, err := store.Get(ctx, "content", "snapshots/generation-1.json", storage.MaxSnapshotBytes)
	must(t, err)
	if !bytes.Equal(first, old) || requests.Load() != 0 {
		t.Fatal("immutable history or external isolation")
	}
}
