package content

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"

	"github.com/deepfurry/gopher-atlas/internal/audit"
	"github.com/deepfurry/gopher-atlas/internal/auth"
	dbsqlc "github.com/deepfurry/gopher-atlas/internal/database/sqlc"
	"github.com/deepfurry/gopher-atlas/internal/fault"
	"github.com/deepfurry/gopher-atlas/internal/outbox"
	"github.com/deepfurry/gopher-atlas/internal/policy"
)

type TagInput struct {
	Name          string `json:"name"`
	Slug          string `json:"slug"`
	Description   string `json:"description"`
	NameEn        string `json:"nameEn"`
	DescriptionEn string `json:"descriptionEn"`
}
type Tag struct {
	ID int64 `json:"id"`
	TagInput
	CreatedBy int64 `json:"createdBy"`
	CreatedAt int64 `json:"createdAt"`
	UpdatedAt int64 `json:"updatedAt"`
}

func tagDTO(ctx context.Context, q *dbsqlc.Queries, t dbsqlc.Tag) (Tag, error) {
	result := Tag{ID: t.ID, TagInput: TagInput{Name: t.Name, Slug: t.Slug, Description: t.Description}, CreatedBy: t.CreatedBy, CreatedAt: t.CreatedAt, UpdatedAt: t.UpdatedAt}
	tr, err := q.GetTagTranslation(ctx, t.ID)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return result, dbError(err)
	}
	if err == nil {
		result.NameEn, result.DescriptionEn = tr.Name, tr.Description
	}
	return result, nil
}

// Normalization is Unicode lowercasing by strings.ToLower plus whitespace
// collapse. Persisted slugs are explicit inputs and never derived from names.
func normalizeTag(s string) string { return strings.ToLower(strings.Join(strings.Fields(s), " ")) }
func (s *Service) Tags(ctx context.Context, actor auth.Principal, after int64, search ...string) (Page[Tag], error) {
	result := Page[Tag]{Items: []Tag{}}
	err := s.transact(ctx, actor, func(q *dbsqlc.Queries, _ dbsqlc.User, _ int64) error {
		query := ""
		if len(search) > 0 {
			query = cleanSearch(search[0])
		}
		if after < 0 || !bounded(query, 100) {
			return fault.Validation
		}
		rows, err := q.ListTags(ctx, dbsqlc.ListTagsParams{AfterID: after, PageSize: PageSize, Search: query})
		if err != nil {
			return dbError(err)
		}
		for _, r := range rows {
			tag, err := tagDTO(ctx, q, r)
			if err != nil {
				return err
			}
			result.Items = append(result.Items, tag)
		}
		if len(rows) == PageSize {
			result.NextCursor = &rows[len(rows)-1].ID
		}
		return nil
	})
	return result, err
}

// PutTag creates for id=0. Existing slugs are permanent; there is no delete operation.
func (s *Service) PutTag(ctx context.Context, actor auth.Principal, id int64, in TagInput) (Tag, error) {
	s.fence.Lock()
	defer s.fence.Unlock()
	var result Tag
	err := s.transact(ctx, actor, func(q *dbsqlc.Queries, u dbsqlc.User, now int64) error {
		if !policy.For(u.Role, u.Status).ManageTaxonomy {
			return fault.Permission
		}
		if id < 0 || !bounded(in.Name, 100) || !bounded(in.Description, 1000) || !validSlug(in.Slug) || !bounded(in.NameEn, 100) || !bounded(in.DescriptionEn, 1000) {
			return fault.Validation
		}
		in.NameEn = strings.TrimSpace(in.NameEn)
		if in.NameEn == "" && in.DescriptionEn != "" {
			return fault.Validation
		}
		in.Name = strings.Join(strings.Fields(in.Name), " ")
		name := normalizeTag(in.Name)
		if name == "" {
			return fault.Validation
		}
		if id > 0 {
			old, err := q.GetTag(ctx, id)
			if err != nil {
				return dbError(err)
			}
			if old.Slug != in.Slug {
				return fault.TaxonomySlug
			}
		}
		count, err := q.FindTagConflict(ctx, dbsqlc.FindTagConflictParams{ExcludeID: id, NormalizedName: name, Slug: in.Slug})
		if err != nil {
			return dbError(err)
		}
		if count > 0 {
			return fault.TagConflict
		}
		var row dbsqlc.Tag
		action := "tag.created"
		if id == 0 {
			row, err = q.CreateTag(ctx, dbsqlc.CreateTagParams{Name: in.Name, NormalizedName: name, Slug: in.Slug, Description: in.Description, CreatedBy: u.ID, CreatedAt: now, UpdatedAt: now})
		} else {
			action = "tag.updated"
			row, err = q.UpdateTag(ctx, dbsqlc.UpdateTagParams{ID: id, Name: in.Name, NormalizedName: name, Description: in.Description, UpdatedAt: now})
		}
		if err != nil {
			return dbError(err)
		}
		if in.NameEn == "" {
			err = q.DeleteTagTranslation(ctx, row.ID)
		} else {
			err = q.PutTagTranslation(ctx, dbsqlc.PutTagTranslationParams{TagID: row.ID, Name: in.NameEn, Description: in.DescriptionEn})
		}
		if err != nil {
			return dbError(err)
		}
		result, err = tagDTO(ctx, q, row)
		if err != nil {
			return err
		}
		if err := audit.Append(ctx, q, audit.Event{ActorID: u.ID, Action: action, EntityType: "tag", EntityID: row.ID}, now); err != nil {
			return err
		}
		if id > 0 {
			used, err := q.PublishedRevisionUsesTag(ctx, id)
			if err != nil {
				return fault.Unavailable
			}
			if used {
				return outbox.MarkDirty(ctx, q, now)
			}
		}
		return nil
	})
	return result, err
}

type AuditEvent struct {
	Actor       auth.AuthorSummary `json:"actor"`
	ID          int64              `json:"id"`
	ActorUserID int64              `json:"actorUserId"`
	Action      string             `json:"action"`
	EntityType  string             `json:"entityType"`
	EntityID    int64              `json:"entityId"`
	RevisionID  *int64             `json:"revisionId"`
	Metadata    json.RawMessage    `json:"metadata"`
	RequestID   string             `json:"requestId"`
	CreatedAt   int64              `json:"createdAt"`
}

func (s *Service) Audit(ctx context.Context, actor auth.Principal, after int64) (Page[AuditEvent], error) {
	result := Page[AuditEvent]{Items: []AuditEvent{}}
	err := s.transact(ctx, actor, func(q *dbsqlc.Queries, u dbsqlc.User, _ int64) error {
		rows, err := audit.List(ctx, q, u, after)
		if err != nil {
			return err
		}
		for _, r := range rows {
			result.Items = append(result.Items, AuditEvent{ID: r.ID, ActorUserID: r.ActorUserID, Action: r.Action, EntityType: r.EntityType, EntityID: r.EntityID, RevisionID: pointer(r.RevisionID), Metadata: json.RawMessage(r.MetadataJson), RequestID: r.RequestID, CreatedAt: r.CreatedAt})
		}
		if len(rows) == PageSize {
			result.NextCursor = &rows[len(rows)-1].ID
		}
		ids := []int64{}
		for _, r := range result.Items {
			ids = append(ids, r.ActorUserID)
		}
		authors, err := auth.Summaries(ctx, q, ids)
		if err != nil {
			return err
		}
		for i := range result.Items {
			result.Items[i].Actor = authors[result.Items[i].ActorUserID]
		}
		return nil
	})
	return result, err
}
