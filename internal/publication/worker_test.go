package publication

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/deepfurry/gopher-atlas/internal/fault"
	"github.com/deepfurry/gopher-atlas/internal/storage"
)

type hookedStore struct {
	storage.ObjectStore
	immutable func(context.Context) error
	mutable   func(context.Context) error
}

func (s hookedStore) PutImmutable(c context.Context, b, k string, d []byte, o storage.Options) error {
	if s.immutable != nil {
		if err := s.immutable(c); err != nil {
			return err
		}
	}
	return s.ObjectStore.PutImmutable(c, b, k, d, o)
}
func (s hookedStore) Put(c context.Context, b, k string, d []byte, o storage.Options) error {
	if s.mutable != nil {
		if err := s.mutable(c); err != nil {
			return err
		}
	}
	return s.ObjectStore.Put(c, b, k, d, o)
}

func TestWorkerCoalescesAndDiscardsStaleExport(t *testing.T) {
	r := newRig(t)
	for _, slug := range []string{"one", "two", "three"} {
		r.publish(t, r.draft(t, "post", slug))
	}
	exports := 0
	original := r.worker.export
	r.worker.export = func(c context.Context, n int64) (Exported, error) { exports++; return original(c, n) }
	hooks := 0
	r.worker.hook = func(context.Context) error { hooks++; return nil }
	must(t, r.worker.ProcessOnce(ctx))
	if exports != 1 || hooks != 1 {
		t.Fatal("coalescing")
	}
	page, err := r.worker.Jobs(ctx, r.reviewer, 0)
	must(t, err)
	if len(page.Items) != 3 || page.Items[0].State != "superseded" || page.Items[1].State != "superseded" || page.Items[2].State != "build_triggered" {
		t.Fatal("durable states")
	}
	data, err := r.store.Get(ctx, "content", "latest.json", 8192)
	must(t, err)
	var latest Latest
	must(t, json.Unmarshal(data, &latest))
	if latest.Generation != 3 {
		t.Fatal("latest")
	}
	if len(r.store.Objects()) != 2 {
		t.Fatal("old snapshots uploaded")
	}
	r.publish(t, r.draft(t, "post", "four"))
	r.worker.export = func(c context.Context, n int64) (Exported, error) {
		out, err := original(c, n)
		if err == nil {
			r.publish(t, r.draft(t, "post", "five"))
		}
		return out, err
	}
	if err = r.worker.ProcessOnce(ctx); !errors.Is(err, fault.SnapshotStale) {
		t.Fatal("stale export was used")
	}
	if len(r.store.Objects()) != 2 || hooks != 1 {
		t.Fatal("stale external stage")
	}
	r.worker.export = original
	must(t, r.worker.ProcessOnce(ctx))
	data, err = r.store.Get(ctx, "content", "latest.json", 8192)
	must(t, err)
	must(t, json.Unmarshal(data, &latest))
	if latest.Generation != 5 {
		t.Fatal("recovery latest")
	}
}

