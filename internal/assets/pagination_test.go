package assets

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"slices"
	"testing"

	dbsqlc "github.com/deepfurry/gopher-atlas/internal/database/sqlc"
	"github.com/deepfurry/gopher-atlas/internal/fault"
	"github.com/deepfurry/gopher-atlas/internal/testkit"
	"github.com/deepfurry/gopher-atlas/internal/testkit/identity"
)

func TestListDescendingPageBoundaries(t *testing.T) {
	for _, count := range []int{0, 1, 19, 20, 21, 40, 41} {
		t.Run(fmt.Sprint(count), func(t *testing.T) {
			ctx := context.Background()
			db := testkit.Database(t)
			admin := identity.Principal(t, db, 1, "admin")
			q := dbsqlc.New(db)
			var want []int64
			for i := 0; i < count; i++ {
				a, err := q.CreateAsset(ctx, dbsqlc.CreateAssetParams{
					Sha256: fmt.Sprintf("%064x", i), ObjectKey: fmt.Sprintf("fixture/%d.png", i),
					MimeType: "image/png", ByteSize: 1, Width: 1, Height: 1,
					CreatedBy: admin.User.ID, CreatedAt: 1,
				})
				if err != nil {
					t.Fatal(err)
				}
				want = append(want, a.ID)
			}
			slices.Reverse(want)
			s := New(db, nil, "")
			var after int64
			for offset := 0; ; offset += 20 {
				page, err := s.List(ctx, admin, after, false)
				if err != nil {
					t.Fatal(err)
				}
				end := min(offset+20, count)
				var got []int64
				for _, a := range page.Items {
					got = append(got, a.ID)
				}
				if !slices.Equal(got, want[offset:end]) || page.Items == nil {
					t.Fatalf("after %d: got %v, want %v", after, got, want[offset:end])
				}
				if end == count {
					if page.NextCursor != nil {
						t.Fatal("terminal page advertises another page")
					}
					break
				}
				if page.NextCursor == nil || *page.NextCursor != got[len(got)-1] {
					t.Fatal("cursor must be the last displayed ID")
				}
				after = *page.NextCursor
			}
			if _, err := s.List(ctx, admin, -1, false); !errors.Is(err, fault.Validation) {
				t.Fatal("negative cursor accepted", err)
			}
			page, err := s.List(ctx, admin, 1, false)
			if err != nil || len(page.Items) != 0 || page.NextCursor != nil {
				t.Fatal("cursor beyond the oldest record", page, err)
			}
		})
	}
}

func TestListUploadDedupeDeleteRestoreOrder(t *testing.T) {
	ctx := context.Background()
	db := testkit.Database(t)
	admin := identity.Principal(t, db, 1, "admin")
	s := New(db, testkit.NewMemoryStore(), "assets")
	var first Asset
	var firstBytes []byte
	for i := 1; i <= 21; i++ {
		pic := image.NewRGBA(image.Rect(0, 0, 1, 1))
		pic.Set(0, 0, color.RGBA{R: uint8(i), A: 255})
		var data bytes.Buffer
		if err := png.Encode(&data, pic); err != nil {
			t.Fatal(err)
		}
		a, err := s.Upload(ctx, admin, data.Bytes())
		if err != nil || a.ID != int64(i) {
			t.Fatal("new uploads must have increasing IDs", a.ID, err)
		}
		if i == 1 {
			first, firstBytes = a, data.Bytes()
		}
	}
	check := func(deleted bool, after int64, want []int64, cursor int64) {
		t.Helper()
		page, err := s.List(ctx, admin, after, deleted)
		if err != nil {
			t.Fatal(err)
		}
		var got []int64
		for _, a := range page.Items {
			got = append(got, a.ID)
		}
		if !slices.Equal(got, want) || (cursor == 0 && page.NextCursor != nil) ||
			(cursor != 0 && (page.NextCursor == nil || *page.NextCursor != cursor)) {
			t.Fatalf("after=%d deleted=%t: got %v cursor=%v, want %v cursor=%d", after, deleted, got, page.NextCursor, want, cursor)
		}
	}
	descending := func(high, low int64) []int64 {
		var ids []int64
		for id := high; id >= low; id-- {
			ids = append(ids, id)
		}
		return ids
	}
	check(false, 0, descending(21, 2), 2)
	duplicate, err := s.Upload(ctx, admin, firstBytes)
	if err != nil || duplicate.ID != first.ID || duplicate.CreatedAt != first.CreatedAt || duplicate.URL != first.URL {
		t.Fatal("dedupe changed asset identity", duplicate, err)
	}
	check(false, 0, descending(21, 2), 2)
	check(false, 2, []int64{1}, 0)
	for _, id := range []int64{21, 1} {
		if _, err := s.SetDeleted(ctx, admin, id, true); err != nil {
			t.Fatal(err)
		}
	}
	check(false, 0, descending(20, 2), 0)
	check(true, 0, descending(21, 2), 2)
	check(true, 2, []int64{1}, 0)
	if _, err := s.Upload(ctx, admin, firstBytes); !errors.Is(err, fault.AssetDeleted) {
		t.Fatal("deleted duplicate must require explicit restore", err)
	}
	restored, err := s.SetDeleted(ctx, admin, first.ID, false)
	if err != nil || restored.ID != first.ID || restored.CreatedAt != first.CreatedAt || restored.URL != first.URL {
		t.Fatal("restoration changed identity", restored, err)
	}
	check(false, 0, descending(20, 1), 0)
	if _, err := s.SetDeleted(ctx, admin, 21, false); err != nil {
		t.Fatal(err)
	}
	check(false, 0, descending(21, 2), 2)
	check(false, 2, []int64{1}, 0)
}
