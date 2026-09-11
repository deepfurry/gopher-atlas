package assets

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"hash/crc32"
	"image"
	"image/color"
	"image/gif"
	"image/jpeg"
	"image/png"
	"strings"
	"testing"

	dbsqlc "github.com/deepfurry/gopher-atlas/internal/database/sqlc"
	"github.com/deepfurry/gopher-atlas/internal/fault"
	"github.com/deepfurry/gopher-atlas/internal/storage"
	"github.com/deepfurry/gopher-atlas/internal/testkit"
	"github.com/deepfurry/gopher-atlas/internal/testkit/identity"
)

func testImage(t *testing.T, format string) []byte {
	t.Helper()
	var b bytes.Buffer
	pic := image.NewRGBA(image.Rect(0, 0, 2, 3))
	pic.Set(0, 0, color.RGBA{R: 200, A: 255})
	var err error
	switch format {
	case "png":
		err = png.Encode(&b, pic)
	case "jpeg":
		err = jpeg.Encode(&b, pic, nil)
	case "gif":
		err = gif.Encode(&b, pic, nil)
	case "webp":
		data, e := base64.StdEncoding.DecodeString("UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAEAcQERGIiP4HAA==")
		if e != nil {
			t.Fatal(e)
		}
		return data
	}
	if err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}
func TestImageFormatsHashesAndBounds(t *testing.T) {
	for _, format := range []string{"png", "jpeg", "gif", "webp"} {
		data := testImage(t, format)
		info, err := Inspect(data)
		if err != nil {
			t.Fatal(format, err)
		}
		if info.SHA256 != storage.Digest(data) || !strings.Contains(info.Key, info.SHA256) || info.Width <= 0 || info.Height <= 0 {
			t.Fatal("image identity")
		}
		if _, _, err := image.Decode(bytes.NewReader(data)); err != nil {
			t.Fatal("test image is not decodable", format, err)
		}
	}
	for _, data := range [][]byte{[]byte("<svg xmlns='http://www.w3.org/2000/svg'/>"), []byte("pretend.png"), []byte("<!doctype html>"), []byte{137, 80, 78, 71, 13, 10, 26, 10}, nil} {
		if _, err := Inspect(data); err == nil {
			t.Fatal("invalid bytes accepted")
		}
	}
	if _, err := Inspect(make([]byte, MaxFileBytes+1)); !errors.Is(err, fault.AssetTooLarge) {
		t.Fatal("byte limit")
	}
	for _, size := range [][2]uint32{{16385, 1}, {10001, 10001}} {
		data := testImage(t, "png")
		binary.BigEndian.PutUint32(data[16:20], size[0])
		binary.BigEndian.PutUint32(data[20:24], size[1])
		binary.BigEndian.PutUint32(data[29:33], crc32.ChecksumIEEE(data[12:29]))
		if _, err := Inspect(data); !errors.Is(err, fault.AssetDimensions) {
			t.Fatal("dimension/pixel limit", err)
		}
	}
}

type interceptStore struct {
	storage.ObjectStore
	before func()
}

func (s interceptStore) PutImmutable(ctx context.Context, bucket, key string, data []byte, o storage.Options) error {
	s.before()
	return s.ObjectStore.PutImmutable(ctx, bucket, key, data, o)
}
func TestUploadDedupeSoftDeleteReauthorizationAndNoTransactionIO(t *testing.T) {
	ctx := context.Background()
	db := testkit.Database(t)
	admin := identity.Principal(t, db, 1, "admin")
	editor := identity.Principal(t, db, 2, "editor")
	reviewer := identity.Principal(t, db, 3, "reviewer")
	store := testkit.NewMemoryStore()
	s := New(db, interceptStore{store, func() {
		tx, err := db.BeginTx(ctx, nil)
		if err != nil {
			t.Fatal("R2 executed inside write transaction")
		}
		_ = tx.Rollback()
	}}, "assets")
	data := testImage(t, "png")
	a, err := s.Upload(ctx, editor, data)
	if err != nil {
		t.Fatal(err)
	}
	b, err := s.Upload(ctx, reviewer, data)
	if err != nil || b.ID != a.ID || len(store.Objects()) != 1 {
		t.Fatal("dedupe")
	}
	for key, object := range store.Objects() {
		if !strings.HasPrefix(key, "assets/media/sha256/") || object.Metadata.CacheControl != ImmutableCache || object.Metadata.ContentType != "image/png" {
			t.Fatal("bucket/cache/MIME")
		}
	}
	if _, err = s.SetDeleted(ctx, editor, a.ID, true); !errors.Is(err, fault.Permission) {
		t.Fatal("editor delete")
	}
	if _, err = s.SetDeleted(ctx, admin, a.ID, true); err != nil {
		t.Fatal(err)
	}
	page, err := s.List(ctx, editor, 0, false)
	if err != nil || len(page.Items) != 0 || len(store.Objects()) != 1 {
		t.Fatal("soft delete")
	}
	if _, err = s.Upload(ctx, editor, data); !errors.Is(err, fault.AssetDeleted) {
		t.Fatal("deleted duplicate silently restored")
	}
	if _, err = s.List(ctx, editor, 0, true); !errors.Is(err, fault.Permission) {
		t.Fatal("deleted visibility")
	}
	if _, err = s.SetDeleted(ctx, admin, a.ID, false); err != nil {
		t.Fatal(err)
	}
	var count int
	if err = db.QueryRow("SELECT count(*) FROM audit_events WHERE entity_type='asset'").Scan(&count); err != nil || count != 3 {
		t.Fatal("asset audit/dedupe")
	}
	state, err := dbsqlc.New(db).GetSiteState(ctx)
	if err != nil || state.PublicationGeneration != 0 {
		t.Fatal("asset operation queued publication")
	}
	s.store = interceptStore{store, func() {
		_, err := db.Exec("UPDATE users SET status='disabled' WHERE id=?", editor.User.ID)
		if err != nil {
			t.Fatal(err)
		}
	}}
	if _, err = s.Upload(ctx, editor, testImage(t, "jpeg")); !errors.Is(err, fault.Disabled) {
		t.Fatal("stale actor after external I/O")
	}
	if len(store.Objects()) != 2 {
		t.Fatal("expected harmless content-addressed orphan")
	}
	if err = db.QueryRow("SELECT count(*) FROM assets").Scan(&count); err != nil || count != 1 {
		t.Fatal("failed reauth inserted asset")
	}
	if _, err = New(db, nil, "").Upload(ctx, admin, data); !errors.Is(err, fault.PublicationNotConfigured) {
		t.Fatal("unconfigured upload")
	}
}
