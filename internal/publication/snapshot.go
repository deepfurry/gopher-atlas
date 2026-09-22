// Package publication exports public immutable state and runs the durable
// single-process publication flow. Private identity/editorial DTOs are not exports.
package publication

import (
	"context"
	"database/sql"
	"encoding/json"
	"sort"
	"time"

	"github.com/deepfurry/gopher-atlas/internal/assets"
	"github.com/deepfurry/gopher-atlas/internal/content"
	dbsqlc "github.com/deepfurry/gopher-atlas/internal/database/sqlc"
	"github.com/deepfurry/gopher-atlas/internal/fault"
	"github.com/deepfurry/gopher-atlas/internal/markdown"
	"github.com/deepfurry/gopher-atlas/internal/storage"
)

type Author struct {
	ID          int64  `json:"id"`
	Slug        string `json:"slug"`
	DisplayName string `json:"displayName"`
	BioMarkdown string `json:"bioMarkdown"`
	AvatarURL   string `json:"avatarUrl"`
	WebsiteURL  string `json:"websiteUrl"`
}
type Tag struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	Slug        string `json:"slug"`
	Description string `json:"description"`
}
type TopicEntry struct {
	Position        int64 `json:"position"`
	TargetContentID int64 `json:"targetContentId"`
}
type PublicContent struct {
	ID               int64           `json:"id"`
	Type             string          `json:"type"`
	RevisionNo       int64           `json:"revisionNo"`
	CanonicalPath    string          `json:"canonicalPath"`
	Title            string          `json:"title"`
	Slug             string          `json:"slug"`
	Summary          string          `json:"summary"`
	BodyMarkdown     string          `json:"bodyMarkdown"`
	AuthorID         int64           `json:"authorId"`
	Language         string          `json:"language"`
	Featured         bool            `json:"featured"`
	SEOTitle         string          `json:"seoTitle"`
	SEODescription   string          `json:"seoDescription"`
	CoverAssetID     *int64          `json:"coverAssetId"`
	FirstPublishedAt int64           `json:"firstPublishedAt"`
	LastPublishedAt  int64           `json:"lastPublishedAt"`
	TagIDs           []int64         `json:"tagIds"`
	TopicEntries     []TopicEntry    `json:"topicEntries"`
	Payload          json.RawMessage `json:"payload"`
}
type Route struct {
	Path      string `json:"path"`
	Kind      string `json:"kind"`
	ContentID int64  `json:"contentId"`
}
type Snapshot struct {
	SchemaVersion int              `json:"schemaVersion"`
	Generation    int64            `json:"generation"`
	ExportedAt    string           `json:"exportedAt"`
	Authors       []Author         `json:"authors"`
	Assets        []assets.Summary `json:"assets"`
	Tags          []Tag            `json:"tags"`
	Content       []PublicContent  `json:"content"`
	Routes        []Route          `json:"routes"`
}
type Exported struct {
	Snapshot Snapshot
	Bytes    []byte
	SHA256   string
}
type Exporter struct {
	AssetPolicy      markdown.Policy
	DB               *sql.DB
	MaxBytes         int
	afterReadStarted func()
}

