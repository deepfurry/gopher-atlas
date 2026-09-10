//go:build !adminembed

package adminui

import "io/fs"

// Plain Go tooling works on clean checkouts. Production requires adminembed and
// fails at compile time when generated assets are absent.
const Built = false

func Files() fs.FS { return nil }
