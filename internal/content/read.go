package content

import (
	"context"
	"database/sql"
	"errors"

	"github.com/deepfurry/gopher-atlas/internal/auth"
	dbsqlc "github.com/deepfurry/gopher-atlas/internal/database/sqlc"
	"github.com/deepfurry/gopher-atlas/internal/fault"
	"github.com/deepfurry/gopher-atlas/internal/policy"
)

func loadDraft(ctx context.Context, q *dbsqlc.Queries, id int64) (Draft, error) {
	d, err := q.GetDraft(ctx, id)
	if err != nil {
		return Draft{}, dbError(err)
	}
	tags, err := q.DraftTagIDs(ctx, id)
	if err != nil {
		return Draft{}, dbError(err)
	}
	entries, err := q.DraftTopicEntries(ctx, id)
	if err != nil {
		return Draft{}, dbError(err)
	}
	topic := make([]TopicEntry, 0, len(entries))
	for _, e := range entries {
		topic = append(topic, TopicEntry{e.TargetContentID})
	}
	return Draft{DraftInput: DraftInput{Version: d.Version, Fields: draftFields(d), Relations: Relations{tags, topic}},
		PayloadSchemaVersion: d.PayloadSchemaVersion, UpdatedBy: d.UpdatedBy, UpdatedAt: d.UpdatedAt}, nil
}
func loadRevision(ctx context.Context, q *dbsqlc.Queries, c dbsqlc.ContentItem, r dbsqlc.ContentRevision) (Revision, error) {
	result := Revision{ID: r.ID, ContentID: r.ContentID, RevisionNo: r.RevisionNo, Fields: revisionFields(r), PayloadSchemaVersion: r.PayloadSchemaVersion,
		CreatedBy: r.CreatedBy, CreatedAt: r.CreatedAt, Pending: c.PendingReviewRevisionID.Valid && c.PendingReviewRevisionID.Int64 == r.ID,
		Published: c.PublishedRevisionID.Valid && c.PublishedRevisionID.Int64 == r.ID}
	tags, err := q.RevisionTagIDs(ctx, r.ID)
	if err != nil {
		return result, dbError(err)
	}
	entries, err := q.RevisionTopicEntries(ctx, r.ID)
	if err != nil {
		return result, dbError(err)
	}
	result.TagIDs = tags
	result.TopicEntries = make([]TopicEntry, 0, len(entries))
	for _, e := range entries {
		result.TopicEntries = append(result.TopicEntries, TopicEntry{e.TargetContentID})
	}
	review, err := q.GetRevisionReview(ctx, r.ID)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return result, dbError(err)
	}
	if err == nil {
		dto := reviewDTO(review)
		result.Review = &dto
	}
	return result, nil
}
func detail(ctx context.Context, q *dbsqlc.Queries, u dbsqlc.User, c dbsqlc.ContentItem) (Detail, error) {
	result := Detail{Summary: summary(c, ""), Routes: []Route{}}
	if !policy.CanViewContent(u, c) {
		return result, fault.Permission
	}
	if policy.CanEditDraft(u, c) {
		d, err := loadDraft(ctx, q, c.ID)
		if err != nil {
			return result, err
		}
		result.Draft = &d
		result.Title = d.Title
	}
	if c.PendingReviewRevisionID.Valid {
		r, err := q.GetRevisionByID(ctx, dbsqlc.GetRevisionByIDParams{ContentID: c.ID, ID: c.PendingReviewRevisionID.Int64})
		if err != nil {
			return result, dbError(err)
		}
		rev, err := loadRevision(ctx, q, c, r)
		if err != nil {
			return result, err
		}
		result.PendingRevision = &rev
		if result.Draft == nil {
			result.Title = r.Title
		}
	}
	routes, err := q.ContentRoutes(ctx, dbsqlc.ContentRoutesParams{ContentID: c.ID, AfterID: 0, PageSize: PageSize})
	if err != nil {
		return result, dbError(err)
	}
	for _, r := range routes {
		result.Routes = append(result.Routes, Route{r.Path, r.Kind})
	}
	if len(routes) == PageSize {
		result.NextRouteCursor = &routes[len(routes)-1].ID
	}
	return result, enrichDetail(ctx, q, u, c, &result)
}