func TestWorkerFailuresBackoffManualRetryAndRestart(t *testing.T) {
	for _, stage := range []string{"storage", "latest", "hook"} {
		t.Run(stage, func(t *testing.T) {
			r := newRig(t)
			r.publish(t, r.draft(t, "post", "retry"))
			now := time.Now()
			r.worker.now = func() time.Time { return now }
			store := hookedStore{ObjectStore: r.store}
			switch stage {
			case "storage":
				store.immutable = func(context.Context) error { return storage.ErrUnavailable }
			case "latest":
				store.mutable = func(context.Context) error { return storage.ErrUnavailable }
			case "hook":
				r.worker.hook = func(context.Context) error { return fault.BuildTrigger }
			}
			r.worker.store = store
			for attempt := int64(1); attempt <= MaxAutomaticAttempts; attempt++ {
				if r.worker.ProcessOnce(ctx) == nil {
					t.Fatal("failure accepted")
				}
				j, err := r.q.LatestPublicationJob(ctx)
				must(t, err)
				if j.State != "failed" || j.Attempts != attempt || j.LastError == "" {
					t.Fatal("safe failure")
				}
				if (stage != "storage") != j.SnapshotKey.Valid {
					t.Fatal("snapshot metadata not preserved")
				}
				if attempt < MaxAutomaticAttempts {
					if j.NextAttemptAt.Int64 != now.Add(backoff(attempt)).UnixMilli() {
						t.Fatal("backoff")
					}
					must(t, r.worker.ProcessOnce(ctx))
					now = time.UnixMilli(j.NextAttemptAt.Int64)
				} else if j.NextAttemptAt.Valid {
					t.Fatal("automatic attempts unbounded")
				}
			}
			j, err := r.q.LatestPublicationJob(ctx)
			must(t, err)
			now = time.Now() // Authentication uses wall time, independently of retry-clock advances.
			if _, err = r.worker.Retry(ctx, r.editor, j.ID); !errors.Is(err, fault.Permission) {
				t.Fatal("Editor retry")
			}
			_, err = r.worker.Retry(ctx, r.reviewer, j.ID)
			must(t, err)
			if r.count(t, "audit_events") < 2 || r.generation(t) != 1 {
				t.Fatal("retry audit/generation")
			}
			// New service represents restart, retaining SQLite stage and uploaded object.
			restarted := New(r.db, r.worker.cfg, r.store, r.auth.PublicationFence(), nil)
			restarted.hook = func(context.Context) error { return nil }
			if stage != "storage" {
				restarted.export = func(context.Context, int64) (Exported, error) {
					t.Fatal("uploaded stage re-exported")
					return Exported{}, nil
				}
			}
			must(t, restarted.ProcessOnce(ctx))
			j, err = r.q.LatestPublicationJob(ctx)
			must(t, err)
			if j.State != "build_triggered" || !j.TriggeredAt.Valid {
				t.Fatal("restart")
			}
			if _, err = restarted.Retry(ctx, r.admin, j.ID); !errors.Is(err, fault.PublicationRetryForbidden) {
				t.Fatal("completed retry")
			}
		})
	}
}

func TestWorkerAcceptedHookCrashWindowIsAtLeastOnce(t *testing.T) {
	r := newRig(t)
	r.publish(t, r.draft(t, "post", "crash"))
	calls := 0
	_, err := r.db.Exec(`CREATE TRIGGER fail_triggered BEFORE UPDATE OF state ON publication_jobs WHEN NEW.state='build_triggered' BEGIN SELECT RAISE(ABORT,'forced'); END`)
	must(t, err)
	r.worker.hook = func(context.Context) error { calls++; return nil }
	if r.worker.ProcessOnce(ctx) == nil {
		t.Fatal("database failure ignored")
	}
	j, err := r.q.LatestPublicationJob(ctx)
	must(t, err)
	if !j.SnapshotKey.Valid || j.State != "failed" {
		t.Fatal("lost recovery stage")
	}
	_, err = r.db.Exec(`DROP TRIGGER fail_triggered`)
	must(t, err)
	_, err = r.worker.Retry(ctx, r.admin, j.ID)
	must(t, err)
	must(t, r.worker.ProcessOnce(ctx))
	if calls != 2 {
		t.Fatal("at-least-once recovery")
	}
}

func TestWorkerCancelsAndDoesNotHoldSQLiteTransactionDuringIO(t *testing.T) {
	r := newRig(t)
	r.publish(t, r.draft(t, "post", "shutdown"))
	entered := make(chan struct{})
	r.worker.store = hookedStore{ObjectStore: r.store, immutable: func(c context.Context) error {
		tx, err := r.db.BeginTx(c, nil)
		if err != nil {
			return err
		}
		must(t, tx.Rollback())
		close(entered)
		<-c.Done()
		return c.Err()
	}}
	runCtx, cancel := context.WithCancel(ctx)
	done := make(chan struct{})
	go func() { defer close(done); r.worker.Run(runCtx) }()
	select {
	case <-entered:
	case <-time.After(time.Second):
		t.Fatal("not running")
	}
	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("shutdown blocked")
	}
	j, err := r.q.LatestPublicationJob(ctx)
	must(t, err)
	if j.State != "pending" || j.Attempts != 0 {
		t.Fatal("cancel damaged durable job")
	}
}

