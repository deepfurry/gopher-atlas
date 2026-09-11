package publication

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/deepfurry/gopher-atlas/internal/fault"
)

func TestHookAcceptanceErrorsTimeoutAndPrivacy(t *testing.T) {
	marker := rand.Text()
	for _, status := range []int{200, 202, 204, 302, 400, 500} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method != "POST" || r.Header.Get("Authorization") != "" || r.Header.Get("Cookie") != "" {
					t.Error("hook request")
				}
				w.Header().Set("Location", "http://unreachable.invalid")
				w.WriteHeader(status)
				_, _ = io.WriteString(w, marker)
			}))
			defer server.Close()
			err := newHook(server.URL + "/" + marker)(ctx)
			if status < 300 {
				must(t, err)
			} else if !errors.Is(err, fault.BuildTrigger) || strings.Contains(err.Error(), marker) {
				t.Fatal("unsafe hook failure")
			}
		})
	}
	server := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) { <-r.Context().Done() }))
	short, cancel := context.WithTimeout(ctx, 25*time.Millisecond)
	defer cancel()
	if !errors.Is(newHook(server.URL)(short), fault.BuildTrigger) {
		t.Fatal("timeout")
	}
	server.Close()
	if !errors.Is(newHook(server.URL)(ctx), fault.BuildTrigger) {
		t.Fatal("connection failure")
	}
}

func TestMarkerStrictParsingAndBoundedCredentialFreeFetch(t *testing.T) {
	valid := Marker{1, 0, strings.Repeat("a", 64), time.Now().UTC().Format(time.RFC3339Nano), strings.Repeat("b", 40), "fixture-build"}
	data, err := json.Marshal(valid)
	must(t, err)
	_, err = parseMarker(data)
	must(t, err)
	for _, bad := range []string{strings.Replace(string(data), `"generation":0,`, "", 1), strings.Replace(string(data), `"generation":0`, `"generation":null`, 1), strings.Replace(string(data), `"generation":0`, `"generation":0,"generation":0`, 1), strings.Replace(string(data), `"schemaVersion":1`, `"schemaVersion":0`, 1), strings.Replace(string(data), `"generation":0`, `"generation":-1`, 1), string(data) + "{}", strings.Replace(string(data), `"buildId"`, `"secret"`, 1)} {
		if _, err := parseMarker([]byte(bad)); err == nil {
			t.Fatal("invalid marker accepted")
		}
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/.well-known/gopheratlas-build.json" || r.Header.Get("Authorization") != "" || r.Header.Get("Cookie") != "" {
			t.Error("marker request")
		}
		_, _ = w.Write(data)
	}))
	defer server.Close()
	got, err := newMarkerFetcher(server.URL)(ctx)
	must(t, err)
	if got.Generation != 0 {
		t.Fatal("marker")
	}
	large := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = io.WriteString(w, strings.Repeat(" ", 8193)) }))
	defer large.Close()
	if _, err := newMarkerFetcher(large.URL)(ctx); err == nil {
		t.Fatal("unbounded marker")
	}
}
