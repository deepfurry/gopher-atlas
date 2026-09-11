package content

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/deepfurry/gopher-atlas/internal/audit"
	"github.com/deepfurry/gopher-atlas/internal/auth"
	dbsqlc "github.com/deepfurry/gopher-atlas/internal/database/sqlc"
	"github.com/deepfurry/gopher-atlas/internal/fault"
	"github.com/deepfurry/gopher-atlas/internal/policy"
)

type TagInput struct {
	Name        string `json:"name"`
	Slug        string `json:"slug"`
	Description string `json:"description"`
}
type Tag struct {
	ID int64 `json:"id"`
	TagInput
	CreatedBy int64 `json:"createdBy"`
	CreatedAt int64 `json:"createdAt"`
	UpdatedAt int64 `json:"updatedAt"`
}

func tagDTO(t dbsqlc.Tag) Tag {
	return Tag{t.ID, TagInput{t.Name, t.Slug, t.Description}, t.CreatedBy, t.CreatedAt, t.UpdatedAt}
}

// Normalization is Unicode lowercasing by strings.ToLower plus whitespace
// collapse. Persisted slugs are explicit inputs and never derived from names.
func normalizeTag(s string) string { return strings.ToLower(strings.Join(strings.Fields(s), " ")) }
func (s *Service) Tags(ctx context.Context, actor auth.Principal, after int64) (Page[Tag], error) {
	result := Page[Tag]{Items: []Tag{}}
	err := s.transact(ctx, actor, func(q *dbsqlc.Queries, _ dbsqlc.User, _ int64) error {
		if after < 0 {
			return fault.Validation
		}
		rows, err := q.ListTags(ctx, dbsqlc.ListTagsParams{AfterID: after, PageSize: PageSize})
		if err != nil {
			return dbError(err)
		}
		for _, r := range rows {
			result.Items = append(result.Items, tagDTO(r))
		}
		if len(rows) == PageSize {
			result.NextCursor = &rows[len(rows)-1].ID
		}
		return nil
	})
	return result, err
}

// PutTag creates for id=0; an existing tag keeps its explicit slug unless the
// Admin sends a different valid slug. There is no delete operation.
func (s *Service) PutTag(ctx context.Context, actor auth.Principal, id int64, in TagInput) (Tag, error) {
	var result Tag
	err := s.transact(ctx, actor, func(q *dbsqlc.Queries, u dbsqlc.User, now int64) error {
		if !policy.For(u.Role, u.Status).ManageTaxonomy {
			return fault.Permission
		}
		if id < 0 || !bounded(in.Name, 100) || !bounded(in.Description, 1000) || !validSlug(in.Slug) {
			return fault.Validation
		}
		in.Name = strings.Join(strings.Fields(in.Name), " ")
		name := normalizeTag(in.Name)
		if name == "" {
			return fault.Validation
		}
		if id > 0 {
			if _, err := q.GetTag(ctx, id); err != nil {
				return dbError(err)
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
			row, err = q.UpdateTag(ctx, dbsqlc.UpdateTagParams{ID: id, Name: in.Name, NormalizedName: name, Slug: in.Slug, Description: in.Description, UpdatedAt: now})
		}
		if err != nil {
			return dbError(err)
		}
		result = tagDTO(row)
		return audit.Append(ctx, q, audit.Event{ActorID: u.ID, Action: action, EntityType: "tag", EntityID: row.ID}, now)
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
