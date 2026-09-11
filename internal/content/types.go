// Package content owns editorial transactions and calls generated sqlc directly.
package content

import (
	"database/sql"
	"encoding/json"

	dbsqlc "github.com/deepfurry/gopher-atlas/internal/database/sqlc"
)

const (
	PageSize           = 100
	JSONBodyLimit      = 1 << 20
	MarkdownLimit      = 512 << 10
	ReviewCommentLimit = 16 << 10
	RelationLimit      = 100
)

type Fields struct {
	Title          string          `json:"title"`
	Slug           string          `json:"slug"`
	Summary        string          `json:"summary"`
	BodyMarkdown   string          `json:"bodyMarkdown"`
	BylineUserID   int64           `json:"bylineUserId"`
	Language       string          `json:"language"`
	Featured       bool            `json:"featured"`
	SEOTitle       string          `json:"seoTitle"`
	SEODescription string          `json:"seoDescription"`
	Payload        json.RawMessage `json:"payload"`
}
type TopicEntry struct {
	TargetContentID int64 `json:"targetContentId"`
}
type Relations struct {
	TagIDs []int64 `json:"tagIds"`
	// Array order is authoritative; SQL positions are one-based.
	TopicEntries []TopicEntry `json:"topicEntries"`
}
type DraftInput struct {
	Version int64 `json:"version"`
	Fields
	Relations
}
type Draft struct {
	DraftInput
	PayloadSchemaVersion int64 `json:"payloadSchemaVersion"`
	UpdatedBy            int64 `json:"updatedBy"`
	UpdatedAt            int64 `json:"updatedAt"`
}
type Summary struct {
	ID                  int64  `json:"id"`
	Type                string `json:"type"`
	OwnerUserID         int64  `json:"ownerUserId"`
	EditorialState      string `json:"editorialState"`
	PendingRevisionID   *int64 `json:"pendingReviewRevisionId"`
	PublishedRevisionID *int64 `json:"publishedRevisionId"`
	Title               string `json:"title"`
	CreatedBy           int64  `json:"createdBy"`
	CreatedAt           int64  `json:"createdAt"`
	UpdatedAt           int64  `json:"updatedAt"`
	FirstPublishedAt    *int64 `json:"firstPublishedAt"`
	LastPublishedAt     *int64 `json:"lastPublishedAt"`
	ArchivedAt          *int64 `json:"archivedAt"`
}
type Detail struct {
	Summary
	NextRouteCursor *int64    `json:"nextRouteCursor"`
	Draft           *Draft    `json:"draft"`
	PendingRevision *Revision `json:"pendingRevision"`
	Routes          []Route   `json:"routes"`
}
type RevisionSummary struct {
	ID           int64  `json:"id"`
	ContentID    int64  `json:"contentId"`
	RevisionNo   int64  `json:"revisionNo"`
	Title        string `json:"title"`
	Slug         string `json:"slug"`
	BylineUserID int64  `json:"bylineUserId"`
	CreatedBy    int64  `json:"createdBy"`
	CreatedAt    int64  `json:"createdAt"`
	Pending      bool   `json:"pending"`
	Published    bool   `json:"published"`
}
type Revision struct {
	ID         int64 `json:"id"`
	ContentID  int64 `json:"contentId"`
	RevisionNo int64 `json:"revisionNo"`
	Fields
	Relations
	PayloadSchemaVersion int64   `json:"payloadSchemaVersion"`
	CreatedBy            int64   `json:"createdBy"`
	CreatedAt            int64   `json:"createdAt"`
	Pending              bool    `json:"pending"`
	Published            bool    `json:"published"`
	Review               *Review `json:"review"`
}
type Review struct {
	ID              int64  `json:"id"`
	ContentID       int64  `json:"contentId"`
	RevisionID      int64  `json:"revisionId"`
	ReviewerUserID  int64  `json:"reviewerUserId"`
	Decision        string `json:"decision"`
	CommentMarkdown string `json:"commentMarkdown"`
	CreatedAt       int64  `json:"createdAt"`
}
type PendingReview struct {
	RevisionID   int64  `json:"revisionId"`
	ContentID    int64  `json:"contentId"`
	RevisionNo   int64  `json:"revisionNo"`
	Title        string `json:"title"`
	OwnerUserID  int64  `json:"ownerUserId"`
	BylineUserID int64  `json:"bylineUserId"`
	SubmittedAt  int64  `json:"submittedAt"`
}
type Route struct {
	Path string `json:"path"`
	Kind string `json:"kind"`
}
type Page[T any] struct {
	Items      []T    `json:"items"`
	NextCursor *int64 `json:"nextCursor"`
}

func pointer(n sql.NullInt64) *int64 {
	if !n.Valid {
		return nil
	}
	return &n.Int64
}
func stamp(n int64) sql.NullInt64 { return sql.NullInt64{Int64: n, Valid: true} }
func flag(b bool) int64 {
	if b {
		return 1
	}
	return 0
}
func summary(c dbsqlc.ContentItem, title string) Summary {
	return Summary{ID: c.ID, Type: c.Type, OwnerUserID: c.OwnerUserID, EditorialState: c.EditorialState,
		PendingRevisionID: pointer(c.PendingReviewRevisionID), PublishedRevisionID: pointer(c.PublishedRevisionID),
		Title: title, CreatedBy: c.CreatedBy, CreatedAt: c.CreatedAt, UpdatedAt: c.UpdatedAt,
		FirstPublishedAt: pointer(c.FirstPublishedAt), LastPublishedAt: pointer(c.LastPublishedAt), ArchivedAt: pointer(c.ArchivedAt)}
}
func draftFields(d dbsqlc.ContentDraft) Fields {
	return Fields{Title: d.Title, Slug: d.Slug, Summary: d.Summary, BodyMarkdown: d.BodyMarkdown, BylineUserID: d.BylineUserID,
		Language: d.Language, Featured: d.Featured == 1, SEOTitle: d.SeoTitle, SEODescription: d.SeoDescription, Payload: json.RawMessage(d.PayloadJson)}
}
func revisionFields(r dbsqlc.ContentRevision) Fields {
	return Fields{Title: r.Title, Slug: r.Slug, Summary: r.Summary, BodyMarkdown: r.BodyMarkdown, BylineUserID: r.BylineUserID,
		Language: r.Language, Featured: r.Featured == 1, SEOTitle: r.SeoTitle, SEODescription: r.SeoDescription, Payload: json.RawMessage(r.PayloadJson)}
}
func reviewDTO(r dbsqlc.ContentReview) Review {
	return Review{r.ID, r.ContentID, r.RevisionID, r.ReviewerUserID, r.Decision, r.CommentMarkdown, r.CreatedAt}
}