func (s *Service) Routes(ctx context.Context, actor auth.Principal, id, after int64) (Page[Route], error) {
	result := Page[Route]{Items: []Route{}}
	err := s.transact(ctx, actor, func(q *dbsqlc.Queries, u dbsqlc.User, _ int64) error {
		if after < 0 {
			return fault.Validation
		}
		c, err := q.GetContent(ctx, id)
		if err != nil {
			return dbError(err)
		}
		if !policy.CanViewContent(u, c) {
			return fault.Permission
		}
		rows, err := q.ContentRoutes(ctx, dbsqlc.ContentRoutesParams{ContentID: id, AfterID: after, PageSize: PageSize})
		if err != nil {
			return dbError(err)
		}
		for _, r := range rows {
			result.Items = append(result.Items, Route{r.Path, r.Kind})
		}
		if len(rows) == PageSize {
			result.NextCursor = &rows[len(rows)-1].ID
		}
		return nil
	})
	return result, err
}
func (s *Service) Get(ctx context.Context, actor auth.Principal, id int64) (Detail, error) {
	var result Detail
	err := s.transact(ctx, actor, func(q *dbsqlc.Queries, u dbsqlc.User, _ int64) error {
		c, err := q.GetContent(ctx, id)
		if err != nil {
			return dbError(err)
		}
		result, err = detail(ctx, q, u, c)
		return err
	})
	return result, err
}
func (s *Service) List(ctx context.Context, actor auth.Principal, after int64, archived bool, filters ...Filters) (Page[Summary], error) {
	result := Page[Summary]{Items: []Summary{}}
	err := s.transact(ctx, actor, func(q *dbsqlc.Queries, u dbsqlc.User, _ int64) error {
		if after < 0 {
			return fault.Validation
		}
		if archived && !policy.Admin(u) {
			return fault.Permission
		}
		var f Filters
		if len(filters) > 0 {
			f = filters[0]
		}
		if err := f.validate(u); err != nil {
			return err
		}
		rows, err := q.ListContent(ctx, dbsqlc.ListContentParams{ContentType: f.Type, EditorialState: f.EditorialState, Search: cleanSearch(f.Search), OwnerID: f.OwnerUserID, AfterID: after, IncludeArchived: archived, IsAdmin: policy.Admin(u), ActorID: u.ID, IsReviewer: policy.Reviewer(u), PageSize: PageSize})
		if err != nil {
			return dbError(err)
		}
		for _, r := range rows {
			title := r.RevisionTitle.String
			if policy.Admin(u) || r.OwnerUserID == u.ID {
				title = r.DraftTitle
			}
			c := dbsqlc.ContentItem{ID: r.ID, Type: r.Type, OwnerUserID: r.OwnerUserID, EditorialState: r.EditorialState,
				PendingReviewRevisionID: r.PendingReviewRevisionID, PublishedRevisionID: r.PublishedRevisionID, CreatedBy: r.CreatedBy,
				FirstPublishedAt: r.FirstPublishedAt, LastPublishedAt: r.LastPublishedAt, CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt, ArchivedAt: r.ArchivedAt}
			item := summary(c, title)
			item.Actions = policy.ContentActionsFor(u, c)
			item.Byline.UserID = r.RevisionByline.Int64
			if policy.CanEditDraft(u, c) {
				item.Byline.UserID = r.DraftByline
			}
			result.Items = append(result.Items, item)
		}
		if len(rows) == PageSize {
			result.NextCursor = &rows[len(rows)-1].ID
		}
		return enrichSummaries(ctx, q, result.Items)
	})
	return result, err
}
func (s *Service) Revisions(ctx context.Context, actor auth.Principal, id, after int64) (Page[RevisionSummary], error) {
	result := Page[RevisionSummary]{Items: []RevisionSummary{}}
	err := s.transact(ctx, actor, func(q *dbsqlc.Queries, u dbsqlc.User, _ int64) error {
		if after < 0 {
			return fault.Validation
		}
		c, err := q.GetContent(ctx, id)
		if err != nil {
			return dbError(err)
		}
		if !policy.CanViewContent(u, c) {
			return fault.Permission
		}
		only := int64(0)
		if !policy.CanEditDraft(u, c) {
			only = c.PendingReviewRevisionID.Int64
		}
		rows, err := q.ListRevisions(ctx, dbsqlc.ListRevisionsParams{ContentID: id, AfterNo: after, OnlyRevisionID: only, PageSize: PageSize})
		if err != nil {
			return dbError(err)
		}
		for _, r := range rows {
			result.Items = append(result.Items, RevisionSummary{ID: r.ID, ContentID: r.ContentID, RevisionNo: r.RevisionNo, Title: r.Title, Slug: r.Slug, BylineUserID: r.BylineUserID, CreatedBy: r.CreatedBy, CreatedAt: r.CreatedAt,
				Pending: c.PendingReviewRevisionID.Valid && c.PendingReviewRevisionID.Int64 == r.ID, Published: c.PublishedRevisionID.Valid && c.PublishedRevisionID.Int64 == r.ID, ReviewDecision: reviewDecision(r.Decision)})
		}
		if len(rows) == PageSize {
			result.NextCursor = &rows[len(rows)-1].RevisionNo
		}
		ids := []int64{}
		for _, r := range result.Items {
			ids = append(ids, r.BylineUserID, r.CreatedBy)
		}
		authors, err := auth.Summaries(ctx, q, ids)
		if err != nil {
			return err
		}
		for i := range result.Items {
			result.Items[i].Byline = authors[result.Items[i].BylineUserID]
			result.Items[i].Creator = authors[result.Items[i].CreatedBy]
		}
		return nil
	})
	return result, err
}
func (s *Service) Revision(ctx context.Context, actor auth.Principal, id, no int64) (Revision, error) {
	var result Revision
	err := s.transact(ctx, actor, func(q *dbsqlc.Queries, u dbsqlc.User, _ int64) error {
		c, err := q.GetContent(ctx, id)
		if err != nil {
			return dbError(err)
		}
		if !policy.CanViewContent(u, c) {
			return fault.Permission
		}
		r, err := q.GetRevision(ctx, dbsqlc.GetRevisionParams{ContentID: id, RevisionNo: no})
		if err != nil {
			return dbError(err)
		}
		if !policy.CanEditDraft(u, c) && r.ID != c.PendingReviewRevisionID.Int64 {
			return fault.Permission
		}
		result, err = loadRevision(ctx, q, c, r)
		if err != nil {
			return err
		}
		return enrichRevision(ctx, q, u, c, &result, true)
	})
	return result, err
}
func (s *Service) PendingReviews(ctx context.Context, actor auth.Principal, after int64) (Page[PendingReview], error) {
	result := Page[PendingReview]{Items: []PendingReview{}}
	err := s.transact(ctx, actor, func(q *dbsqlc.Queries, u dbsqlc.User, _ int64) error {
		if !policy.For(u.Role, u.Status).Review {
			return fault.Permission
		}
		if after < 0 {
			return fault.Validation
		}
		rows, err := q.ListPendingReviews(ctx, dbsqlc.ListPendingReviewsParams{AfterID: after, IsAdmin: policy.Admin(u), ActorID: u.ID, PageSize: PageSize})
		if err != nil {
			return dbError(err)
		}
		for _, r := range rows {
			result.Items = append(result.Items, PendingReview{RevisionID: r.ID, ContentID: r.ContentID, RevisionNo: r.RevisionNo, Title: r.Title, OwnerUserID: r.OwnerUserID, BylineUserID: r.BylineUserID, SubmittedAt: r.CreatedAt})
		}
		if len(rows) == PageSize {
			result.NextCursor = &rows[len(rows)-1].ID
		}
		ids := []int64{}
		for _, r := range result.Items {
			ids = append(ids, r.OwnerUserID, r.BylineUserID)
		}
		authors, err := auth.Summaries(ctx, q, ids)
		if err != nil {
			return err
		}
		for i := range result.Items {
			result.Items[i].Owner = authors[result.Items[i].OwnerUserID]
			result.Items[i].Byline = authors[result.Items[i].BylineUserID]
		}
		return nil
	})
	return result, err
}
func (s *Service) ReviewHistory(ctx context.Context, actor auth.Principal, after int64) (Page[Review], error) {
	result := Page[Review]{Items: []Review{}}
	err := s.transact(ctx, actor, func(q *dbsqlc.Queries, u dbsqlc.User, _ int64) error {
		if !policy.For(u.Role, u.Status).Review {
			return fault.Permission
		}
		if after < 0 {
			return fault.Validation
		}
		rows, err := q.ListReviewHistory(ctx, dbsqlc.ListReviewHistoryParams{AfterID: after, PageSize: PageSize})
		if err != nil {
			return dbError(err)
		}
		for _, r := range rows {
			result.Items = append(result.Items, reviewDTO(r))
		}
		if len(rows) == PageSize {
			result.NextCursor = &rows[len(rows)-1].ID
		}
		return enrichReviews(ctx, q, result.Items)
	})
	return result, err
}

func reviewDecision(s sql.NullString) *string {
	if s.Valid {
		return &s.String
	}
	return nil
}
