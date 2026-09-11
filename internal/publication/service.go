package publication

import (
	"context"
	"database/sql"
	"errors"
	"sync"
	"time"

	"github.com/deepfurry/gopher-atlas/internal/audit"
	"github.com/deepfurry/gopher-atlas/internal/auth"
	"github.com/deepfurry/gopher-atlas/internal/config"
	dbsqlc "github.com/deepfurry/gopher-atlas/internal/database/sqlc"
	"github.com/deepfurry/gopher-atlas/internal/fault"
	"github.com/deepfurry/gopher-atlas/internal/outbox"
	"github.com/deepfurry/gopher-atlas/internal/policy"
	"github.com/deepfurry/gopher-atlas/internal/storage"
	"go.uber.org/zap"
)

type Service struct {
	db     *sql.DB
	q      *dbsqlc.Queries
	cfg    config.Publication
	store  storage.ObjectStore
	fence  *outbox.Fence
	logger *zap.Logger
	flow   sync.Mutex
	now    func() time.Time
	export func(context.Context, int64) (Exported, error)
	hook   func(context.Context) error
	marker func(context.Context) (*Marker, error)
}

func New(db *sql.DB, cfg config.Publication, store storage.ObjectStore, fence *outbox.Fence, logger *zap.Logger) *Service {
	if fence == nil {
		panic("publication requires the shared writer fence")
	}
	if logger == nil {
		logger = zap.NewNop()
	}
	return &Service{db: db, q: dbsqlc.New(db), cfg: cfg, store: store, fence: fence, logger: logger, now: time.Now, export: (&Exporter{DB: db}).Export, hook: newHook(cfg.HookURL), marker: newMarkerFetcher(cfg.PublicSiteURL)}
}
func (s *Service) Configured() bool { return s.cfg.Configured() && s.store != nil }

type Job struct {
	ID             int64   `json:"id"`
	Generation     int64   `json:"generation"`
	State          string  `json:"state"`
	SnapshotKey    *string `json:"snapshotKey"`
	SnapshotSHA256 *string `json:"snapshotSha256"`
	Attempts       int64   `json:"attempts"`
	LastError      string  `json:"lastError"`
	NextAttemptAt  *int64  `json:"nextAttemptAt"`
	CreatedAt      int64   `json:"createdAt"`
	UpdatedAt      int64   `json:"updatedAt"`
	TriggeredAt    *int64  `json:"triggeredAt"`
	Retry          bool    `json:"retry"`
}
type JobPage struct {
	Items      []Job  `json:"items"`
	NextCursor *int64 `json:"nextCursor"`
}
type Status struct {
	DesiredGeneration  int64   `json:"desiredGeneration"`
	PipelineConfigured bool    `json:"pipelineConfigured"`
	LatestJob          *Job    `json:"latestJob"`
	PublicMarker       *Marker `json:"publicMarker"`
	ComputedState      string  `json:"computedState"`
}

func intPointer(n sql.NullInt64) *int64 {
	if !n.Valid {
		return nil
	}
	return &n.Int64
}
func stringPointer(s sql.NullString) *string {
	if !s.Valid {
		return nil
	}
	return &s.String
}
func jobDTO(j dbsqlc.PublicationJob, generation int64) Job {
	return Job{j.ID, j.Generation, j.State, stringPointer(j.SnapshotKey), stringPointer(j.SnapshotSha256), j.Attempts, j.LastError, intPointer(j.NextAttemptAt), j.CreatedAt, j.UpdatedAt, intPointer(j.TriggeredAt), j.Generation == generation && j.State == "failed"}
}
func (s *Service) authorized(ctx context.Context, actor auth.Principal, fn func(*dbsqlc.Queries, auth.Principal) error) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fault.Unavailable
	}
	defer tx.Rollback()
	q := dbsqlc.New(tx)
	p, err := auth.Reauthorize(ctx, q, actor, s.now().UnixMilli())
	if err != nil {
		return err
	}
	if !policy.For(p.User.Role, p.User.Status).RetryBuild {
		return fault.Permission
	}
	if err = fn(q, p); err != nil {
		return err
	}
	if tx.Commit() != nil {
		return fault.Unavailable
	}
	return nil
}
func (s *Service) Status(ctx context.Context, actor auth.Principal) (Status, error) {
	result := Status{PipelineConfigured: s.Configured(), ComputedState: "unknown"}
	err := s.authorized(ctx, actor, func(q *dbsqlc.Queries, _ auth.Principal) error {
		state, err := q.GetSiteState(ctx)
		if err != nil {
			return fault.Unavailable
		}
		result.DesiredGeneration = state.PublicationGeneration
		j, err := q.LatestPublicationJob(ctx)
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		if err != nil {
			return fault.Unavailable
		}
		dto := jobDTO(j, state.PublicationGeneration)
		result.LatestJob = &dto
		return nil
	})
	if err != nil {
		return result, err
	}
	// Optional status I/O is outside the transaction and never part of readiness.
	if s.Configured() {
		if marker, err := s.marker(ctx); err == nil {
			result.PublicMarker = marker
			switch {
			case marker.Generation == result.DesiredGeneration:
				result.ComputedState = "live"
			case marker.Generation < result.DesiredGeneration:
				result.ComputedState = "pending"
			default:
				result.ComputedState = "behind"
			}
		}
	}
	return result, nil
}
func (s *Service) Jobs(ctx context.Context, actor auth.Principal, after int64) (JobPage, error) {
	result := JobPage{Items: []Job{}}
	err := s.authorized(ctx, actor, func(q *dbsqlc.Queries, _ auth.Principal) error {
		if after < 0 {
			return fault.Validation
		}
		state, err := q.GetSiteState(ctx)
		if err != nil {
			return fault.Unavailable
		}
		rows, err := q.ListPublicationJobs(ctx, dbsqlc.ListPublicationJobsParams{AfterID: after, PageSize: 100})
		if err != nil {
			return fault.Unavailable
		}
		for _, r := range rows {
			result.Items = append(result.Items, jobDTO(r, state.PublicationGeneration))
		}
		if len(rows) == 100 {
			result.NextCursor = &rows[len(rows)-1].ID
		}
		return nil
	})
	return result, err
}
func (s *Service) Retry(ctx context.Context, actor auth.Principal, id int64) (Job, error) {
	var result Job
	if !s.flow.TryLock() {
		return result, fault.PublicationConflict
	}
	defer s.flow.Unlock()
	err := s.authorized(ctx, actor, func(q *dbsqlc.Queries, p auth.Principal) error {
		j, err := q.GetPublicationJob(ctx, id)
		if errors.Is(err, sql.ErrNoRows) {
			return fault.NotFound
		}
		if err != nil {
			return fault.Unavailable
		}
		state, err := q.GetSiteState(ctx)
		if err != nil {
			return fault.Unavailable
		}
		if j.State != "failed" || j.Generation != state.PublicationGeneration {
			return fault.PublicationRetryForbidden
		}
		now := s.now().UnixMilli()
		n, err := q.RetryPublicationJob(ctx, dbsqlc.RetryPublicationJobParams{ID: id, UpdatedAt: now})
		if err != nil {
			return fault.Unavailable
		}
		if n != 1 {
			return fault.PublicationConflict
		}
		if err := audit.Append(ctx, q, audit.Event{ActorID: p.User.ID, Action: "publication.retry_requested", EntityType: "publication", EntityID: id}, now); err != nil {
			return err
		}
		j, err = q.GetPublicationJob(ctx, id)
		if err != nil {
			return fault.Unavailable
		}
		result = jobDTO(j, state.PublicationGeneration)
		return nil
	})
	return result, err
}
