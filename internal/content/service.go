package content

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"github.com/deepfurry/gopher-atlas/internal/assets"
	"github.com/deepfurry/gopher-atlas/internal/audit"
	"github.com/deepfurry/gopher-atlas/internal/auth"
	dbsqlc "github.com/deepfurry/gopher-atlas/internal/database/sqlc"
	"github.com/deepfurry/gopher-atlas/internal/fault"
	"github.com/deepfurry/gopher-atlas/internal/outbox"
	"github.com/deepfurry/gopher-atlas/internal/policy"
)

type Service struct {
	db    *sql.DB
	fence *outbox.Fence
}

func New(db *sql.DB, fences ...*outbox.Fence) *Service {
	fence := &outbox.Fence{}
	if len(fences) > 0 && fences[0] != nil {
		fence = fences[0]
	}
	return &Service{db: db, fence: fence}
}
func dbError(err error) error {
	if errors.Is(err, sql.ErrNoRows) {
		return fault.NotFound
	}
	if err != nil {
		return fault.Unavailable
	}
	return nil
}

// Multi-query reads also use a short transaction for a consistent DTO snapshot.
// No transaction performs network I/O or returns database error text.
func (s *Service) transact(ctx context.Context, actor auth.Principal, fn func(*dbsqlc.Queries, dbsqlc.User, int64) error) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fault.Unavailable
	}
	defer tx.Rollback()
	q := dbsqlc.New(tx)
	now := time.Now().UnixMilli()
	current, err := auth.Reauthorize(ctx, q, actor, now)
	if err != nil {
		return err
	}
	if err := fn(q, current.User, now); err != nil {
		return err
	}
	return dbError(tx.Commit())
}
func mutable(c dbsqlc.ContentItem) error {
	if c.ArchivedAt.Valid {
		return fault.ContentArchived
	}
	if c.EditorialState == "in_review" {
		return fault.EditorialState
	}
	return nil
}
func appendEvent(ctx context.Context, q *dbsqlc.Queries, u dbsqlc.User, cid, rid int64, action string, now int64) error {
	return audit.Append(ctx, q, audit.Event{ActorID: u.ID, Action: action, EntityType: "content", EntityID: cid, RevisionID: rid}, now)
}
func (s *Service) Create(ctx context.Context, actor auth.Principal, kind string) (Detail, error) {
	var result Detail
	err := s.transact(ctx, actor, func(q *dbsqlc.Queries, u dbsqlc.User, now int64) error {
		if kind != "post" && kind != "note" && kind != "topic" && kind != "curated_article" {
			return fault.Validation
		}
		if !policy.CanCreateContent(u, kind) {
			return fault.Permission
		}
		c, err := q.CreateContent(ctx, dbsqlc.CreateContentParams{Type: kind, OwnerUserID: u.ID, CreatedBy: u.ID, CreatedAt: now, UpdatedAt: now})
		if err != nil {
			return dbError(err)
		}
		if err := q.CreateDraft(ctx, dbsqlc.CreateDraftParams{ContentID: c.ID, BylineUserID: u.ID, PayloadJson: string(initialPayload(kind)), UpdatedBy: u.ID, UpdatedAt: now}); err != nil {
			return dbError(err)
		}
		if err := appendEvent(ctx, q, u, c.ID, 0, "content.created", now); err != nil {
			return err
		}
		result, err = detail(ctx, q, u, c)
		return err
	})
	return result, err
}
func (s *Service) Save(ctx context.Context, actor auth.Principal, id int64, input DraftInput) (Draft, error) {
	var result Draft
	err := s.transact(ctx, actor, func(q *dbsqlc.Queries, u dbsqlc.User, now int64) error {
		c, err := q.GetContent(ctx, id)
		if err != nil {
			return dbError(err)
		}
		if !policy.CanEditDraft(u, c) {
			return fault.Permission
		}
		if err := mutable(c); err != nil {
			return err
		}
		d, err := q.GetDraft(ctx, id)
		if err != nil {
			return dbError(err)
		}
		if input.Version != d.Version {
			return fault.ContentVersion
		}
		if !policy.CanSetByline(u, input.BylineUserID) || !policy.CanSetFeatured(u, d.Featured == 1, input.Featured) {
			return fault.Permission
		}
		if err := validateFields(c.Type, &input.Fields, false); err != nil {
			return err
		}
		if err := validateRelations(ctx, q, c, input.Fields, input.Relations); err != nil {
			return err
		}
		if err := save(ctx, q, u, id, input, now); err != nil {
			return err
		}
		if err := q.MarkDraftEdited(ctx, dbsqlc.MarkDraftEditedParams{ID: id, UpdatedAt: now}); err != nil {
			return dbError(err)
		}
		result, err = loadDraft(ctx, q, id)
		if err != nil {
			return err
		}
		result.RelationLabels, err = relationLabels(ctx, q, u, result.Relations)
		return err
	})
	return result, err
}
func validateRelations(ctx context.Context, q *dbsqlc.Queries, c dbsqlc.ContentItem, f Fields, r Relations) error {
	if c.Type == "topic" {
		var p TopicPayload
		if json.Unmarshal(f.Payload, &p) != nil || p.RecommendedCount < 0 || p.RecommendedCount > int64(len(r.TopicEntries)) {
			return fault.Payload
		}
	}
	if err := assets.ValidateCover(ctx, q, f.CoverAssetID); err != nil {
		return err
	}
	if _, err := q.GetProfile(ctx, f.BylineUserID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return fault.Validation
		}
		return dbError(err)
	}
	if len(r.TagIDs) > RelationLimit || len(r.TopicEntries) > RelationLimit || (c.Type == "topic" && len(r.TagIDs) > 0) || (c.Type != "topic" && len(r.TopicEntries) > 0) {
		return fault.Validation
	}
	seen := make(map[int64]bool)
	for _, id := range r.TagIDs {
		if id <= 0 || seen[id] {
			return fault.Validation
		}
		seen[id] = true
	}
	if len(r.TagIDs) > 0 {
		count, err := q.CountExistingTags(ctx, r.TagIDs)
		if err != nil {
			return dbError(err)
		}
		if count != int64(len(r.TagIDs)) {
			return fault.Validation
		}
	}
	clear(seen)
	targets := make([]int64, 0, len(r.TopicEntries))
	for _, e := range r.TopicEntries {
		if e.TargetContentID <= 0 || e.TargetContentID == c.ID || seen[e.TargetContentID] {
			return fault.Validation
		}
		seen[e.TargetContentID] = true
		targets = append(targets, e.TargetContentID)
	}
	if len(targets) > 0 {
		count, err := q.CountCuratedContent(ctx, targets)
		if err != nil {
			return dbError(err)
		}
		if count != int64(len(targets)) {
			return fault.Validation
		}
	}
	return nil
}
func save(ctx context.Context, q *dbsqlc.Queries, u dbsqlc.User, id int64, in DraftInput, now int64) error {
	n, err := q.SaveDraft(ctx, dbsqlc.SaveDraftParams{CoverAssetID: nullable(in.CoverAssetID), ContentID: id, ExpectedVersion: in.Version, Title: in.Title, Slug: in.Slug, Summary: in.Summary,
		BodyMarkdown: in.BodyMarkdown, BylineUserID: in.BylineUserID, Language: in.Language, Featured: flag(in.Featured), SeoTitle: in.SEOTitle,
		SeoDescription: in.SEODescription, PayloadSchemaVersion: 1, PayloadJson: string(in.Payload), UpdatedBy: u.ID, UpdatedAt: now})
	if err != nil {
		return dbError(err)
	}
	if n != 1 {
		return fault.ContentVersion
	}
	if err := q.DeleteDraftTags(ctx, id); err != nil {
		return dbError(err)
	}
	for _, tag := range in.TagIDs {
		if err := q.AddDraftTag(ctx, dbsqlc.AddDraftTagParams{ContentID: id, TagID: tag}); err != nil {
			return dbError(err)
		}
	}
	if err := q.DeleteDraftTopicEntries(ctx, id); err != nil {
		return dbError(err)
	}
	for i, e := range in.TopicEntries {
		if err := q.AddDraftTopicEntry(ctx, dbsqlc.AddDraftTopicEntryParams{TopicContentID: id, Position: int64(i + 1), TargetContentID: e.TargetContentID}); err != nil {
			return dbError(err)
		}
	}
	return nil
}
func snapshot(ctx context.Context, q *dbsqlc.Queries, u dbsqlc.User, c dbsqlc.ContentItem, version, now int64) (dbsqlc.ContentRevision, error) {
	d, err := loadDraft(ctx, q, c.ID)
	if err != nil {
		return dbsqlc.ContentRevision{}, err
	}
	if d.Version != version {
		return dbsqlc.ContentRevision{}, fault.ContentVersion
	}
	if err := validateFields(c.Type, &d.Fields, true); err != nil {
		return dbsqlc.ContentRevision{}, err
	}
	if err := validateRelations(ctx, q, c, d.Fields, d.Relations); err != nil {
		return dbsqlc.ContentRevision{}, err
	}
	r, err := q.SnapshotDraft(ctx, dbsqlc.SnapshotDraftParams{ContentID: c.ID, ActorID: u.ID, Now: now})
	if err != nil {
		return r, dbError(err)
	}
	if err := q.SnapshotTags(ctx, dbsqlc.SnapshotTagsParams{RevisionID: r.ID, ContentID: c.ID}); err != nil {
		return r, dbError(err)
	}
	if err := q.SnapshotTopicEntries(ctx, dbsqlc.SnapshotTopicEntriesParams{RevisionID: r.ID, ContentID: c.ID}); err != nil {
		return r, dbError(err)
	}
	return r, nil
}
