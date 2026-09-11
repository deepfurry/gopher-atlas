package content

import (
	"context"
	"database/sql"
	"errors"

	"github.com/deepfurry/gopher-atlas/internal/auth"
	dbsqlc "github.com/deepfurry/gopher-atlas/internal/database/sqlc"
	"github.com/deepfurry/gopher-atlas/internal/fault"
	"github.com/deepfurry/gopher-atlas/internal/outbox"
	"github.com/deepfurry/gopher-atlas/internal/policy"
)

func routeAvailable(ctx context.Context, q *dbsqlc.Queries, id int64, path string) error {
	r, err := q.GetRoute(ctx, path)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return dbError(err)
	}
	if r.ContentID != id {
		return fault.RouteConflict
	}
	return nil
}
func claimRoute(ctx context.Context, q *dbsqlc.Queries, c dbsqlc.ContentItem, r dbsqlc.ContentRevision, now int64) error {
	path, err := candidatePath(c.Type, revisionFields(r))
	if err != nil {
		return err
	}
	if err := routeAvailable(ctx, q, c.ID, path); err != nil {
		return err
	}
	if c.Type == "topic" {
		count, err := q.UnpublishableTopicTargets(ctx, r.ID)
		if err != nil {
			return dbError(err)
		}
		if count > 0 {
			return fault.TopicTarget
		}
	}
	if err := q.DemoteCanonical(ctx, c.ID); err != nil {
		return dbError(err)
	}
	return dbError(q.ClaimCanonical(ctx, dbsqlc.ClaimCanonicalParams{ContentID: c.ID, Path: path, CreatedAt: now}))
}
func (s *Service) Submit(ctx context.Context, actor auth.Principal, id, version int64) (Detail, error) {
	return s.mutate(ctx, actor, id, func(q *dbsqlc.Queries, u dbsqlc.User, c dbsqlc.ContentItem, now int64) error {
		if !policy.CanSubmit(u, c) {
			return fault.Permission
		}
		if err := mutable(c); err != nil {
			return err
		}
		if c.EditorialState != "draft" && c.EditorialState != "changes_requested" {
			return fault.EditorialState
		}
		r, err := snapshot(ctx, q, u, c, version, now)
		if err != nil {
			return err
		}
		path, err := candidatePath(c.Type, revisionFields(r))
		if err != nil {
			return err
		}
		if err := routeAvailable(ctx, q, id, path); err != nil {
			return err
		}
		if err := q.SetPendingRevision(ctx, dbsqlc.SetPendingRevisionParams{ID: id, PendingReviewRevisionID: stamp(r.ID), UpdatedAt: now}); err != nil {
			return dbError(err)
		}
		return appendEvent(ctx, q, u, id, r.ID, "content.submitted", now)
	})
}

