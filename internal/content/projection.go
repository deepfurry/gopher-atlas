package content

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"unicode/utf8"

	"github.com/deepfurry/gopher-atlas/internal/auth"
	dbsqlc "github.com/deepfurry/gopher-atlas/internal/database/sqlc"
	"github.com/deepfurry/gopher-atlas/internal/fault"
	"github.com/deepfurry/gopher-atlas/internal/policy"
)

type Filters struct {
	Type, EditorialState, Search string
	OwnerUserID                  int64
}

func (f Filters) validate(u dbsqlc.User) error {
	if f.OwnerUserID < 0 || len(f.Search) > 200 || !utf8.ValidString(f.Search) {
		return fault.Validation
	}
	if f.OwnerUserID > 0 && !policy.Admin(u) {
		return fault.Permission
	}
	switch f.Type {
	case "", "post", "note", "curated_article", "topic":
	default:
		return fault.Validation
	}
	switch f.EditorialState {
	case "", "draft", "in_review", "changes_requested", "synced":
	default:
		return fault.Validation
	}
	return nil
}

type TargetSummary struct {
	ID        int64  `json:"id"`
	Title     string `json:"title"`
	Type      string `json:"type"`
	Published bool   `json:"published"`
	Archived  bool   `json:"archived"`
}
type RelationLabels struct {
	Tags         []Tag           `json:"tags"`
	TopicTargets []TargetSummary `json:"topicTargets"`
}

func relationLabels(ctx context.Context, q *dbsqlc.Queries, u dbsqlc.User, relations Relations) (RelationLabels, error) {
	result := RelationLabels{Tags: []Tag{}, TopicTargets: []TargetSummary{}}
	tags, err := q.GetTagsByIDs(ctx, relations.TagIDs)
	if err != nil {
		return result, dbError(err)
	}
	for _, t := range tags {
		result.Tags = append(result.Tags, tagDTO(t))
	}
	ids := make([]int64, 0, len(relations.TopicEntries))
	for _, e := range relations.TopicEntries {
		ids = append(ids, e.TargetContentID)
	}
	targets, err := q.TopicTargetSummaries(ctx, ids)
	if err != nil {
		return result, dbError(err)
	}
	byID := map[int64]TargetSummary{}
	for _, t := range targets {
		title := t.PublishedTitle.String
		// A relationship never grants permission to read somebody else's Draft.
		if policy.CanEditDraft(u, dbsqlc.ContentItem{OwnerUserID: t.OwnerUserID}) {
			title = t.DraftTitle
		} else if title == "" && policy.Reviewer(u) && t.EditorialState == "in_review" && !t.ArchivedAt.Valid {
			title = t.PendingTitle.String
		}
		byID[t.ID] = TargetSummary{t.ID, title, t.Type, t.PublishedRevisionID.Valid, t.ArchivedAt.Valid}
	}
	for _, id := range ids {
		result.TopicTargets = append(result.TopicTargets, byID[id])
	}
	return result, nil
}
func enrichSummaries(ctx context.Context, q *dbsqlc.Queries, items []Summary) error {
	ids := []int64{}
	revisions := []int64{}
	for _, r := range items {
		ids = append(ids, r.OwnerUserID, r.Byline.UserID)
		if r.PublishedRevisionID != nil {
			revisions = append(revisions, *r.PublishedRevisionID)
		}
	}
	authors, err := auth.Summaries(ctx, q, ids)
	if err != nil {
		return err
	}
	labels, err := q.RevisionLabels(ctx, revisions)
	if err != nil {
		return dbError(err)
	}
	numbers := map[int64]int64{}
	for _, r := range labels {
		numbers[r.ID] = r.RevisionNo
	}
	for i := range items {
		items[i].Owner = authors[items[i].OwnerUserID]
		items[i].Byline = authors[items[i].Byline.UserID]
		if items[i].PublishedRevisionID != nil {
			n := numbers[*items[i].PublishedRevisionID]
			items[i].PublishedRevisionNo = &n
		}
	}
	return nil
}
func enrichReviews(ctx context.Context, q *dbsqlc.Queries, items []Review) error {
	ids := []int64{}
	revs := []int64{}
	for _, r := range items {
		ids = append(ids, r.ReviewerUserID)
		revs = append(revs, r.RevisionID)
	}
	authors, err := auth.Summaries(ctx, q, ids)
	if err != nil {
		return err
	}
	rows, err := q.RevisionLabels(ctx, revs)
	if err != nil {
		return dbError(err)
	}
	labels := map[int64]dbsqlc.RevisionLabelsRow{}
	for _, r := range rows {
		labels[r.ID] = r
	}
	for i := range items {
		items[i].Reviewer = authors[items[i].ReviewerUserID]
		r := labels[items[i].RevisionID]
		items[i].Title = r.Title
		items[i].RevisionNo = r.RevisionNo
	}
	return nil
}
func enrichRevision(ctx context.Context, q *dbsqlc.Queries, u dbsqlc.User, c dbsqlc.ContentItem, r *Revision, withRestoreAction bool) error {
	authors, err := auth.Summaries(ctx, q, []int64{r.BylineUserID, r.CreatedBy})
	if err != nil {
		return err
	}
	r.Byline = authors[r.BylineUserID]
	r.Creator = authors[r.CreatedBy]
	r.RelationLabels, err = relationLabels(ctx, q, u, r.Relations)
	if err != nil {
		return err
	}
	if r.Review != nil {
		items := []Review{*r.Review}
		if err = enrichReviews(ctx, q, items); err != nil {
			return err
		}
		r.Review = &items[0]
	}
	r.RestoreDraft = withRestoreAction && policy.ContentActionsFor(u, c).RestoreRevision
	if r.RestoreDraft {
		d, err := q.GetDraft(ctx, c.ID)
		if err != nil {
			return dbError(err)
		}
		r.RestoreDraft = policy.CanSetFeatured(u, d.Featured == 1, r.Featured)
	}
	return nil
}
func enrichDetail(ctx context.Context, q *dbsqlc.Queries, u dbsqlc.User, c dbsqlc.ContentItem, result *Detail) error {
	result.Actions = policy.ContentActionsFor(u, c)
	if result.Draft != nil {
		result.Byline.UserID = result.Draft.BylineUserID
		labels, err := relationLabels(ctx, q, u, result.Draft.Relations)
		if err != nil {
			return err
		}
		result.Draft.RelationLabels = labels
	} else if result.PendingRevision != nil {
		result.Byline.UserID = result.PendingRevision.BylineUserID
	}
	items := []Summary{result.Summary}
	if err := enrichSummaries(ctx, q, items); err != nil {
		return err
	}
	result.Summary = items[0]
	if result.PendingRevision != nil {
		if err := enrichRevision(ctx, q, u, c, result.PendingRevision, false); err != nil {
			return err
		}
	}
	if policy.CanEditDraft(u, c) {
		review, err := q.LatestContentReview(ctx, c.ID)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return dbError(err)
		}
		if err == nil {
			items := []Review{reviewDTO(review)}
			if err := enrichReviews(ctx, q, items); err != nil {
				return err
			}
			result.LatestReview = &items[0]
		}
	}
	return nil
}

