package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/deepfurry/gopher-atlas/internal/app"
	"github.com/deepfurry/gopher-atlas/internal/config"
	"github.com/gofiber/fiber/v3"
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
	return app.New().Listen(cfg.ListenAddr, fiber.ListenConfig{
		DisableStartupMessage: true,
		GracefulContext:       ctx,
		ListenerNetwork:       "tcp",
	})
}
