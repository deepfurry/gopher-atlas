// Package taxonomyupgrade implements the explicit, offline schema-3/4 data
// upgrade. It never opens environment-selected databases or contacts storage.
package taxonomyupgrade

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"reflect"
	"sort"
	"time"

	"github.com/deepfurry/gopher-atlas/internal/audit"
	"github.com/deepfurry/gopher-atlas/internal/content"
	dbsqlc "github.com/deepfurry/gopher-atlas/internal/database/sqlc"
	"github.com/deepfurry/gopher-atlas/internal/outbox"
	"github.com/deepfurry/gopher-atlas/internal/policy"
	"github.com/deepfurry/gopher-atlas/internal/storage"
)

var (
	ErrUnavailable = errors.New("taxonomy upgrade: database unavailable or incompatible")
	ErrConflict    = errors.New("taxonomy upgrade: resolve reported conflicts before applying")
	ErrStale       = errors.New("taxonomy upgrade: plan fingerprint changed; inspect a new plan")
	ErrApplied     = errors.New("taxonomy upgrade: already initialized; no changes made")
	ErrActor       = errors.New("taxonomy upgrade: an existing active Admin actor is required")
)

type Source struct {
	ContentID int64                  `json:"contentId"`
	Source    string                 `json:"source"`
	Version   int64                  `json:"version"`
	Group     content.NoteGroupInput `json:"group"`
}
type Issue struct {
	Slug    string   `json:"slug"`
	Code    string   `json:"code"`
	Sources []Source `json:"sources"`
}
type Plan struct {
	Fingerprint   string                   `json:"fingerprint"`
	Generation    int64                    `json:"generation"`
	Groups        []content.NoteGroupInput `json:"groups"`
	Issues        []Issue                  `json:"issues"`
	SkippedDrafts int                      `json:"skippedDrafts"`
}

func inspect(ctx context.Context, q *dbsqlc.Queries) (Plan, error) {
	result := Plan{Groups: []content.NoteGroupInput{}, Issues: []Issue{}}
	state, err := q.GetSiteState(ctx)
	if err != nil {
		return result, ErrUnavailable
	}
	result.Generation = state.PublicationGeneration
	rows, err := q.LegacyNoteGroupSources(ctx)
	if err != nil {
		return result, ErrUnavailable
	}
	// Stable across schema migration; includes versions, exact source payloads and
	// generation so even a non-taxonomy publication invalidates a previously seen plan.
	bytes, err := json.Marshal(struct {
		Generation int64
		Rows       []dbsqlc.LegacyNoteGroupSourcesRow
	}{result.Generation, rows})
	if err != nil {
		return result, ErrUnavailable
	}
	result.Fingerprint = storage.Digest(bytes)
	sources := map[string][]Source{}
	for _, row := range rows {
		var p content.NotePayload
		raw, err := content.CanonicalPayload("note", []byte(row.PayloadJson), false)
		valid := err == nil && json.Unmarshal(raw, &p) == nil
		source := Source{ContentID: row.ContentID, Source: row.Source, Version: row.Version, Group: content.NoteGroupInput{Slug: p.GroupSlug, Name: p.Group, Description: p.GroupDescription, Order: p.GroupOrder}}
		if !valid {
			result.Issues = append(result.Issues, Issue{Code: "invalid_payload", Sources: []Source{source}})
			continue
		}
		if p.GroupSlug == "" && row.Source == "draft" {
			result.SkippedDrafts++
			continue
		}
		if !source.Group.Valid() {
			result.Issues = append(result.Issues, Issue{Slug: p.GroupSlug, Code: "incomplete_group", Sources: []Source{source}})
			continue
		}
		sources[p.GroupSlug] = append(sources[p.GroupSlug], source)
	}
	slugs := make([]string, 0, len(sources))
	for slug := range sources {
		slugs = append(slugs, slug)
	}
	sort.Strings(slugs)
	for _, slug := range slugs {
		rows := sources[slug]
		conflict := false
		for _, row := range rows[1:] {
			if row.Group != rows[0].Group {
				conflict = true
			}
		}
		if conflict {
			result.Issues = append(result.Issues, Issue{slug, "conflicting_metadata", rows})
			continue
		}
		result.Groups = append(result.Groups, rows[0].Group)
	}
	return result, nil
}