func (e *Exporter) Export(ctx context.Context, generation int64) (Exported, error) {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	limit := e.MaxBytes
	if limit <= 0 || limit > storage.MaxSnapshotBytes {
		limit = storage.MaxSnapshotBytes
	}
	conn, err := e.DB.Conn(ctx)
	if err != nil {
		return Exported{}, fault.Unavailable
	}
	defer conn.Close()
	// Explicit deferred BEGIN bypasses the pool's immediate WRITE transaction
	// default. WAL writers may commit while this consistent read snapshot is held.
	if _, err = conn.ExecContext(ctx, "BEGIN"); err != nil {
		return Exported{}, fault.Unavailable
	}
	defer func() {
		cleanup, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_, _ = conn.ExecContext(cleanup, "ROLLBACK")
	}()
	q := dbsqlc.New(conn)
	state, err := q.GetSiteState(ctx)
	if err != nil {
		return Exported{}, fault.Unavailable
	}
	if state.PublicationGeneration != generation {
		return Exported{}, fault.SnapshotStale
	}
	if e.afterReadStarted != nil {
		e.afterReadStarted()
	}
	result := Snapshot{SchemaVersion: 1, Generation: generation, ExportedAt: time.UnixMilli(state.UpdatedAt).UTC().Format(time.RFC3339Nano), Authors: []Author{}, Assets: []assets.Summary{}, Tags: []Tag{}, Content: []PublicContent{}, Routes: []Route{}}
	expected, err := q.CountPublishedContent(ctx)
	if err != nil {
		return Exported{}, fault.Unavailable
	}
	if expected > 10000 {
		return Exported{}, fault.SnapshotInvalid
	}
	total := 1024
	fits := func(value any) bool {
		data, err := json.Marshal(value)
		total += len(data) + 2
		return err == nil && total <= limit
	}
	authors := map[int64]bool{}
	covers := map[int64]bool{}
	tags := map[int64]bool{}
	after := int64(0)
	for {
		rows, err := q.ExportPublishedContent(ctx, dbsqlc.ExportPublishedContentParams{AfterID: after, PageSize: 100})
		if err != nil {
			return Exported{}, fault.SnapshotInvalid
		}
		for _, r := range rows {
			if r.PayloadSchemaVersion != 1 || !r.FirstPublishedAt.Valid || !r.LastPublishedAt.Valid || !e.AssetPolicy.Valid(r.BodyMarkdown) {
				return Exported{}, fault.SnapshotInvalid
			}
			payload, err := content.CanonicalPayload(r.Type, []byte(r.PayloadJson), true)
			if err != nil {
				return Exported{}, fault.SnapshotInvalid
			}
			path, err := content.PublishedPath(r.Type, content.Fields{Title: r.Title, Slug: r.Slug, Summary: r.Summary, BodyMarkdown: r.BodyMarkdown, BylineUserID: r.BylineUserID, Language: r.Language, Featured: r.Featured == 1, SEOTitle: r.SeoTitle, SEODescription: r.SeoDescription, Payload: payload}, e.AssetPolicy)
			if err != nil || path != r.CanonicalPath {
				return Exported{}, fault.SnapshotInvalid
			}
			item := PublicContent{ID: r.ContentID, Type: r.Type, RevisionNo: r.RevisionNo, CanonicalPath: r.CanonicalPath, Title: r.Title, Slug: r.Slug, Summary: r.Summary, BodyMarkdown: r.BodyMarkdown, AuthorID: r.BylineUserID, Language: r.Language, Featured: r.Featured == 1, SEOTitle: r.SeoTitle, SEODescription: r.SeoDescription, FirstPublishedAt: r.FirstPublishedAt.Int64, LastPublishedAt: r.LastPublishedAt.Int64, Payload: payload, TopicEntries: []TopicEntry{}}
			item.TagIDs, err = q.RevisionTagIDs(ctx, r.ID)
			if err != nil {
				return Exported{}, fault.SnapshotInvalid
			}
			entries, err := q.RevisionTopicEntries(ctx, r.ID)
			if err != nil {
				return Exported{}, fault.SnapshotInvalid
			}
			for _, entry := range entries {
				item.TopicEntries = append(item.TopicEntries, TopicEntry{entry.Position, entry.TargetContentID})
			}
			if !authors[r.BylineUserID] {
				a, err := q.GetProfile(ctx, r.BylineUserID)
				if err != nil {
					return Exported{}, fault.SnapshotInvalid
				}
				author := Author{a.UserID, a.Slug, a.DisplayName, a.BioMarkdown, a.AvatarUrl, a.WebsiteUrl}
				if !fits(author) || !e.AssetPolicy.Valid(author.BioMarkdown) {
					return Exported{}, fault.SnapshotInvalid
				}
				result.Authors = append(result.Authors, author)
				authors[a.UserID] = true
			}
			if r.CoverAssetID.Valid {
				id := r.CoverAssetID.Int64
				item.CoverAssetID = &id
				if !covers[id] {
					a, err := q.GetAsset(ctx, id)
					if err != nil {
						return Exported{}, fault.SnapshotInvalid
					}
					public := assets.Public(a, e.AssetPolicy)
					if !fits(public) {
						return Exported{}, fault.SnapshotInvalid
					}
					result.Assets = append(result.Assets, public)
					covers[id] = true
				}
			}
			for _, id := range item.TagIDs {
				if !tags[id] {
					t, err := q.GetTag(ctx, id)
					if err != nil {
						return Exported{}, fault.SnapshotInvalid
					}
					tag := Tag{t.ID, t.Name, t.Slug, t.Description}
					if !fits(tag) {
						return Exported{}, fault.SnapshotInvalid
					}
					result.Tags = append(result.Tags, tag)
					tags[id] = true
				}
			}
			if !fits(item) {
				return Exported{}, fault.SnapshotInvalid
			}
			result.Content = append(result.Content, item)
			after = item.ID
		}
		if len(rows) < 100 {
			break
		}
	}
	if int64(len(result.Content)) != expected {
		return Exported{}, fault.SnapshotInvalid
	}
	path := ""
	for {
		rows, err := q.ExportPublishedRoutes(ctx, dbsqlc.ExportPublishedRoutesParams{AfterPath: path, PageSize: 1000})
		if err != nil {
			return Exported{}, fault.SnapshotInvalid
		}
		for _, r := range rows {
			route := Route{r.Path, r.Kind, r.ContentID}
			if !fits(route) || len(result.Routes) >= 100000 {
				return Exported{}, fault.SnapshotInvalid
			}
			result.Routes = append(result.Routes, route)
			path = r.Path
		}
		if len(rows) < 1000 {
			break
		}
	}
	sort.Slice(result.Authors, func(i, j int) bool { return result.Authors[i].ID < result.Authors[j].ID })
	sort.Slice(result.Assets, func(i, j int) bool { return result.Assets[i].ID < result.Assets[j].ID })
	sort.Slice(result.Tags, func(i, j int) bool { return result.Tags[i].ID < result.Tags[j].ID })
	if err := validateGraph(result, e.AssetPolicy); err != nil {
		return Exported{}, err
	}
	data, err := json.Marshal(result)
	if err != nil || len(data) > limit {
		return Exported{}, fault.SnapshotInvalid
	}
	if _, err = conn.ExecContext(ctx, "COMMIT"); err != nil {
		return Exported{}, fault.Unavailable
	}
	if err = conn.Close(); err != nil {
		return Exported{}, fault.Unavailable
	}
	current, err := dbsqlc.New(e.DB).GetSiteState(ctx)
	if err != nil {
		return Exported{}, fault.Unavailable
	}
	if current.PublicationGeneration != generation {
		return Exported{}, fault.SnapshotStale
	}
	return Exported{result, data, storage.Digest(data)}, nil
}

