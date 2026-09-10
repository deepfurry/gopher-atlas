package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/deepfurry/gopher-atlas/internal/app"
	"github.com/deepfurry/gopher-atlas/internal/auth"
	"github.com/deepfurry/gopher-atlas/internal/config"
	"github.com/deepfurry/gopher-atlas/internal/database"
	"github.com/deepfurry/gopher-atlas/internal/logging"
	"github.com/deepfurry/gopher-atlas/internal/oauth"
	fiberzap "github.com/gofiber/contrib/v3/zap"
	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/log"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "CMS:", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load(os.Getenv)
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	logger, closeLog, err := logging.New(cfg.Log)
	if err != nil {
		return err
	}
	defer closeLog()
	log.SetLogger(fiberzap.NewLogger(fiberzap.LoggerConfig{SetLogger: logger}))
	openCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	pool, err := database.Open(openCtx, cfg.DatabasePath)
	if err != nil {
		return err
	}
	defer pool.Close()
	if database.Ready(openCtx, pool) != nil {
		logger.Warn("CMS persistence is not ready; apply explicit migrations")
	}
	var provider oauth.Provider
	if cfg.OAuthClientID != "" {
		provider = oauth.NewGitHub(cfg.OAuthClientID, cfg.OAuthClientSecret, cfg.OAuthRedirectURI)
	}
	service := auth.New(pool, cfg, provider)
	server := app.New(app.Dependencies{Config: cfg, DB: pool, Auth: service, Logger: logger})
	logger.Info("CMS starting")
	err = server.Listen(cfg.ListenAddr, fiber.ListenConfig{
		DisableStartupMessage: true,
		GracefulContext:       ctx,
		ListenerNetwork:       "tcp",
		ShutdownTimeout:       15 * time.Second,
	})
	logger.Info("CMS stopped")
	if err != nil {
		return errors.New("CMS listener failed")
	}
	return nil
}
