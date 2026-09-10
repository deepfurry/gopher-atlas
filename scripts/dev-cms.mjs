import { go } from './lib.mjs';

// Node's explicit --env-file-if-exists preserves process environment precedence.
// Production runs the Go binary with process environment only.
go('run', './cmd/gopheratlas-cms');
