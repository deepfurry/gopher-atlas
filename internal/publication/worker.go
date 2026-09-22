package publication

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	dbsqlc "github.com/deepfurry/gopher-atlas/internal/database/sqlc"
	"github.com/deepfurry/gopher-atlas/internal/fault"
	"github.com/deepfurry/gopher-atlas/internal/storage"
	"go.uber.org/zap"
)

type Latest struct {
	SchemaVersion int    `json:"schemaVersion"`
	Generation    int64  `json:"generation"`
	SnapshotKey   string `json:"snapshotKey"`
	SHA256        string `json:"sha256"`
	ExportedAt    string `json:"exportedAt"`
}

func snapshotKey(generation int64) string {
	return fmt.Sprintf("snapshots/generation-%d.json", generation)
}

const MaxAutomaticAttempts = 6

func backoff(attempt int64) time.Duration {
	delays := []time.Duration{30 * time.Second, 2 * time.Minute, 10 * time.Minute, 30 * time.Minute, time.Hour}
	if attempt < 1 {
		attempt = 1
	}
	if attempt > int64(len(delays)) {
		attempt = int64(len(delays))
	}
	return delays[attempt-1]
}
func safeClass(err error) string {
	switch {
	case errors.Is(err, storage.ErrIntegrity), errors.Is(err, fault.StorageIntegrity):
		return "storage_integrity_error"
	case errors.Is(err, storage.ErrUnavailable), errors.Is(err, storage.ErrMissing), errors.Is(err, fault.StorageUnavailable):
		return "storage_unavailable"
	case errors.Is(err, fault.SnapshotInvalid):
		return "snapshot_invalid"
	case errors.Is(err, fault.BuildTrigger):
		return "build_trigger_failed"
	default:
		return "dependency_unavailable"
	}
}

