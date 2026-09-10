//go:build adminembed

package adminui

import (
	"io"
	"io/fs"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v3"
)

func TestProductionEmbedAndFallback(t *testing.T) {
	if !Built {
		t.Fatal("production embed not built")
	}
	index, err := fs.ReadFile(Files(), "index.html")
	if err != nil || !strings.Contains(string(index), "/assets/") {
		t.Fatal("Vite production index missing")
	}
	app := fiber.New()
	app.Use(Handler())
	for _, path := range []string{"/", "/users", "/profile/deep-link"} {
		response, err := app.Test(httptest.NewRequest("GET", path, nil))
		if err != nil {
			t.Fatal(err)
		}
		data, _ := io.ReadAll(response.Body)
		_ = response.Body.Close()
		if response.StatusCode != 200 || string(data) != string(index) || response.Header.Get("Cache-Control") != "no-store" {
			t.Fatal("SPA fallback incorrect")
		}
	}
	assets, err := fs.ReadDir(Files(), "assets")
	if err != nil || len(assets) < 2 {
		t.Fatal("production assets missing")
	}
	for _, asset := range assets {
		response, err := app.Test(httptest.NewRequest("GET", "/assets/"+asset.Name(), nil))
		if err != nil {
			t.Fatal(err)
		}
		_ = response.Body.Close()
		if response.StatusCode != 200 || !strings.Contains(response.Header.Get("Cache-Control"), "immutable") {
			t.Fatal("hashed asset caching incorrect")
		}
	}
	for _, path := range []string{"/assets/missing.js", "/api/missing", "/ops/missing", "/healthz/missing", "/readyz/missing"} {
		response, err := app.Test(httptest.NewRequest("GET", path, nil))
		if err != nil {
			t.Fatal(err)
		}
		_ = response.Body.Close()
		if response.StatusCode != 404 {
			t.Fatal("reserved path fell through to SPA")
		}
	}
}
