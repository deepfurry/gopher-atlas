// Package app owns the single Fiber assembly and middleware ordering.
package app

import (
	"database/sql"
	"time"

	"github.com/deepfurry/gopher-atlas/internal/adminui"
	"github.com/deepfurry/gopher-atlas/internal/assets"
	"github.com/deepfurry/gopher-atlas/internal/audit"
	"github.com/deepfurry/gopher-atlas/internal/auth"
	"github.com/deepfurry/gopher-atlas/internal/config"
	"github.com/deepfurry/gopher-atlas/internal/content"
	httptransport "github.com/deepfurry/gopher-atlas/internal/http"
	"github.com/deepfurry/gopher-atlas/internal/publication"
	"github.com/deepfurry/gopher-atlas/internal/storage"
	"github.com/gofiber/contrib/v3/monitor"
	fiberzap "github.com/gofiber/contrib/v3/zap"
	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/recover"
	"github.com/gofiber/fiber/v3/middleware/requestid"
	"github.com/gofiber/utils/v2"
	"github.com/valyala/fasthttp"
	"go.uber.org/zap"
)

type Dependencies struct {
	Publication *publication.Service
	Store       storage.ObjectStore
	Config      config.Config
	DB          *sql.DB
	Auth        *auth.Service
	Logger      *zap.Logger
}

func New(deps Dependencies) *fiber.App {
	server := fiber.New(fiber.Config{
		AppName:       "GopherAtlas CMS",
		ErrorHandler:  httptransport.ErrorHandler,
		BodyLimit:     assets.OuterBodyLimit,
		StrictRouting: true,
		CaseSensitive: true,
		ReadTimeout:   15 * time.Second,
		WriteTimeout:  30 * time.Second,
		IdleTimeout:   60 * time.Second,
	})
	if deps.Publication == nil {
		deps.Publication = publication.New(deps.DB, deps.Config.Publication, deps.Store, deps.Auth.PublicationFence(), deps.Logger)
	}
	handler := &httptransport.Handler{Publication: deps.Publication, Config: deps.Config, DB: deps.DB, Auth: deps.Auth, Assets: assets.New(deps.DB, deps.Store, deps.Config.Publication.AssetsBucket), Content: content.New(deps.DB, deps.Auth.PublicationFence())}
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
		c.SetContext(audit.WithRequestID(c.Context(), requestid.FromContext(c)))
		c.Set("Cache-Control", "no-store")
		c.Set("Referrer-Policy", "no-referrer")
		c.Set("X-Content-Type-Options", "nosniff")
		c.Set("X-Frame-Options", "DENY")
		return c.Next()
	})
	server.Use(handler.MonitorGuard)
	server.Use(monitor.New(monitor.Config{Title: "GopherAtlas CMS", EnableGCPauseMetrics: false, Next: func(c fiber.Ctx) bool { return c.Path() != "/ops/monitor" }}))
	server.Use(recover.New())
	server.Use(httptransport.BodyLimits)
	handler.Register(server)
	server.Use(adminui.Handler())
	// Reject ordinary oversized requests from their headers before buffering a
	// body; retain the middleware length check for in-process requests as well.
	server.Server().HeaderReceived = func(h *fasthttp.RequestHeader) fasthttp.RequestConfig {
		return fasthttp.RequestConfig{MaxRequestBodySize: httptransport.RequestBodyLimit(string(h.Method()), string(h.RequestURI()), string(h.ContentType()))}
	}
	return server
}
