package app

import (
	"errors"
	"net"
	"net/url"

	"github.com/deepfurry/gopher-atlas/internal/assets"
	"github.com/deepfurry/gopher-atlas/internal/markdown"
	"github.com/deepfurry/gopher-atlas/internal/storage"
	"github.com/gofiber/fiber/v3"
)

func registerLocalAssets(server *fiber.App, deps Dependencies) {
	if deps.Config.Environment != "development" || deps.Config.Publication.Mode != "local" || deps.Store == nil {
		return
	}
	server.Get("/__dev/assets/*", func(c fiber.Ctx) error {
		// Never trust a proxy-forwarded address for this unauthenticated dev route.
		remote := c.RequestCtx().RemoteIP()
		u, err := url.Parse("http://" + c.Get("Host"))
		if err != nil || remote == nil || !remote.IsLoopback() {
			return fiber.ErrNotFound
		}
		host := net.ParseIP(u.Hostname())
		if u.Hostname() != "localhost" && (host == nil || !host.IsLoopback()) {
			return fiber.ErrNotFound
		}
		key := c.Params("*")
		if !markdown.ValidAssetKey(key) {
			return fiber.ErrNotFound
		}
		data, err := deps.Store.Get(c.Context(), deps.Config.Publication.AssetsBucket, key, assets.MaxFileBytes)
		if errors.Is(err, storage.ErrMissing) {
			return fiber.ErrNotFound
		}
		if err != nil {
			return fiber.ErrServiceUnavailable
		}
		info, err := assets.Inspect(data)
		if err != nil || info.Key != key {
			return fiber.ErrNotFound
		}
		c.Set("Content-Type", info.MIME)
		c.Set("Cache-Control", assets.ImmutableCache)
		return c.Send(data)
	})
}
