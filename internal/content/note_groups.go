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

type NoteGroupInput struct {
	Slug          string `json:"slug"`
	Name          string `json:"name"`
	Description   string `json:"description"`
	NameEn        string `json:"nameEn"`
	DescriptionEn string `json:"descriptionEn"`
	Order         int64  `json:"order"`
}
type NoteGroup struct {
	ID int64 `json:"id"`
	NoteGroupInput
	CreatedAt int64 `json:"createdAt"`
	UpdatedAt int64 `json:"updatedAt"`
}

func groupDTO(g dbsqlc.NoteGroup) NoteGroup {
	return NoteGroup{g.ID, NoteGroupInput{g.Slug, g.Name, g.Description, g.NameEn, g.DescriptionEn, g.SortOrder}, g.CreatedAt, g.UpdatedAt}
}
func (in NoteGroupInput) Valid() bool {
	return validSlug(in.Slug) && strings.TrimSpace(in.Name) != "" && bounded(in.Name, 100) && bounded(in.Description, 1000) && bounded(in.NameEn, 100) && bounded(in.DescriptionEn, 1000) && in.Order >= 0 && in.Order <= 1000000
}
func (s *Service) NoteGroups(ctx context.Context, actor auth.Principal, after int64, search string) (Page[NoteGroup], error) {
	result := Page[NoteGroup]{Items: []NoteGroup{}}
	err := s.transact(ctx, actor, func(q *dbsqlc.Queries, _ dbsqlc.User, _ int64) error {
		search = cleanSearch(search)
		if after < 0 || !bounded(search, 100) {
			return fault.Validation
		}
		rows, err := q.ListNoteGroups(ctx, dbsqlc.ListNoteGroupsParams{AfterID: after, Search: search, PageSize: PageSize})
		if err != nil {
			return dbError(err)
		}
		for _, row := range rows {
			result.Items = append(result.Items, groupDTO(row))
		}
		if len(rows) == PageSize {
			result.NextCursor = &rows[len(rows)-1].ID
		}
		return nil
	})
	return result, err
}
func (s *Service) PutNoteGroup(ctx context.Context, actor auth.Principal, id int64, in NoteGroupInput) (NoteGroup, error) {
	s.fence.Lock()
	defer s.fence.Unlock()
	var result NoteGroup
	err := s.transact(ctx, actor, func(q *dbsqlc.Queries, u dbsqlc.User, now int64) error {
		if !policy.For(u.Role, u.Status).ManageTaxonomy {
			return fault.Permission
		}
		if id < 0 || !in.Valid() {
			return fault.Validation
		}
		in.Name = strings.TrimSpace(in.Name)
		in.NameEn = strings.TrimSpace(in.NameEn)
		if id > 0 {
			old, err := q.GetNoteGroup(ctx, id)
			if err != nil {
				return dbError(err)
			}
			if old.Slug != in.Slug {
				return fault.TaxonomySlug
			}
		}
		existing, err := q.GetNoteGroupBySlug(ctx, in.Slug)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return dbError(err)
		}
		if err == nil && existing.ID != id {
			return fault.GroupConflict
		}
		var row dbsqlc.NoteGroup
		action := "note_group.created"
		if id == 0 {
			row, err = q.CreateNoteGroup(ctx, dbsqlc.CreateNoteGroupParams{Slug: in.Slug, Name: in.Name, Description: in.Description, NameEn: in.NameEn, DescriptionEn: in.DescriptionEn, SortOrder: in.Order, CreatedAt: now, UpdatedAt: now})
		} else {
			action = "note_group.updated"
			row, err = q.UpdateNoteGroup(ctx, dbsqlc.UpdateNoteGroupParams{ID: id, Name: in.Name, Description: in.Description, NameEn: in.NameEn, DescriptionEn: in.DescriptionEn, SortOrder: in.Order, UpdatedAt: now})
		}
		if err != nil {
			return dbError(err)
		}
		result = groupDTO(row)
		if err = audit.Append(ctx, q, audit.Event{ActorID: u.ID, Action: action, EntityType: "note_group", EntityID: row.ID}, now); err != nil {
			return err
		}
		used, err := q.PublishedRevisionUsesGroup(ctx, in.Slug)
		if err != nil {
			return dbError(err)
		}
		if used {
			return outbox.MarkDirty(ctx, q, now)
		}
		return nil
	})
	return result, err
}

// Preserve the storage v1 shape, but never take display mirrors from the client.
// Also used for current Draft/list presentation; historical Revision DTOs stay exact.
func hydrateNote(ctx context.Context, q *dbsqlc.Queries, kind string, f *Fields, complete bool) error {
	if kind != "note" {
		return nil
	}
	var p NotePayload
	if err := strictPayload(f.Payload, &p); err != nil {
		return err
	}
	if p.Order < 0 || p.Order > 1000000 {
		return fault.Payload
	}
	if p.GroupSlug == "" {
		if complete {
			return fault.GroupMissing
		}
		p.Group, p.GroupDescription, p.GroupOrder = "", "", 0
	} else {
		if !validSlug(p.GroupSlug) {
			return fault.Payload
		}
		g, err := q.GetNoteGroupBySlug(ctx, p.GroupSlug)
		if errors.Is(err, sql.ErrNoRows) {
			return fault.GroupMissing
		}
		if err != nil {
			return dbError(err)
		}
		p.Group, p.GroupDescription, p.GroupOrder = g.Name, g.Description, g.SortOrder
	}
	raw, err := json.Marshal(p)
	if err != nil {
		return fault.Payload
	}
	f.Payload = raw
	return nil
}
