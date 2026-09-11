package storage_test

import (
	"context"
	"crypto/rand"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"

	"github.com/deepfurry/gopher-atlas/internal/storage"
	"github.com/deepfurry/gopher-atlas/internal/testkit"
)

func TestR2AdapterImmutableConditionalWritesAndBounds(t *testing.T) {
	var mu sync.Mutex
	objects := map[string]testkit.StoredObject{}
	puts := 0
	conditional := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		if !strings.Contains(r.Header.Get("Authorization"), "/auto/s3/") {
			t.Error("static S3 signing/region missing")
		}
		old, exists := objects[r.URL.Path]
		switch r.Method {
		case "HEAD", "GET":
			if !exists {
				w.WriteHeader(404)
				return
			}
			w.Header().Set("X-Amz-Meta-Sha256", old.Metadata.SHA256)
			w.Header().Set("Content-Type", old.Metadata.ContentType)
			w.Header().Set("Cache-Control", old.Metadata.CacheControl)
			w.Header().Set("Content-Length", strconv.Itoa(len(old.Data)))
			if r.Method == "GET" {
				_, _ = w.Write(old.Data)
			}
		case "PUT":
			if r.Header.Get("If-None-Match") == "*" {
				conditional = true
				if exists {
					w.WriteHeader(412)
					return
				}
			}
			data, _ := io.ReadAll(r.Body)
			objects[r.URL.Path] = testkit.StoredObject{Data: data, Metadata: storage.Metadata{SHA256: r.Header.Get("X-Amz-Meta-Sha256"), ContentType: r.Header.Get("Content-Type"), CacheControl: r.Header.Get("Cache-Control")}}
			puts++
			w.WriteHeader(200)
		default:
			w.WriteHeader(405)
		}
	}))
	defer server.Close()
	r2 := storage.NewR2(server.URL, rand.Text(), rand.Text())
	ctx := context.Background()
	o := storage.Options{ContentType: "image/png", CacheControl: "public, max-age=31536000, immutable"}
	if _, err := r2.Head(ctx, "assets", "missing"); !errors.Is(err, storage.ErrMissing) {
		t.Fatal("missing Head")
	}
	if _, err := r2.Get(ctx, "content", "missing", 100); !errors.Is(err, storage.ErrMissing) {
		t.Fatal("missing Get")
	}
	for i := 0; i < 2; i++ {
		if err := r2.PutImmutable(ctx, "assets", "media/object.png", []byte("same"), o); err != nil {
			t.Fatal(err)
		}
	}
	if err := r2.PutImmutable(ctx, "assets", "media/object.png", []byte("changed"), o); !errors.Is(err, storage.ErrIntegrity) {
		t.Fatal("overwrote immutable object")
	}
	mu.Lock()
	observedPuts, observedConditional := puts, conditional
	mu.Unlock()
	if observedPuts != 1 || !observedConditional {
		t.Fatal("dedupe or conditional PUT missing")
	}
	meta, err := r2.Head(ctx, "assets", "media/object.png")
	if err != nil || meta.SHA256 != storage.Digest([]byte("same")) || meta.CacheControl != o.CacheControl {
		t.Fatal("metadata/cache")
	}
	if _, err := r2.Get(ctx, "assets", "media/object.png", 3); !errors.Is(err, storage.ErrIntegrity) {
		t.Fatal("Get size bound")
	}
	for _, body := range []string{"one", "two"} {
		if err := r2.Put(ctx, "content", "latest.json", []byte(body), storage.Options{ContentType: "application/json", CacheControl: "no-store"}); err != nil {
			t.Fatal(err)
		}
	}
	got, err := r2.Get(ctx, "content", "latest.json", 10)
	if err != nil || string(got) != "two" {
		t.Fatal("mutable pointer")
	}
	if err := r2.Put(ctx, "assets", "media/object.png", nil, o); !errors.Is(err, storage.ErrIntegrity) {
		t.Fatal("arbitrary mutable key")
	}
	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	if _, err := r2.Head(cancelled, "assets", "media/object.png"); err == nil {
		t.Fatal("cancel ignored")
	}
}
func TestR2ErrorsDoNotReflectProviderBody(t *testing.T) {
	marker := rand.Text()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(500); _, _ = io.WriteString(w, marker) }))
	defer server.Close()
	r2 := storage.NewR2(server.URL, rand.Text(), marker)
	_, err := r2.Head(context.Background(), "content", "latest.json")
	if !errors.Is(err, storage.ErrUnavailable) || strings.Contains(err.Error(), marker) {
		t.Fatal("provider error exposed")
	}
}

func TestR2ConditionalCreateRaceRechecksHash(t *testing.T) {
	for _, same := range []bool{true, false} {
		t.Run(strconv.FormatBool(same), func(t *testing.T) {
			var mu sync.Mutex
			heads := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				mu.Lock()
				defer mu.Unlock()
				if r.Method == "HEAD" {
					heads++
					if heads == 1 {
						w.WriteHeader(404)
						return
					}
					value := "same"
					if !same {
						value = "different"
					}
					w.Header().Set("X-Amz-Meta-Sha256", storage.Digest([]byte(value)))
					return
				}
				if r.Method != "PUT" || r.Header.Get("If-None-Match") != "*" {
					t.Error("unconditional race write")
				}
				w.WriteHeader(412)
			}))
			defer server.Close()
			err := storage.NewR2(server.URL, rand.Text(), rand.Text()).PutImmutable(context.Background(), "content", "snapshots/generation-1.json", []byte("same"), storage.Options{})
			if same && err != nil {
				t.Fatal("idempotent race rejected")
			}
			if !same && !errors.Is(err, storage.ErrIntegrity) {
				t.Fatal("different bytes accepted after race")
			}
		})
	}
}
