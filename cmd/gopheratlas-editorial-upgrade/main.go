// Explicit offline activation after Schema 5. Never reads environment files or
// constructs storage/network clients. Production use needs separate authorization.
package main

import (
	"context"
	"flag"
	"fmt"
	"github.com/deepfurry/gopher-atlas/internal/database"
	"github.com/deepfurry/gopher-atlas/internal/editorialupgrade"
	"os"
)

func main() {
	path := flag.String("db", "", "existing offline database")
	actor := flag.Int64("actor-id", 0, "active Admin ID")
	generation := flag.Int64("expected-generation", -1, "reviewed current generation")
	stopped := flag.Bool("writer-stopped", false, "all writers stopped")
	flag.Parse()
	if err := activate(*path, *actor, *generation, *stopped); err != nil {
		fmt.Fprintln(os.Stderr, "editorial upgrade refused:", err)
		os.Exit(1)
	}
	fmt.Println("Schema 5 editorial activation complete; one fresh v3 generation queued. No remote I/O.")
}
func activate(path string, actor, generation int64, stopped bool) error {
	if !stopped || actor <= 0 || generation < 0 {
		return fmt.Errorf("explicit offline inputs required")
	}
	info, err := os.Stat(path)
	if err != nil || !info.Mode().IsRegular() {
		return fmt.Errorf("existing database required")
	}
	ctx := context.Background()
	db, err := database.Open(ctx, path)
	if err != nil {
		return fmt.Errorf("database unavailable")
	}
	defer db.Close()
	return editorialupgrade.Activate(ctx, db, actor, generation)
}