// ReviewDetail cannot contain a Draft, even for an Admin. Its title and byline
// always come from the exact immutable candidate or historical revision.
type ReviewDetail struct {
	Content  Summary              `json:"content"`
	Revision Revision             `json:"revision"`
	Review   *Review              `json:"review"`
	Actions  policy.ReviewActions `json:"actions"`
}

func (s *Service) ReviewDetail(ctx context.Context, actor auth.Principal, contentID, reviewID int64) (ReviewDetail, error) {
	var result ReviewDetail
	err := s.transact(ctx, actor, func(q *dbsqlc.Queries, u dbsqlc.User, _ int64) error {
		if !policy.For(u.Role, u.Status).Review {
			return fault.Permission
		}
		var revisionID int64
		if reviewID > 0 {
			r, err := q.GetReviewByID(ctx, reviewID)
			if err != nil {
				return dbError(err)
			}
			contentID = r.ContentID
			revisionID = r.RevisionID
		}
		c, err := q.GetContent(ctx, contentID)
		if err != nil {
			return dbError(err)
		}
		if reviewID == 0 {
			if !policy.CanViewContent(u, c) || !c.PendingReviewRevisionID.Valid {
				return fault.NotFound
			}
			revisionID = c.PendingReviewRevisionID.Int64
		}
		r, err := q.GetRevisionByID(ctx, dbsqlc.GetRevisionByIDParams{ContentID: c.ID, ID: revisionID})
		if err != nil {
			return dbError(err)
		}
		result.Revision, err = s.loadRevision(ctx, q, c, r)
		if err != nil {
			return err
		}
		if err = enrichRevision(ctx, q, u, c, &result.Revision, false); err != nil {
			return err
		}
		result.Revision.RestoreDraft = false
		result.Content = summary(c, r.Title)
		result.Content.Byline.UserID = r.BylineUserID
		items := []Summary{result.Content}
		if err = enrichSummaries(ctx, q, items); err != nil {
			return err
		}
		result.Content = items[0]
		result.Review = result.Revision.Review
		result.Actions = policy.ReviewActionsFor(u, c, r)
		return nil
	})
	return result, err
}

func cleanSearch(s string) string { return strings.TrimSpace(s) }

func completedReviewSummary(ctx context.Context, q *dbsqlc.Queries, c dbsqlc.ContentItem, result *Detail) error {
	review, err := q.LatestContentReview(ctx, c.ID)
	if err != nil {
		return dbError(err)
	}
	revision, err := q.GetRevisionByID(ctx, dbsqlc.GetRevisionByIDParams{ContentID: c.ID, ID: review.RevisionID})
	if err != nil {
		return dbError(err)
	}
	result.Byline.UserID = revision.BylineUserID
	items := []Summary{result.Summary}
	if err = enrichSummaries(ctx, q, items); err != nil {
		return err
	}
	result.Summary = items[0]
	return nil
}
