package content

import (
	"context"
	"encoding/json"
	"unicode/utf8"

	"github.com/deepfurry/gopher-atlas/internal/auth"
	dbsqlc "github.com/deepfurry/gopher-atlas/internal/database/sqlc"
	"github.com/deepfurry/gopher-atlas/internal/fault"
	"github.com/deepfurry/gopher-atlas/internal/policy"
)

type ProductTag struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
	Slug string `json:"slug"`
}
type ProductTopic struct {
	ID    int64  `json:"id"`
	Title string `json:"title"`
}

func (s *Service) TopicChoices(ctx context.Context, actor auth.Principal, after int64, search string) (Page[ProductTopic], error) {
	result := Page[ProductTopic]{Items: []ProductTopic{}}
	err := s.transact(ctx, actor, func(q *dbsqlc.Queries, u dbsqlc.User, _ int64) error {
		if after < 0 || len(search) > 200 || !utf8.ValidString(search) {
			return fault.Validation
		}
		rows, err := q.ContentTopicChoices(ctx, dbsqlc.ContentTopicChoicesParams{IsAdmin: policy.Admin(u), AfterID: after, Search: cleanSearch(search), PageSize: PageSize + 1})
		if err != nil {
			return dbError(err)
		}
		more := len(rows) > PageSize
		if more {
			rows = rows[:PageSize]
		}
		for _, row := range rows {
			result.Items = append(result.Items, ProductTopic{row.ID, row.Title})
		}
		if more {
			result.NextCursor = &rows[len(rows)-1].ID
		}
		return nil
	})
	return result, err
}

type ProductSummary struct {
	Summary    string          `json:"summary"`
	Payload    json.RawMessage `json:"payload"`
	Language   string          `json:"language"`
	Featured   bool            `json:"featured"`
	EntryCount int64           `json:"entryCount"`
	Tags       []ProductTag    `json:"tags"`
	Topics     []ProductTopic  `json:"topics"`
}

func enrichProducts(ctx context.Context, q *dbsqlc.Queries, u dbsqlc.User, items []Summary) error {
	if len(items) == 0 {
		return nil
	}
	ids := make([]int64, 0, len(items))
	byID := map[int64]*ProductSummary{}
	for j := range items {
		ids = append(ids, items[j].ID)
		items[j].Product = &ProductSummary{Tags: []ProductTag{}, Topics: []ProductTopic{}}
		byID[items[j].ID] = items[j].Product
	}
	rows, err := q.ProductMetadata(ctx, ids)
	if err != nil {
		return dbError(err)
	}
	for _, row := range rows {
		p := byID[row.ID]
		if policy.CanEditDraft(u, dbsqlc.ContentItem{OwnerUserID: row.OwnerUserID}) {
			p.Summary = row.DraftSummary
			p.Payload = json.RawMessage(row.DraftPayload)
			p.Language = row.DraftLanguage
			p.Featured = row.DraftFeatured == 1
			p.EntryCount = row.DraftEntryCount
		} else {
			p.Summary = row.RevisionSummary.String
			p.Payload = json.RawMessage(row.RevisionPayload.String)
			p.Language = row.RevisionLanguage.String
			p.Featured = row.RevisionFeatured.Int64 == 1
			p.EntryCount = row.RevisionEntryCount
		}
	}
	for _, item := range items {
		if item.Type != "note" {
			continue
		}
		fields := Fields{Payload: item.Product.Payload}
		if err := hydrateNote(ctx, q, "note", &fields, false); err != nil {
			return err
		}
		item.Product.Payload = fields.Payload
	}
	tags, err := q.ProductTags(ctx, dbsqlc.ProductTagsParams{Ids: ids, IsAdmin: policy.Admin(u), ActorID: u.ID})
	if err != nil {
		return dbError(err)
	}
	for _, tag := range tags {
		byID[tag.ContentID].Tags = append(byID[tag.ContentID].Tags, ProductTag{tag.ID, tag.Name, tag.Slug})
	}
	topics, err := q.ProductTopics(ctx, dbsqlc.ProductTopicsParams{Ids: ids, IsAdmin: policy.Admin(u)})
	if err != nil {
		return dbError(err)
	}
	if len(topics) > 10000 {
		return fault.Unavailable
	}
	for _, topic := range topics {
		byID[topic.TargetContentID].Topics = append(byID[topic.TargetContentID].Topics, ProductTopic{topic.ID, topic.Title})
	}
	return nil
}
