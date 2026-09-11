package testkit

import (
	"context"
	"github.com/deepfurry/gopher-atlas/internal/storage"
	"sync"
)

type StoredObject struct {
	Data     []byte
	Metadata storage.Metadata
}
type MemoryStore struct {
	mu      sync.Mutex
	objects map[string]StoredObject
}

func NewMemoryStore() *MemoryStore { return &MemoryStore{objects: map[string]StoredObject{}} }
func (m *MemoryStore) Objects() map[string]StoredObject {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := map[string]StoredObject{}
	for k, v := range m.objects {
		v.Data = append([]byte(nil), v.Data...)
		out[k] = v
	}
	return out
}
func (m *MemoryStore) Head(ctx context.Context, bucket, key string) (storage.Metadata, error) {
	if err := ctx.Err(); err != nil {
		return storage.Metadata{}, err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	v, ok := m.objects[bucket+"/"+key]
	if !ok {
		return storage.Metadata{}, storage.ErrMissing
	}
	return v.Metadata, nil
}
func (m *MemoryStore) Get(ctx context.Context, bucket, key string, limit int64) ([]byte, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	v, ok := m.objects[bucket+"/"+key]
	if !ok {
		return nil, storage.ErrMissing
	}
	if int64(len(v.Data)) > limit {
		return nil, storage.ErrIntegrity
	}
	return append([]byte(nil), v.Data...), nil
}
func (m *MemoryStore) put(ctx context.Context, bucket, key string, data []byte, o storage.Options, immutable bool) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	path := bucket + "/" + key
	sha := storage.Digest(data)
	if old, ok := m.objects[path]; ok && immutable {
		if old.Metadata.SHA256 == sha {
			return nil
		}
		return storage.ErrIntegrity
	}
	m.objects[path] = StoredObject{append([]byte(nil), data...), storage.Metadata{SHA256: sha, ContentType: o.ContentType, CacheControl: o.CacheControl, Size: int64(len(data))}}
	return nil
}
func (m *MemoryStore) PutImmutable(ctx context.Context, bucket, key string, data []byte, o storage.Options) error {
	return m.put(ctx, bucket, key, data, o, true)
}
func (m *MemoryStore) Put(ctx context.Context, bucket, key string, data []byte, o storage.Options) error {
	if key != "latest.json" {
		return storage.ErrIntegrity
	}
	return m.put(ctx, bucket, key, data, o, false)
}
