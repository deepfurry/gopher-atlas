// Package db exposes the real migration inputs for isolated tests and explicit tooling.
package db

import "embed"

//go:embed migrations/*.sql
var Migrations embed.FS
