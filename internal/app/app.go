// Package app owns composition. Services and integrations will be wired here.
package app

import (
	httptransport "github.com/deepfurry/gopher-atlas/internal/http"
	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/recover"
	"github.com/gofiber/fiber/v3/middleware/requestid"
)

func New() *fiber.App {
	server := fiber.New(fiber.Config{
		AppName:      "GopherAtlas CMS",
		ErrorHandler: httptransport.ErrorHandler,
	})
	server.Use(requestid.New())
	// P0-1 inserts shared Zap, endpoint guard, then app-wide Monitor here.
	// Recover must remain after Monitor; see contracts/upstream.md.
	server.Use(recover.New())
	httptransport.Register(server)
	return server
}