// mutate returns the committed content identity. Reviewers who just completed a
// review no longer have draft visibility, so responses contain a summary only.
func (s *Service) mutate(ctx context.Context, actor auth.Principal, id int64, fn func(*dbsqlc.Queries, dbsqlc.User, dbsqlc.ContentItem, int64) error) (Detail, error) {
	var result Detail
	err := s.transact(ctx, actor, func(q *dbsqlc.Queries, u dbsqlc.User, now int64) error {
		c, err := q.GetContent(ctx, id)
		if err != nil {
			return dbError(err)
		}
		if err := fn(q, u, c, now); err != nil {
			return err
		}
		c, err = q.GetContent(ctx, id)
		if err != nil {
			return dbError(err)
		}
		if policy.CanViewContent(u, c) {
			result, err = detail(ctx, q, u, c)
			return err
		}
		result = Detail{Summary: summary(c, ""), Routes: []Route{}}
		return completedReviewSummary(ctx, q, c, &result)
	})
	return result, err
}
func pending(ctx context.Context, q *dbsqlc.Queries, c dbsqlc.ContentItem, rid int64) (dbsqlc.ContentRevision, error) {
	if c.ArchivedAt.Valid {
		return dbsqlc.ContentRevision{}, fault.ContentArchived
	}
	if c.EditorialState != "in_review" {
		return dbsqlc.ContentRevision{}, fault.EditorialState
	}
	if rid <= 0 || !c.PendingReviewRevisionID.Valid || c.PendingReviewRevisionID.Int64 != rid {
		return dbsqlc.ContentRevision{}, fault.ReviewRevision
	}
	r, err := q.GetRevisionByID(ctx, dbsqlc.GetRevisionByIDParams{ContentID: c.ID, ID: rid})
	return r, dbError(err)
}
func reviewAllowed(u dbsqlc.User, c dbsqlc.ContentItem, r dbsqlc.ContentRevision) error {
	if !policy.For(u.Role, u.Status).Review {
		return fault.Permission
	}
	if !policy.CanReview(u, c, r) {
		return fault.SelfReview
	}
	return nil
}
func (s *Service) RequestChanges(ctx context.Context, actor auth.Principal, id, rid int64, comment string) (Detail, error) {
	return s.mutate(ctx, actor, id, func(q *dbsqlc.Queries, u dbsqlc.User, c dbsqlc.ContentItem, now int64) error {
		if !policy.For(u.Role, u.Status).Review {
			return fault.Permission
		}
		r, err := pending(ctx, q, c, rid)
		if err != nil {
			return err
		}
		if err := reviewAllowed(u, c, r); err != nil {
			return err
		}
		if err := validateComment(comment, true); err != nil {
			return err
		}
		if _, err := q.CreateReview(ctx, dbsqlc.CreateReviewParams{ContentID: id, RevisionID: rid, ReviewerUserID: u.ID, Decision: "changes_requested", CommentMarkdown: comment, CreatedAt: now}); err != nil {
			return dbError(err)
		}
		if err := q.ClearPendingRevision(ctx, dbsqlc.ClearPendingRevisionParams{ID: id, EditorialState: "changes_requested", UpdatedAt: now}); err != nil {
			return dbError(err)
		}
		return appendEvent(ctx, q, u, id, rid, "content.changes_requested", now)
	})
}
func (s *Service) Withdraw(ctx context.Context, actor auth.Principal, id int64) (Detail, error) {
	return s.mutate(ctx, actor, id, func(q *dbsqlc.Queries, u dbsqlc.User, c dbsqlc.ContentItem, now int64) error {
		if !policy.CanWithdrawReview(u, c) {
			return fault.Permission
		}
		if _, err := pending(ctx, q, c, c.PendingReviewRevisionID.Int64); err != nil {
			return err
		}
		if err := q.ClearPendingRevision(ctx, dbsqlc.ClearPendingRevisionParams{ID: id, EditorialState: "draft", UpdatedAt: now}); err != nil {
			return dbError(err)
		}
		return appendEvent(ctx, q, u, id, c.PendingReviewRevisionID.Int64, "content.review_withdrawn", now)
	})
}
func (s *Service) PublishReviewed(ctx context.Context, actor auth.Principal, id, rid int64, comment string) (Detail, error) {
	s.fence.Lock()
	defer s.fence.Unlock()
	return s.mutate(ctx, actor, id, func(q *dbsqlc.Queries, u dbsqlc.User, c dbsqlc.ContentItem, now int64) error {
		if !policy.For(u.Role, u.Status).Publish {
			return fault.Permission
		}
		r, err := pending(ctx, q, c, rid)
		if err != nil {
			return err
		}
		if err := reviewAllowed(u, c, r); err != nil {
			return err
		}
		if err := validateComment(comment, false); err != nil {
			return err
		}
		if err := claimRoute(ctx, q, c, r, now); err != nil {
			return err
		}
		if _, err := q.CreateReview(ctx, dbsqlc.CreateReviewParams{ContentID: id, RevisionID: rid, ReviewerUserID: u.ID, Decision: "approved", CommentMarkdown: comment, CreatedAt: now}); err != nil {
			return dbError(err)
		}
		if err := q.PublishRevision(ctx, dbsqlc.PublishRevisionParams{ID: id, RevisionID: stamp(rid), Now: stamp(now)}); err != nil {
			return dbError(err)
		}
		if err := appendEvent(ctx, q, u, id, rid, "content.published", now); err != nil {
			return err
		}
		return outbox.MarkDirty(ctx, q, now)
	})
}
func (s *Service) PublishDirect(ctx context.Context, actor auth.Principal, id, version int64) (Detail, error) {
	s.fence.Lock()
	defer s.fence.Unlock()
	return s.mutate(ctx, actor, id, func(q *dbsqlc.Queries, u dbsqlc.User, c dbsqlc.ContentItem, now int64) error {
		if !policy.CanDirectPublish(u) {
			return fault.Permission
		}
		if err := mutable(c); err != nil {
			return err
		}
		if c.EditorialState != "draft" && c.EditorialState != "changes_requested" {
			return fault.EditorialState
		}
		r, err := snapshot(ctx, q, u, c, version, now)
		if err != nil {
			return err
		}
		if err := claimRoute(ctx, q, c, r, now); err != nil {
			return err
		}
		if err := q.PublishRevision(ctx, dbsqlc.PublishRevisionParams{ID: id, RevisionID: stamp(r.ID), Now: stamp(now)}); err != nil {
			return dbError(err)
		}
		if err := appendEvent(ctx, q, u, id, r.ID, "content.published_direct", now); err != nil {
			return err
		}
		return outbox.MarkDirty(ctx, q, now)
	})
}
func (s *Service) Unpublish(ctx context.Context, actor auth.Principal, id int64) (Detail, error) {
	s.fence.Lock()
	defer s.fence.Unlock()
	return s.mutate(ctx, actor, id, func(q *dbsqlc.Queries, u dbsqlc.User, c dbsqlc.ContentItem, now int64) error {
		if !policy.CanUnpublish(u) {
			return fault.Permission
		}
		if c.ArchivedAt.Valid {
			return fault.ContentArchived
		}
		if !c.PublishedRevisionID.Valid {
			return fault.NotPublished
		}
		if err := q.UnpublishContent(ctx, dbsqlc.UnpublishContentParams{ID: id, UpdatedAt: now}); err != nil {
			return dbError(err)
		}
		if err := appendEvent(ctx, q, u, id, c.PublishedRevisionID.Int64, "content.unpublished", now); err != nil {
			return err
		}
		return outbox.MarkDirty(ctx, q, now)
	})
}
func (s *Service) Archive(ctx context.Context, actor auth.Principal, id int64) (Detail, error) {
	s.fence.Lock()
	defer s.fence.Unlock()
	return s.mutate(ctx, actor, id, func(q *dbsqlc.Queries, u dbsqlc.User, c dbsqlc.ContentItem, now int64) error {
		if !policy.CanArchive(u) {
			return fault.Permission
		}
		if c.ArchivedAt.Valid {
			return fault.ContentArchived
		}
		if err := q.ArchiveContent(ctx, dbsqlc.ArchiveContentParams{ID: id, Now: stamp(now)}); err != nil {
			return dbError(err)
		}
		if err := appendEvent(ctx, q, u, id, 0, "content.archived", now); err != nil {
			return err
		}
		if c.PublishedRevisionID.Valid {
			return outbox.MarkDirty(ctx, q, now)
		}
		return nil
	})
}
func (s *Service) RestoreArchive(ctx context.Context, actor auth.Principal, id int64) (Detail, error) {
	return s.mutate(ctx, actor, id, func(q *dbsqlc.Queries, u dbsqlc.User, c dbsqlc.ContentItem, now int64) error {
		if !policy.CanArchive(u) {
			return fault.Permission
		}
		if !c.ArchivedAt.Valid {
			return fault.EditorialState
		}
		if err := q.RestoreArchive(ctx, dbsqlc.RestoreArchiveParams{ID: id, UpdatedAt: now}); err != nil {
			return dbError(err)
		}
		return appendEvent(ctx, q, u, id, 0, "content.archive_restored", now)
	})
}
func (s *Service) RestoreRevision(ctx context.Context, actor auth.Principal, id, no, version int64) (Detail, error) {
	return s.mutate(ctx, actor, id, func(q *dbsqlc.Queries, u dbsqlc.User, c dbsqlc.ContentItem, now int64) error {
		if !policy.CanRestoreRevision(u, c) {
			return fault.Permission
		}
		if err := mutable(c); err != nil {
			return err
		}
		current, err := q.GetDraft(ctx, id)
		if err != nil {
			return dbError(err)
		}
		if current.Version != version {
			return fault.ContentVersion
		}
		r, err := q.GetRevision(ctx, dbsqlc.GetRevisionParams{ContentID: id, RevisionNo: no})
		if err != nil {
			return dbError(err)
		}
		rev, err := loadRevision(ctx, q, c, r)
		if err != nil {
			return err
		}
		// Historical restoration cannot bypass Admin-only featured changes.
		if !policy.CanSetFeatured(u, current.Featured == 1, rev.Featured) {
			return fault.Permission
		}
		in := DraftInput{Version: version, Fields: rev.Fields, Relations: rev.Relations}
		if err := save(ctx, q, u, id, in, now); err != nil {
			return err
		}
		if err := q.ClearPendingRevision(ctx, dbsqlc.ClearPendingRevisionParams{ID: id, EditorialState: "draft", UpdatedAt: now}); err != nil {
			return dbError(err)
		}
		return appendEvent(ctx, q, u, id, r.ID, "content.revision_restored", now)
	})
}