// Inspect uses a deferred, read-only transaction; callers may open SQLite mode=ro.
func Inspect(ctx context.Context, db *sql.DB) (Plan, error) {
	conn, err := db.Conn(ctx)
	if err != nil {
		return Plan{}, ErrUnavailable
	}
	defer conn.Close()
	if _, err = conn.ExecContext(ctx, "BEGIN"); err != nil {
		return Plan{}, ErrUnavailable
	}
	defer conn.ExecContext(context.Background(), "ROLLBACK")
	var version int
	if err = conn.QueryRowContext(ctx, "SELECT max(version_id) FROM goose_db_version WHERE is_applied=1").Scan(&version); err != nil || (version != 3 && version != 4) {
		return Plan{}, ErrUnavailable
	}
	return inspect(ctx, dbsqlc.New(conn))
}

// Apply is one explicit offline transaction. The sole CMS writer MUST be stopped.
// Caller supplies the reviewed fingerprint and an existing Admin identity. No
// Draft/Revision/tag/route row is updated, and a second apply is detected.
func Apply(ctx context.Context, db *sql.DB, expected string, actorID int64) (Plan, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return Plan{}, ErrUnavailable
	}
	defer tx.Rollback()
	var version int
	if err = tx.QueryRowContext(ctx, "SELECT max(version_id) FROM goose_db_version WHERE is_applied=1").Scan(&version); err != nil || version != 4 {
		return Plan{}, ErrUnavailable
	}
	q := dbsqlc.New(tx)
	state, err := q.GetTaxonomyState(ctx)
	if err != nil {
		return Plan{}, ErrUnavailable
	}
	if state.Ready != 0 {
		return Plan{}, ErrApplied
	}
	actor, err := q.GetUser(ctx, actorID)
	if err != nil || !policy.For(actor.Role, actor.Status).ManageTaxonomy {
		return Plan{}, ErrActor
	}
	plan, err := inspect(ctx, q)
	if err != nil {
		return plan, err
	}
	if len(plan.Issues) > 0 {
		return plan, ErrConflict
	}
	if expected == "" || expected != plan.Fingerprint {
		return plan, ErrStale
	}
	// Refuse a partially or manually initialized authority, never overwrite it.
	groups, err := q.ListNoteGroups(ctx, dbsqlc.ListNoteGroupsParams{PageSize: 1})
	if err != nil {
		return plan, ErrUnavailable
	}
	if len(groups) > 0 {
		return plan, ErrConflict
	}
	now := time.Now().UnixMilli()
	for _, g := range plan.Groups {
		row, err := q.CreateNoteGroup(ctx, dbsqlc.CreateNoteGroupParams{Slug: g.Slug, Name: g.Name, Description: g.Description, SortOrder: g.Order, CreatedAt: now, UpdatedAt: now})
		if err != nil {
			return plan, ErrUnavailable
		}
		if err = audit.Append(ctx, q, audit.Event{ActorID: actorID, Action: "note_group.imported", EntityType: "note_group", EntityID: row.ID}, now); err != nil {
			return plan, ErrUnavailable
		}
	}
	// v1 and v2 bytes differ: never attempt to rewrite an old immutable generation.
	// This queues one new full snapshot without creating any article Revision.
	if err = outbox.MarkDirty(ctx, q, now); err != nil {
		return plan, ErrUnavailable
	}
	if err = audit.Append(ctx, q, audit.Event{ActorID: actorID, Action: "publication.taxonomy_upgraded", EntityType: "publication", EntityID: 1}, now); err != nil {
		return plan, ErrUnavailable
	}
	n, err := q.CompleteTaxonomyUpgrade(ctx, plan.Fingerprint)
	if err != nil || n != 1 {
		return plan, ErrUnavailable
	}
	after, err := inspect(ctx, q)
	if err != nil || !reflect.DeepEqual(after.Groups, plan.Groups) || len(after.Issues) > 0 {
		return plan, ErrUnavailable
	}
	if err = tx.Commit(); err != nil {
		return plan, ErrUnavailable
	}
	return plan, nil
}
