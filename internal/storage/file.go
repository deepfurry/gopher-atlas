package storage

import (
	"context"
	"crypto/rand"
	"errors"
	"io"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
)

// File stores ordinary object bytes, not an encoded container or a metadata DB.
// os.Root enforces containment even when a directory is replaced with a symlink.
type File struct{ root string }

func NewFile(root string) (*File, error) {
	if root == "" {
		return nil, ErrIntegrity
	}
	abs, err := filepath.Abs(root)
	if err != nil {
		return nil, ErrUnavailable
	}
	if err = os.MkdirAll(abs, 0700); err != nil {
		return nil, ErrUnavailable
	}
	return &File{root: abs}, nil
}

func objectPath(bucket, key string) (string, error) {
	if bucket == "" || key == "" || strings.Contains(bucket, "/") || path.Clean(key) != key || strings.HasPrefix(key, "/") {
		return "", ErrIntegrity
	}
	for _, part := range strings.Split(bucket+"/"+key, "/") {
		if part == "" || part == "." || part == ".." || strings.HasSuffix(part, ".") || strings.HasSuffix(part, " ") {
			return "", ErrIntegrity
		}
		device := strings.ToUpper(strings.SplitN(part, ".", 2)[0])
		if device == "NUL" || device == "CON" || device == "PRN" || device == "AUX" || (len(device) == 4 && (strings.HasPrefix(device, "COM") || strings.HasPrefix(device, "LPT")) && device[3] >= '1' && device[3] <= '9') {
			return "", ErrIntegrity
		}
		for _, c := range part {
			if c <= 32 || c == 127 || strings.ContainsRune(`\:%?*<>"|`, c) {
				return "", ErrIntegrity
			}
		}
	}
	return bucket + "/" + key, nil
}

func fileError(err error) error {
	if errors.Is(err, os.ErrNotExist) {
		return ErrMissing
	}
	return ErrUnavailable
}

func (s *File) Get(ctx context.Context, bucket, key string, limit int64) ([]byte, error) {
	name, err := objectPath(bucket, key)
	if err != nil || limit <= 0 || limit > MaxSnapshotBytes {
		return nil, ErrIntegrity
	}
	if ctx.Err() != nil {
		return nil, ErrUnavailable
	}
	root, err := os.OpenRoot(s.root)
	if err != nil {
		return nil, fileError(err)
	}
	defer root.Close()
	f, err := root.Open(name)
	if err != nil {
		return nil, fileError(err)
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil || !info.Mode().IsRegular() {
		return nil, ErrUnavailable
	}
	if info.Size() > limit {
		return nil, ErrIntegrity
	}
	data, err := io.ReadAll(io.LimitReader(f, limit+1))
	if err != nil || ctx.Err() != nil {
		return nil, ErrUnavailable
	}
	if int64(len(data)) > limit {
		return nil, ErrIntegrity
	}
	return data, nil
}

func (s *File) Head(ctx context.Context, bucket, key string) (Metadata, error) {
	data, err := s.Get(ctx, bucket, key, MaxSnapshotBytes)
	if err != nil {
		return Metadata{}, err
	}
	// All application objects have deterministic metadata. Deriving it from bytes
	// and namespace avoids sidecars that could diverge from the object on a crash.
	m := Metadata{Size: int64(len(data)), SHA256: Digest(data), ContentType: http.DetectContentType(data)}
	if strings.HasPrefix(key, "media/sha256/") {
		m.CacheControl = "public, max-age=31536000, immutable"
	}
	if strings.HasPrefix(key, "snapshots/") && strings.HasSuffix(key, ".json") {
		m.ContentType = "application/json"
		m.CacheControl = "private, max-age=31536000, immutable"
	}
	if key == "latest.json" {
		m.ContentType = "application/json"
		m.CacheControl = "no-store"
	}
	return m, nil
}

func (s *File) PutImmutable(ctx context.Context, bucket, key string, data []byte, _ Options) error {
	return s.write(ctx, bucket, key, data, true)
}
func (s *File) Put(ctx context.Context, bucket, key string, data []byte, _ Options) error {
	if key != "latest.json" {
		return ErrIntegrity
	}
	return s.write(ctx, bucket, key, data, false)
}
func (s *File) write(ctx context.Context, bucket, key string, data []byte, immutable bool) error {
	name, err := objectPath(bucket, key)
	if err != nil || len(data) > MaxSnapshotBytes {
		return ErrIntegrity
	}
	if ctx.Err() != nil {
		return ErrUnavailable
	}
	root, err := os.OpenRoot(s.root)
	if err != nil {
		return ErrUnavailable
	}
	defer root.Close()
	if root.MkdirAll(path.Dir(name), 0700) != nil {
		return ErrUnavailable
	}
	tmp := path.Dir(name) + "/.object-" + rand.Text()
	f, err := root.OpenFile(tmp, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return ErrUnavailable
	}
	defer root.Remove(tmp)
	_, writeErr := f.Write(data)
	syncErr := f.Sync()
	closeErr := f.Close()
	if writeErr != nil || syncErr != nil || closeErr != nil || ctx.Err() != nil {
		return ErrUnavailable
	}
	if immutable {
		// Atomic no-replace publication, including competing File instances. Readers
		// see complete bytes; an interrupted write leaves only an unreferenced temp.
		if err = root.Link(tmp, name); err == nil {
			return nil
		}
		if !errors.Is(err, os.ErrExist) {
			return ErrUnavailable
		}
		existing, err := s.Head(ctx, bucket, key)
		if err != nil {
			return err
		}
		if existing.SHA256 != Digest(data) {
			return ErrIntegrity
		}
		return nil
	}
	if root.Rename(tmp, name) != nil {
		return ErrUnavailable
	}
	return nil
}
