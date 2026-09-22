package storage

import (
	"bytes"
	"context"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"testing"
)

func TestFilePersistenceAndImmutableRace(t *testing.T) {
	dir := t.TempDir()
	s, err := NewFile(dir)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	data := []byte(`{"generation":1}`)
	key := "snapshots/generation-1.json"
	if err := s.PutImmutable(ctx, "content", key, data, Options{}); err != nil {
		t.Fatal(err)
	}
	s, err = NewFile(dir)
	if err != nil {
		t.Fatal(err)
	}
	if err = s.PutImmutable(ctx, "content", key, data, Options{}); err != nil {
		t.Fatal(err)
	}
	if err = s.PutImmutable(ctx, "content", key, []byte("other"), Options{}); !errors.Is(err, ErrIntegrity) {
		t.Fatal(err)
	}
	m, err := s.Head(ctx, "content", key)
	if err != nil || m.SHA256 != Digest(data) || m.Size != int64(len(data)) || m.ContentType != "application/json" {
		t.Fatal(m, err)
	}
	for _, body := range [][]byte{data, []byte(`{"generation":2}`)} {
		if err = s.Put(ctx, "content", "latest.json", body, Options{}); err != nil {
			t.Fatal(err)
		}
		got, err := s.Get(ctx, "content", "latest.json", 8192)
		if err != nil || !bytes.Equal(got, body) {
			t.Fatal(err)
		}
	}
	if got, _ := s.Get(ctx, "content", key, 8192); !bytes.Equal(got, data) {
		t.Fatal("immutable changed")
	}
	var wg sync.WaitGroup
	results := make(chan error, 2)
	for _, data := range [][]byte{[]byte("first"), []byte("second")} {
		wg.Go(func() {
			other, _ := NewFile(dir)
			results <- other.PutImmutable(ctx, "assets", "nested/race", data, Options{})
		})
	}
	wg.Wait()
	close(results)
	wins, conflicts := 0, 0
	for err := range results {
		if err == nil {
			wins++
		} else if errors.Is(err, ErrIntegrity) {
			conflicts++
		} else {
			t.Fatal(err)
		}
	}
	if wins != 1 || conflicts != 1 {
		t.Fatal(wins, conflicts)
	}
}

func TestFileBoundsAndContainment(t *testing.T) {
	s, _ := NewFile(t.TempDir())
	ctx := context.Background()
	if _, err := s.Get(ctx, "assets", "missing", 5); !errors.Is(err, ErrMissing) {
		t.Fatal(err)
	}
	if err := s.PutImmutable(ctx, "assets", "nested/object", []byte("abcdef"), Options{}); err != nil {
		t.Fatal(err)
	}
	for _, limit := range []int64{0, 5, MaxSnapshotBytes + 1} {
		if _, err := s.Get(ctx, "assets", "nested/object", limit); !errors.Is(err, ErrIntegrity) {
			t.Fatal(limit, err)
		}
	}
	for _, key := range []string{"", "../escape", "/absolute", "C:/drive", `..\escape`, `a\..\escape`, "a/../../escape", "a//b", "a/./b", "a/../b", "name:stream", "a./b", "a /b", "NUL"} {
		if err := s.PutImmutable(ctx, "assets", key, []byte("bad"), Options{}); err == nil {
			t.Fatal("unsafe key", key)
		}
	}
	for _, bucket := range []string{"", "../", "/assets", `C:\assets`, "a/b"} {
		if err := s.PutImmutable(ctx, bucket, "x", nil, Options{}); err == nil {
			t.Fatal("unsafe bucket", bucket)
		}
	}
	if s.Put(ctx, "content", "arbitrary", nil, Options{}) != ErrIntegrity {
		t.Fatal("mutable namespace")
	}
	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	if s.PutImmutable(cancelled, "assets", "cancelled", nil, Options{}) != ErrUnavailable {
		t.Fatal("cancellation")
	}
	if _, err := s.Get(ctx, "assets", "nested", 8192); err == nil {
		t.Fatal("directory read")
	}
	// OS-level containment also catches symlink traversal, where privileges allow.
	outside := t.TempDir()
	if err := os.Symlink(outside, filepath.Join(s.root, "escape")); err == nil {
		if s.PutImmutable(ctx, "escape", "outside", []byte("bad"), Options{}) == nil {
			t.Fatal("symlink escaped root")
		}
		if _, err := os.Stat(filepath.Join(outside, "outside")); !errors.Is(err, os.ErrNotExist) {
			t.Fatal("outside file created")
		}
	}
}
