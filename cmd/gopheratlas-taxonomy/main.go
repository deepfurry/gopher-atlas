// Explicit offline taxonomy upgrade tooling. No .env loading, migrations,
// networking, CMS startup or object-store writes occur here.
package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"flag"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/deepfurry/gopher-atlas/internal/database"
	dbsqlc "github.com/deepfurry/gopher-atlas/internal/database/sqlc"
	"github.com/deepfurry/gopher-atlas/internal/publication"
	"github.com/deepfurry/gopher-atlas/internal/taxonomyupgrade"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
func run() error {
	mode := flag.String("mode", "plan", "plan | apply | export (local file only)")
	path := flag.String("database", "", "explicit existing SQLite file; no environment fallback")
	fingerprint := flag.String("fingerprint", "", "reviewed plan fingerprint (apply)")
	actor := flag.Int64("actor-id", 0, "existing active Admin ID (apply)")
	stopped := flag.Bool("writer-stopped", false, "confirm sole CMS writer is stopped (apply)")
	output := flag.String("output", "", "new local output file (required for export)")
	flag.Parse()
	if flag.NArg() != 0 || *path == "" || (*mode != "plan" && *mode != "apply" && *mode != "export") {
		return fmt.Errorf("specify -mode plan|apply|export and -database explicitly")
	}
	info, err := os.Stat(*path)
	if err != nil || !info.Mode().IsRegular() {
		return fmt.Errorf("database must be an existing regular file")
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	if *mode == "export" && *output == "" {
		return fmt.Errorf("export requires a new local -output file")
	}
	// Reserve the report before any mutation; an existing file must not turn a
	// successful apply into an ambiguous output error.
	var outputFile *os.File
	if *output != "" {
		outputFile, err = os.OpenFile(*output, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
		if err != nil {
			return fmt.Errorf("unable to create new local output file")
		}
		defer outputFile.Close()
	}
	var db *sql.DB
	if *mode == "apply" {
		if !*stopped || *actor <= 0 || len(*fingerprint) != 64 {
			return fmt.Errorf("apply requires -writer-stopped, -actor-id and the reviewed -fingerprint")
		}
		db, err = database.Open(ctx, *path)
	} else {
		absolute, e := filepath.Abs(*path)
		if e != nil {
			return taxonomyupgrade.ErrUnavailable
		}
		name := filepath.ToSlash(absolute)
		if !strings.HasPrefix(name, "/") {
			name = "/" + name
		}
		dsn := url.URL{Scheme: "file", Path: name}
		params := url.Values{"mode": {"ro"}, "_pragma": {"query_only(ON)", "busy_timeout(5000)"}}
		dsn.RawQuery = params.Encode()
		db, err = sql.Open("sqlite", dsn.String())
	}
	if err != nil {
		return taxonomyupgrade.ErrUnavailable
	}
	defer db.Close()
	var data []byte
	var operationErr error
	if *mode == "export" {
		if *output == "" {
			return fmt.Errorf("export requires a new local -output file")
		}
		if err = database.Ready(ctx, db); err != nil {
			return taxonomyupgrade.ErrUnavailable
		}
		state, e := dbsqlc.New(db).GetSiteState(ctx)
		if e != nil {
			return taxonomyupgrade.ErrUnavailable
		}
		exported, e := (&publication.Exporter{DB: db}).Export(ctx, state.PublicationGeneration)
		if e != nil {
			return e
		}
		data = exported.Bytes
	} else {
		var plan taxonomyupgrade.Plan
		if *mode == "apply" {
			plan, operationErr = taxonomyupgrade.Apply(ctx, db, *fingerprint, *actor)
		} else {
			plan, operationErr = taxonomyupgrade.Inspect(ctx, db)
		}
		if operationErr != nil && plan.Fingerprint == "" {
			return operationErr
		}
		data, err = json.MarshalIndent(plan, "", "  ")
		if err != nil {
			return taxonomyupgrade.ErrUnavailable
		}
		if len(plan.Issues) > 0 && operationErr == nil {
			operationErr = taxonomyupgrade.ErrConflict
		}
	}
	if *mode != "export" {
		data = append(data, '\n')
	}
	if *output == "" {
		_, err = os.Stdout.Write(data)
	} else {
		_, err = outputFile.Write(data)
		if err == nil {
			err = outputFile.Sync()
		}

	}
	if err != nil {
		return fmt.Errorf("unable to write new local output file")
	}
	return operationErr
}
