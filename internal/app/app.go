// Package app owns the single Fiber assembly and middleware ordering.
package app

import (
	"database/sql"
	"time"

	"github.com/deepfurry/gopher-atlas/internal/adminui"
	"github.com/deepfurry/gopher-atlas/internal/auth"
	"github.com/deepfurry/gopher-atlas/internal/config"
	httptransport "github.com/deepfurry/gopher-atlas/internal/http"
	"github.com/gofiber/contrib/v3/monitor"
	fiberzap "github.com/gofiber/contrib/v3/zap"
	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/recover"
	"github.com/gofiber/fiber/v3/middleware/requestid"
	"github.com/gofiber/utils/v2"
	"go.uber.org/zap"
)

type Dependencies struct {
	Config config.Config
	DB     *sql.DB
	Auth   *auth.Service
	Logger *zap.Logger
}

func New(deps Dependencies) *fiber.App {
	server := fiber.New(fiber.Config{
		AppName:       "GopherAtlas CMS",
		ErrorHandler:  httptransport.ErrorHandler,
		BodyLimit:     32 << 10,
		StrictRouting: true,
		CaseSensitive: true,
		ReadTimeout:   15 * time.Second,
		WriteTimeout:  30 * time.Second,
		IdleTimeout:   60 * time.Second,
	})
	handler := &httptransport.Handler{Config: deps.Config, DB: deps.DB, Auth: deps.Auth}
	// Supplied request IDs could carry sensitive data into logs.
	server.Use(func(c fiber.Ctx) error { c.Request().Header.Del(fiber.HeaderXRequestID); return c.Next() })
	server.Use(requestid.New(requestid.Config{Generator: utils.UUIDv4}))
	server.Use(fiberzap.New(fiberzap.Config{
		Logger:     deps.Logger,
		Fields:     []string{"latency", "status", "method", "path"},
		FieldsFunc: func(c fiber.Ctx) []zap.Field { return []zap.Field{zap.String("request_id", requestid.FromContext(c))} },
		SkipURIs:   []string{"/healthz", "/readyz", "/ops/monitor"},
	}))
	server.Use(func(c fiber.Ctx) error {
		c.Set("Cache-Control", "no-store")
		c.Set("Referrer-Policy", "no-referrer")
		c.Set("X-Content-Type-Options", "nosniff")
		c.Set("X-Frame-Options", "DENY")
		return c.Next()
	})
	server.Use(handler.MonitorGuard)
	server.Use(monitor.New(monitor.Config{Title: "GopherAtlas CMS", EnableGCPauseMetrics: false, Next: func(c fiber.Ctx) bool { return c.Path() != "/ops/monitor" }}))
	server.Use(recover.New())
	handler.Register(server)
	server.Use(adminui.Handler())
	return server
}
