//go:build adminembed

// Package adminui owns the generated production SPA assets.
package adminui

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var content embed.FS

const Built = true

func Files() fs.FS {
	files, err := fs.Sub(content, "dist")
	if err != nil {
		panic("invalid embedded Admin assets")
	}
	return files
}
