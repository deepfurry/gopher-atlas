package app

import (
	"bytes"
	"context"
	"image"
	"image/png"
	"io"
	"net"
	"net/http"
	"testing"
	"time"

	"github.com/deepfurry/gopher-atlas/internal/assets"
	"github.com/deepfurry/gopher-atlas/internal/config"
	"github.com/deepfurry/gopher-atlas/internal/storage"
	"github.com/gofiber/fiber/v3"
)

func TestLocalAssetHTTPIsLoopbackOnlyAndAbsentInProduction(t *testing.T) {
	store, err := storage.NewFile(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	var body bytes.Buffer
	if png.Encode(&body, image.NewRGBA(image.Rect(0, 0, 2, 2))) != nil {
		t.Fatal("png")
	}
	info, err := assets.Inspect(body.Bytes())
	if err != nil {
		t.Fatal(err)
	}
	if store.PutImmutable(context.Background(), "assets", info.Key, body.Bytes(), storage.Options{}) != nil {
		t.Fatal("file write")
	}
	for _, production := range []bool{false, true} {
		cfg := config.Config{Environment: "development", Publication: config.Publication{Mode: "local", AssetsBucket: "assets"}}
		if production {
			cfg.Environment = "production"
		}
		server := fiber.New()
		registerLocalAssets(server, Dependencies{Config: cfg, Store: store})
		listener, err := net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			t.Fatal(err)
		}
		done := make(chan error, 1)
		go func() { done <- server.Listener(listener, fiber.ListenConfig{DisableStartupMessage: true}) }()
		client := &http.Client{Timeout: 2 * time.Second}
		for _, suffix := range []string{info.Key, "media/sha256/../private", "media/sha256/aa/missing.png", ""} {
			response, err := client.Get("http://" + listener.Addr().String() + "/__dev/assets/" + suffix)
			if err != nil {
				t.Fatal(err)
			}
			data, err := io.ReadAll(response.Body)
			_ = response.Body.Close()
			if err != nil {
				t.Fatal(err)
			}
			if !production && suffix == info.Key {
				if response.StatusCode != 200 || !bytes.Equal(data, body.Bytes()) || response.Header.Get("Content-Type") != "image/png" || response.Header.Get("Cache-Control") != assets.ImmutableCache {
					t.Fatal("asset delivery", response.StatusCode)
				}
			} else if response.StatusCode != 404 {
				t.Fatal("private route exposed", response.StatusCode)
			}
		}
		request, _ := http.NewRequest("GET", "http://"+listener.Addr().String()+"/__dev/assets/"+info.Key, nil)
		request.Host = "remote.example"
		response, err := client.Do(request)
		if err != nil {
			t.Fatal(err)
		}
		_ = response.Body.Close()
		if response.StatusCode != 404 {
			t.Fatal("non-loopback Host")
		}
		if server.Shutdown() != nil {
			t.Fatal("shutdown")
		}
		if err := <-done; err != nil {
			t.Fatal(err)
		}
	}
}
