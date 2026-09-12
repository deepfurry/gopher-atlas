// Package legacy provides the offline, source-planned import. It creates no
// schema and never calls Deploy Hook or uploads publication snapshots.
package legacy

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/deepfurry/gopher-atlas/internal/assets"
	"github.com/deepfurry/gopher-atlas/internal/auth"
	"github.com/deepfurry/gopher-atlas/internal/content"
	dbsqlc "github.com/deepfurry/gopher-atlas/internal/database/sqlc"
	"github.com/deepfurry/gopher-atlas/internal/fault"
)

type ImageEdit struct {
	URL   string `json:"url"`
	Start int    `json:"start"`
	End   int    `json:"end"`
}
type Item struct {
	Key  string `json:"key"`
	File string `json:"file"`
	Type string `json:"type"`
	content.Fields
	TagSlugs         []string    `json:"tagSlugs"`
	TargetKeys       []string    `json:"targetKeys"`
	ImageEdits       []ImageEdit `json:"imageEdits"`
	FirstPublishedAt *int64      `json:"firstPublishedAt"`
	LastPublishedAt  *int64      `json:"lastPublishedAt"`
}
type Issue struct {
	File   string `json:"file"`
	Field  string `json:"field"`
	Reason string `json:"reason"`
}
type Route struct {
	File      string `json:"file"`
	Path      string `json:"path"`
	Preserved bool   `json:"preserved"`
}
type Plan struct {
	SchemaVersion int                `json:"schemaVersion"`
	OwnerID       int64              `json:"ownerId"`
	Tags          []content.TagInput `json:"tags"`
	Items         []Item             `json:"items"`
	Images        []string           `json:"images"`
	Routes        []Route            `json:"routes"`
	Warnings      []Issue            `json:"warnings"`
	Errors        []Issue            `json:"errors"`
	Stats         json.RawMessage    `json:"stats"`
	SiteFiles     []struct {
		File   string `json:"file"`
		Action string `json:"action"`
	} `json:"siteFiles"`
}
type Result struct {
	Tags       int   `json:"tags"`
	Assets     int   `json:"assets"`
	Content    int   `json:"content"`
	Generation int64 `json:"generation"`
}
type Importer struct {
	DB       *sql.DB
	Content  *content.Service
	Assets   *assets.Service
	Download func(context.Context, string) ([]byte, error)
}

func path(item Item) (string, error) {
	fields := item.Fields
	// Image edits are validated separately; the complete fields must otherwise
	// satisfy the same server contract as ordinary editorial publication.
	fields.BodyMarkdown = ""
	return content.PublishedPath(item.Type, fields)
}

