package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"os/signal"
	"syscall"

	"github.com/deepfurry/gopher-atlas/internal/assets"
	"github.com/deepfurry/gopher-atlas/internal/audit"
	"github.com/deepfurry/gopher-atlas/internal/config"
	"github.com/deepfurry/gopher-atlas/internal/content"
	"github.com/deepfurry/gopher-atlas/internal/database"
	"github.com/deepfurry/gopher-atlas/internal/legacy"
	"github.com/deepfurry/gopher-atlas/internal/storage"
	"github.com/google/uuid"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "Legacy import:", err)
		os.Exit(1)
	}
}
func run() error {
	if len(os.Args) != 2 || os.Args[1] != "apply" {
		return errors.New("use node scripts/legacy-import.mjs plan|apply --source <checkout> --owner <CMS-author-ID> --author name=ID")
	}
	cfg, err := config.Load(os.Getenv)
	if err != nil {
		return err
	}
	if cfg.Environment != "development" {
		return errors.New("P0-5.5 apply is Development only; Production migration requires the P0-6 runbook")
	}
	// Offline operator: do not coexist with the in-process publication writer.
	guard, err := net.Listen("tcp", cfg.ListenAddr)
	if err != nil {
		return errors.New("stop the local CMS before offline legacy apply")
	}
	defer guard.Close()
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	ctx = audit.WithRequestID(ctx, uuid.NewString())
	var plan legacy.Plan
	decoder := json.NewDecoder(io.LimitReader(os.Stdin, 128<<20))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&plan) != nil || decoder.Decode(new(any)) != io.EOF {
		return errors.New("legacy_plan_invalid")
	}
	if len(plan.Errors) != 0 {
		return errors.New("legacy_plan_has_errors")
	}
	// Require an existing explicitly migrated database; never create/migrate here.
	if _, err := os.Stat(cfg.DatabasePath); err != nil {
		return errors.New("legacy_database_missing")
	}
	db, err := database.Open(ctx, cfg.DatabasePath)
	if err != nil {
		return err
	}
	defer db.Close()
	if database.Ready(ctx, db) != nil {
		return errors.New("legacy_database_not_ready")
	}
	principal, revoke, err := legacy.OperatorPrincipal(ctx, db, plan.OwnerID)
	if err != nil {
		return err
	}
	defer revoke()
	var objects storage.ObjectStore
	if cfg.Publication.Configured() {
		objects = storage.NewR2(cfg.Publication.Endpoint, cfg.Publication.AccessKeyID, cfg.Publication.SecretAccessKey)
	}
	importer := legacy.Importer{DB: db, Content: content.New(db), Assets: assets.New(db, objects, cfg.Publication.AssetsBucket), Download: legacy.DownloadImage}
	result, err := importer.Apply(ctx, principal, plan)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Partial import: tags=%d assets=%d content=%d. Review the Development DB before another apply.\n", result.Tags, result.Assets, result.Content)
		return err
	}
	return json.NewEncoder(os.Stdout).Encode(result)
}