func TestPublicationStatusPermissionAndMarkerComparison(t *testing.T) {
	r := newRig(t)
	r.publish(t, r.draft(t, "post", "status"))
	if _, err := r.worker.Status(ctx, r.editor); !errors.Is(err, fault.Permission) {
		t.Fatal("Editor status")
	}
	for generation, state := range map[int64]string{0: "pending", 1: "live", 2: "behind"} {
		r.worker.marker = func(context.Context) (*Marker, error) { return &Marker{Generation: generation}, nil }
		got, err := r.worker.Status(ctx, r.reviewer)
		must(t, err)
		if got.ComputedState != state {
			t.Fatal("comparison")
		}
	}
	r.worker.marker = func(context.Context) (*Marker, error) { return nil, fault.SnapshotInvalid }
	got, err := r.worker.Status(ctx, r.admin)
	must(t, err)
	if got.ComputedState != "unknown" {
		t.Fatal("unknown")
	}
	r.worker.cfg.Endpoint = ""
	if r.worker.ProcessOnce(ctx) != fault.PublicationNotConfigured {
		t.Fatal("disabled")
	}
	got, err = r.worker.Status(ctx, r.admin)
	must(t, err)
	if got.PipelineConfigured || got.DesiredGeneration != 1 {
		t.Fatal("disabled queued state")
	}
}

func TestLatestFenceBlocksNewPublicCommitWithoutHoldingSQLite(t *testing.T) {
	r := newRig(t)
	r.publish(t, r.draft(t, "post", "fenced"))
	next := r.draft(t, "post", "next-generation")
	entered, release := make(chan struct{}), make(chan struct{})
	r.worker.store = hookedStore{ObjectStore: r.store, mutable: func(c context.Context) error {
		tx, err := r.db.BeginTx(c, nil)
		if err != nil {
			return err
		}
		if err = tx.Rollback(); err != nil {
			return err
		}
		close(entered)
		select {
		case <-release:
			return nil
		case <-c.Done():
			return c.Err()
		}
	}}
	workerDone := make(chan error, 1)
	go func() { workerDone <- r.worker.ProcessOnce(ctx) }()
	select {
	case <-entered:
	case <-time.After(time.Second):
		t.Fatal("mutable stage not entered")
	}
	mutationDone := make(chan error, 1)
	go func() {
		_, err := r.content.PublishDirect(ctx, r.admin, next.ID, next.Draft.Version)
		mutationDone <- err
	}()
	select {
	case <-mutationDone:
		close(release)
		t.Fatal("public commit passed the latest fence")
	case <-time.After(30 * time.Millisecond):
	}
	if r.generation(t) != 1 {
		close(release)
		t.Fatal("generation changed during latest PUT")
	}
	close(release)
	must(t, <-workerDone)
	must(t, <-mutationDone)
	if r.generation(t) != 2 {
		t.Fatal("new generation never committed")
	}
	r.worker.store = r.store
	must(t, r.worker.ProcessOnce(ctx))
	data, err := r.store.Get(ctx, "content", "latest.json", 8192)
	must(t, err)
	var latest Latest
	must(t, json.Unmarshal(data, &latest))
	if latest.Generation != 2 {
		t.Fatal("new latest missing")
	}
}

func TestGenerationChangedDuringImmutableUploadDiscardsOldStage(t *testing.T) {
	r := newRig(t)
	r.publish(t, r.draft(t, "post", "upload-old"))
	next := r.draft(t, "post", "upload-new")
	r.worker.store = hookedStore{ObjectStore: r.store, immutable: func(context.Context) error {
		_, err := r.content.PublishDirect(ctx, r.admin, next.ID, next.Draft.Version)
		return err
	}}
	if err := r.worker.ProcessOnce(ctx); !errors.Is(err, fault.SnapshotStale) {
		t.Fatal("old upload continued")
	}
	if _, err := r.store.Get(ctx, "content", "latest.json", 8192); !errors.Is(err, storage.ErrMissing) {
		t.Fatal("old latest written")
	}
	old, err := r.q.GetPublicationJob(ctx, 1)
	must(t, err)
	if old.State != "superseded" {
		t.Fatal("old actionable job retained")
	}
	r.worker.store = r.store
	must(t, r.worker.ProcessOnce(ctx))
}