// Preflight is read-only and rejects repeats/collisions before the first asset
// upload or editorial mutation. Services still reauthorize every subsequent write.
func (i *Importer) Preflight(ctx context.Context, actor auth.Principal, plan Plan) error {
	if plan.SchemaVersion != 1 || len(plan.Errors) != 0 || plan.OwnerID != actor.User.ID || len(plan.Items) == 0 || len(plan.Items) > 10000 || len(plan.Tags) > 100000 || len(plan.Images) > 1000 {
		return errors.New("legacy_plan_invalid")
	}
	tx, err := i.DB.BeginTx(ctx, nil)
	if err != nil {
		return fault.Unavailable
	}
	defer tx.Rollback()
	q := dbsqlc.New(tx)
	current, err := auth.Reauthorize(ctx, q, actor, nowMillis())
	if err != nil {
		return err
	}
	if current.User.Role != "admin" {
		return fault.Permission
	}
	keys := map[string]string{}
	paths := map[string]bool{}
	imageURLs := map[string]bool{}
	noteGroups := map[string]content.NotePayload{}
	for _, url := range plan.Images {
		if imageURLs[url] {
			return errors.New("legacy_duplicate_image")
		}
		imageURLs[url] = true
	}
	for _, item := range plan.Items {
		if item.Type != "curated_article" && item.Type != "topic" && item.Type != "note" {
			return errors.New("legacy_type_invalid")
		}
		p, err := path(item)
		if err != nil {
			return fmt.Errorf("%s: invalid_fields", item.Key)
		}
		if keys[item.Key] != "" || paths[p] {
			return errors.New("legacy_duplicate_identity")
		}
		keys[item.Key], paths[p] = item.Type, true
		if _, err := q.GetProfile(ctx, item.BylineUserID); err != nil {
			return fmt.Errorf("%s: author_mapping_missing", item.Key)
		}
		n, err := q.LegacyContentCollision(ctx, dbsqlc.LegacyContentCollisionParams{ContentType: item.Type, Slug: item.Slug})
		if err != nil {
			return fault.Unavailable
		}
		owned, err := q.LegacyOwnedRoute(ctx, p)
		if err != nil {
			return fault.Unavailable
		}
		if n > 0 || owned > 0 {
			return fmt.Errorf("%s: legacy_route_or_slug_collision", item.Key)
		}
		if item.Type == "note" {
			var note content.NotePayload
			if json.Unmarshal(item.Payload, &note) != nil {
				return errors.New("legacy_note_group_invalid")
			}
			matches := func(other content.NotePayload) bool {
				return note.Group == other.Group && note.GroupDescription == other.GroupDescription && note.GroupOrder == other.GroupOrder
			}
			if other, exists := noteGroups[note.GroupSlug]; exists && !matches(other) {
				return errors.New("legacy_note_group_conflict")
			}
			noteGroups[note.GroupSlug] = note
			published, err := q.PublishedNoteGroupMetadata(ctx, dbsqlc.PublishedNoteGroupMetadataParams{GroupSlug: note.GroupSlug})
			if err != nil {
				return fault.Unavailable
			}
			for _, raw := range published {
				var other content.NotePayload
				if json.Unmarshal([]byte(raw), &other) != nil || !matches(other) {
					return errors.New("legacy_note_group_conflict")
				}
			}
		}
		if (item.FirstPublishedAt == nil) != (item.LastPublishedAt == nil) || (item.FirstPublishedAt != nil && (*item.FirstPublishedAt < 0 || *item.LastPublishedAt < *item.FirstPublishedAt || *item.LastPublishedAt > nowMillis())) {
			return errors.New("legacy_dates_invalid")
		}
		for _, edit := range item.ImageEdits {
			if !imageURLs[edit.URL] || edit.Start < 0 || edit.End <= edit.Start || edit.End > len(item.BodyMarkdown) || item.BodyMarkdown[edit.Start:edit.End] != edit.URL {
				return errors.New("legacy_image_edit_invalid")
			}
		}
	}
	previousKeys := map[string]bool{}
	for _, item := range plan.Items {
		seen := map[string]bool{}
		for _, key := range item.TargetKeys {
			if item.Type != "topic" || keys[key] != "curated_article" || seen[key] || !previousKeys[key] {
				return errors.New("legacy_topic_target_invalid")
			}
			seen[key] = true
		}
		if item.Type == "topic" {
			var payload content.TopicPayload
			if json.Unmarshal(item.Payload, &payload) != nil || payload.RecommendedCount > int64(len(item.TargetKeys)) {
				return errors.New("legacy_topic_boundary_invalid")
			}
		}
		previousKeys[item.Key] = true
	}
	tagSlugs, tagNames := map[string]bool{}, map[string]bool{}
	for _, tag := range plan.Tags {
		name := strings.ToLower(strings.Join(strings.Fields(tag.Name), " "))
		if name == "" || tagSlugs[tag.Slug] || tagNames[name] {
			return errors.New("legacy_duplicate_tag")
		}
		tagSlugs[tag.Slug], tagNames[name] = true, true
		n, err := q.FindTagConflict(ctx, dbsqlc.FindTagConflictParams{NormalizedName: name, Slug: tag.Slug})
		if err != nil {
			return fault.Unavailable
		}
		if n > 0 {
			return fmt.Errorf("tag:%s: legacy_tag_collision", tag.Slug)
		}
	}
	for _, item := range plan.Items {
		seen := map[string]bool{}
		for _, slug := range item.TagSlugs {
			if item.Type == "topic" || !tagSlugs[slug] || seen[slug] {
				return errors.New("legacy_tag_reference_invalid")
			}
			seen[slug] = true
		}
	}
	return nil
}

