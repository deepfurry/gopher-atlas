// Package storage is the bounded object boundary for immutable assets/snapshots
// and the sole mutable content pointer, latest.json. It never logs provider errors.
package storage

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
)

const MaxSnapshotBytes = 128 << 20

var (
	ErrMissing     = errors.New("object_missing")
	ErrUnavailable = errors.New("storage_unavailable")
	ErrIntegrity   = errors.New("storage_integrity_error")
)

type Metadata struct {
	SHA256, ContentType, CacheControl string
	Size                              int64
}
type Options struct{ ContentType, CacheControl string }
type ObjectStore interface {
	Head(context.Context, string, string) (Metadata, error)
	Get(context.Context, string, string, int64) ([]byte, error)
	PutImmutable(context.Context, string, string, []byte, Options) error
	Put(context.Context, string, string, []byte, Options) error
}

func Digest(data []byte) string { sum := sha256.Sum256(data); return hex.EncodeToString(sum[:]) }
