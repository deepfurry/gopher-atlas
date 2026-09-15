package publication

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"time"

	"github.com/deepfurry/gopher-atlas/internal/storage"
)

func (s *Service) localStatus(ctx context.Context, result *Status) {
	data, err := s.store.Get(ctx, s.cfg.ContentBucket, "latest.json", 8192)
	if errors.Is(err, storage.ErrMissing) {
		result.ComputedState = "pending"
		return
	}
	if err != nil {
		return
	}
	var latest Latest
	d := json.NewDecoder(bytes.NewReader(data))
	d.DisallowUnknownFields()
	if d.Decode(&latest) != nil || d.Decode(new(any)) != io.EOF || latest.SchemaVersion != 1 || latest.Generation < 1 || latest.SnapshotKey != snapshotKey(latest.Generation) || !digestPattern.MatchString(latest.SHA256) {
		return
	}
	if _, err := time.Parse(time.RFC3339Nano, latest.ExportedAt); err != nil {
		return
	}
	meta, err := s.store.Head(ctx, s.cfg.ContentBucket, latest.SnapshotKey)
	if err != nil || meta.SHA256 != latest.SHA256 {
		return
	}
	result.LocalSnapshotGeneration = &latest.Generation
	switch {
	case latest.Generation == result.DesiredGeneration:
		result.ComputedState = "live"
	case latest.Generation < result.DesiredGeneration:
		result.ComputedState = "pending"
	default:
		result.ComputedState = "behind"
	}
}