func (i *Importer) Apply(ctx context.Context, actor auth.Principal, plan Plan) (Result, error) {
	var result Result
	if err := i.Preflight(ctx, actor, plan); err != nil {
		return result, err
	}
	// Download and inspect all images before any mutation. Binary metadata remains
	// intact. No source article body is fetched, only planned Markdown images.
	data := map[string][]byte{}
	totalBytes := 0
	for _, url := range plan.Images {
		if i.Download == nil {
			return result, errors.New("legacy_image_download_unavailable")
		}
		body, err := i.Download(ctx, url)
		if err != nil {
			return result, errors.New("legacy_image_download_failed")
		}
		if _, err := assets.Inspect(body); err != nil {
			return result, err
		}
		totalBytes += len(body)
		if totalBytes > 128<<20 {
			return result, errors.New("legacy_image_batch_too_large")
		}
		data[url] = body
	}
	replacements := map[string]string{}
	for _, url := range plan.Images {
		asset, err := i.Assets.Upload(ctx, actor, data[url])
		if err != nil {
			return result, err
		}
		replacements[url] = asset.URL
		result.Assets++
	}
	// Validate the rewritten Markdown in Go before creating any Content/Tag.
	items := append([]Item(nil), plan.Items...)
	for index := range items {
		item := &items[index]
		body := item.BodyMarkdown
		edits := append([]ImageEdit(nil), item.ImageEdits...)
		sort.Slice(edits, func(a, b int) bool { return edits[a].Start > edits[b].Start })
		end := len(body)
		for _, edit := range edits {
			replacement, ok := replacements[edit.URL]
			if !ok || edit.End > end {
				return result, errors.New("legacy_image_edit_invalid")
			}
			body = body[:edit.Start] + replacement + body[edit.End:]
			end = edit.Start
		}
		item.BodyMarkdown = body
		if _, err := content.PublishedPath(item.Type, item.Fields); err != nil {
			return result, fmt.Errorf("%s: %w", item.Key, err)
		}
	}
	tags := map[string]int64{}
	for _, input := range plan.Tags {
		tag, err := i.Content.PutTag(ctx, actor, 0, input)
		if err != nil {
			return result, err
		}
		tags[tag.Slug] = tag.ID
		result.Tags++
	}
	created := map[string]int64{}
	for _, item := range items {
		detail, err := i.Content.Create(ctx, actor, item.Type)
		if err != nil {
			return result, fmt.Errorf("%s: %w", item.Key, err)
		}
		input := content.DraftInput{Version: detail.Draft.Version, Fields: item.Fields, Relations: content.Relations{TagIDs: []int64{}, TopicEntries: []content.TopicEntry{}}}
		for _, slug := range item.TagSlugs {
			id := tags[slug]
			if id == 0 {
				return result, errors.New("legacy_tag_missing")
			}
			input.TagIDs = append(input.TagIDs, id)
		}
		for _, key := range item.TargetKeys {
			id := created[key]
			if id == 0 {
				return result, errors.New("legacy_topic_order_invalid")
			}
			input.TopicEntries = append(input.TopicEntries, content.TopicEntry{TargetContentID: id})
		}
		draft, err := i.Content.Save(ctx, actor, detail.ID, input)
		if err != nil {
			return result, fmt.Errorf("%s: %w", item.Key, err)
		}
		if item.FirstPublishedAt != nil {
			_, err = i.Content.PublishLegacy(ctx, actor, detail.ID, draft.Version, content.LegacyDates{First: *item.FirstPublishedAt, Last: *item.LastPublishedAt})
		} else {
			_, err = i.Content.PublishDirect(ctx, actor, detail.ID, draft.Version)
		}
		if err != nil {
			return result, fmt.Errorf("%s: %w", item.Key, err)
		}
		created[item.Key] = detail.ID
		result.Content++
	}
	state, err := dbsqlc.New(i.DB).GetSiteState(ctx)
	if err != nil {
		return result, fault.Unavailable
	}
	result.Generation = state.PublicationGeneration
	return result, nil
}
