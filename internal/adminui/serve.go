package adminui

import (
	"io/fs"
	"mime"
	"path"
	"strings"

	"github.com/deepfurry/gopher-atlas/internal/fault"
	"github.com/gofiber/fiber/v3"
)

func Handler() fiber.Handler {
	files := Files()
	return func(c fiber.Ctx) error {
		requestPath := c.Path()
		for _, prefix := range []string{"/api", "/ops", "/healthz", "/readyz"} {
			if requestPath == prefix || strings.HasPrefix(requestPath, prefix+"/") {
				return c.Next()
			}
		}
		if c.Method() != "GET" && c.Method() != "HEAD" {
			return c.Next()
		}
		if !Built {
			return fault.Unavailable
		}
		name := strings.TrimPrefix(path.Clean(requestPath), "/")
		data, err := fs.ReadFile(files, name)
		if err != nil {
			if strings.HasPrefix(requestPath, "/assets/") || path.Ext(name) != "" {
				return fiber.ErrNotFound
			}
			name = "index.html"
			data, err = fs.ReadFile(files, name)
			if err != nil {
				return fault.Unavailable
			}
		}
		c.Set("Content-Type", mime.TypeByExtension(path.Ext(name)))
		if strings.HasPrefix(name, "assets/") {
			c.Set("Cache-Control", "public, max-age=31536000, immutable")
		} else {
			c.Set("Cache-Control", "no-store")
		}
		return c.Send(data)
	}
}