// Run is a lightweight durable poller. ProcessOnce also excludes concurrent
// callers, so only one external publication flow can execute in this process.
func (s *Service) Run(ctx context.Context) {
	if !s.Configured() {
		s.logger.Info("publication worker disabled: not configured")
		return
	}
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	for {
		if ctx.Err() != nil {
			return
		}
		_ = s.ProcessOnce(ctx)
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}
func (s *Service) fresh(ctx context.Context, generation int64) error {
	state, err := s.q.GetSiteState(ctx)
	if err != nil {
		return fault.Unavailable
	}
	if state.PublicationGeneration != generation {
		if err := s.q.SupersedePublicationJobs(ctx, dbsqlc.SupersedePublicationJobsParams{Generation: state.PublicationGeneration, Now: s.now().UnixMilli()}); err != nil {
			return fault.Unavailable
		}
		return fault.SnapshotStale
	}
	return nil
}
func (s *Service) ProcessOnce(ctx context.Context) error {
	if !s.Configured() {
		return fault.PublicationNotConfigured
	}
	if !s.flow.TryLock() {
		return nil
	}
	defer s.flow.Unlock()
	state, err := s.q.GetSiteState(ctx)
	if err != nil {
		return fault.Unavailable
	}
	if err = s.q.SupersedePublicationJobs(ctx, dbsqlc.SupersedePublicationJobsParams{Generation: state.PublicationGeneration, Now: s.now().UnixMilli()}); err != nil {
		return fault.Unavailable
	}
	job, err := s.q.LatestPublicationJob(ctx)
	if errors.Is(err, sql.ErrNoRows) && state.PublicationGeneration == 0 {
		return nil
	}
	if err != nil {
		return fault.Unavailable
	}
	if job.State == "build_triggered" || job.State == "superseded" {
		return nil
	}
	if job.State == "failed" && (!job.NextAttemptAt.Valid || job.NextAttemptAt.Int64 > s.now().UnixMilli()) {
		return nil
	}
	err = s.process(ctx, job)
	if err == nil || ctx.Err() != nil || errors.Is(err, fault.SnapshotStale) {
		return err
	}
	class := safeClass(err)
	attempt := job.Attempts + 1
	next := sql.NullInt64{}
	if attempt < MaxAutomaticAttempts {
		next = sql.NullInt64{Int64: s.now().Add(backoff(attempt)).UnixMilli(), Valid: true}
	}
	_, dbErr := s.q.FailPublicationJob(ctx, dbsqlc.FailPublicationJobParams{ID: job.ID, LastError: class, NextAttemptAt: next, UpdatedAt: s.now().UnixMilli()})
	s.logger.Warn("publication attempt failed", zap.Int64("generation", job.Generation), zap.Int64("job_id", job.ID), zap.String("stage", job.State), zap.Int64("attempt", attempt), zap.String("error_class", class))
	if dbErr != nil {
		return fault.Unavailable
	}
	return fault.Error(class)
}
func (s *Service) process(ctx context.Context, job dbsqlc.PublicationJob) error {
	if err := s.fresh(ctx, job.Generation); err != nil {
		return err
	}
	if !job.SnapshotKey.Valid {
		exported, err := s.export(ctx, job.Generation)
		if err != nil {
			return err
		}
		if err = s.fresh(ctx, job.Generation); err != nil {
			return err
		}
		key := snapshotKey(job.Generation)
		if err = s.store.PutImmutable(ctx, s.cfg.ContentBucket, key, exported.Bytes, storage.Options{ContentType: "application/json", CacheControl: "private, max-age=31536000, immutable"}); err != nil {
			return err
		}
		if err = s.fresh(ctx, job.Generation); err != nil {
			return err
		}
		n, err := s.q.MarkSnapshotUploaded(ctx, dbsqlc.MarkSnapshotUploadedParams{ID: job.ID, SnapshotKey: sql.NullString{String: key, Valid: true}, SnapshotSha256: sql.NullString{String: exported.SHA256, Valid: true}, UpdatedAt: s.now().UnixMilli()})
		if err != nil || n != 1 {
			return fault.Unavailable
		}
		job, err = s.q.GetPublicationJob(ctx, job.ID)
		if err != nil {
			return fault.Unavailable
		}
	}
	if job.SnapshotKey.String != snapshotKey(job.Generation) || !digestPattern.MatchString(job.SnapshotSha256.String) {
		return fault.SnapshotInvalid
	}
	err := func() error {
		// This closes the freshness-check / mutable-PUT race under the documented
		// one-writer assumption. Public mutations acquire the same fence before BEGIN.
		s.fence.Lock()
		defer s.fence.Unlock()
		if err := s.fresh(ctx, job.Generation); err != nil {
			return err
		}
		latest := Latest{1, job.Generation, job.SnapshotKey.String, job.SnapshotSha256.String, time.UnixMilli(job.CreatedAt).UTC().Format(time.RFC3339Nano)}
		data, err := json.Marshal(latest)
		if err != nil {
			return fault.SnapshotInvalid
		}
		if err = s.store.Put(ctx, s.cfg.ContentBucket, "latest.json", data, storage.Options{ContentType: "application/json", CacheControl: "no-store"}); err != nil {
			return err
		}
		if err = s.fresh(ctx, job.Generation); err != nil {
			return err
		}
		return s.hook(ctx)
	}()
	if err != nil {
		return err
	}
	// A crash here permits another accepted Hook after restart (at-least-once).
	n, err := s.q.MarkBuildTriggered(ctx, dbsqlc.MarkBuildTriggeredParams{ID: job.ID, Now: s.now().UnixMilli()})
	if err != nil || n != 1 {
		return fault.Unavailable
	}
	message := "publication build triggered"
	if s.cfg.Mode == "local" {
		message = "local publication snapshot ready"
	}
	s.logger.Info(message, zap.Int64("generation", job.Generation), zap.Int64("job_id", job.ID))
	return nil
}