func validateGraph(s Snapshot, policies ...markdown.Policy) error {
	policy := markdown.Policy{}
	if len(policies) > 0 {
		policy = policies[0]
	}
	if len(s.Content) > 10000 || len(s.Authors) > 10000 || len(s.Assets) > 10000 || len(s.Tags) > 100000 || len(s.Routes) > 100000 {
		return fault.SnapshotInvalid
	}
	contents := map[int64]PublicContent{}
	groups := map[string]content.NotePayload{}
	authors := map[int64]bool{}
	tags := map[int64]bool{}
	covers := map[int64]bool{}
	for _, a := range s.Authors {
		if a.ID <= 0 || authors[a.ID] {
			return fault.SnapshotInvalid
		}
		authors[a.ID] = true
	}
	for _, a := range s.Assets {
		if a.ID <= 0 || covers[a.ID] || !policy.AssetURL(a.URL) {
			return fault.SnapshotInvalid
		}
		covers[a.ID] = true
	}
	for _, t := range s.Tags {
		if t.ID <= 0 || tags[t.ID] {
			return fault.SnapshotInvalid
		}
		tags[t.ID] = true
	}
	for _, c := range s.Content {
		if c.Type == "note" {
			var note content.NotePayload
			if json.Unmarshal(c.Payload, &note) != nil {
				return fault.SnapshotInvalid
			}
			if prior, ok := groups[note.GroupSlug]; ok && (prior.Group != note.Group || prior.GroupDescription != note.GroupDescription || prior.GroupOrder != note.GroupOrder) {
				return fault.SnapshotInvalid
			}
			groups[note.GroupSlug] = note
		}
		if c.ID <= 0 || contents[c.ID].ID != 0 || !authors[c.AuthorID] || c.CanonicalPath == "" || (c.CoverAssetID != nil && !covers[*c.CoverAssetID]) {
			return fault.SnapshotInvalid
		}
		for _, id := range c.TagIDs {
			if !tags[id] {
				return fault.SnapshotInvalid
			}
		}
		contents[c.ID] = c
	}
	for _, c := range s.Content {
		seen := map[int64]bool{}
		if c.Type == "topic" {
			var p content.TopicPayload
			if json.Unmarshal(c.Payload, &p) != nil || p.RecommendedCount < 0 || p.RecommendedCount > int64(len(c.TopicEntries)) {
				return fault.SnapshotInvalid
			}
		}
		if (c.Type == "topic" && len(c.TagIDs) > 0) || (c.Type != "topic" && len(c.TopicEntries) > 0) {
			return fault.SnapshotInvalid
		}
		for i, e := range c.TopicEntries {
			if e.Position != int64(i+1) || e.TargetContentID == c.ID || seen[e.TargetContentID] || contents[e.TargetContentID].Type != "curated_article" {
				return fault.SnapshotInvalid
			}
			seen[e.TargetContentID] = true
		}
	}
	paths := map[string]bool{}
	canonical := map[int64]int{}
	for _, r := range s.Routes {
		c, ok := contents[r.ContentID]
		if !ok || paths[r.Path] {
			return fault.SnapshotInvalid
		}
		paths[r.Path] = true
		if r.Kind == "canonical" {
			canonical[r.ContentID]++
			if r.Path != c.CanonicalPath {
				return fault.SnapshotInvalid
			}
		} else if r.Kind != "redirect" {
			return fault.SnapshotInvalid
		}
	}
	for id := range contents {
		if canonical[id] != 1 {
			return fault.SnapshotInvalid
		}
	}
	return nil
}
