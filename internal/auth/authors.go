package auth

import (
	"context"
	"strings"
	"unicode/utf8"

	dbsqlc "github.com/deepfurry/gopher-atlas/internal/database/sqlc"
	"github.com/deepfurry/gopher-atlas/internal/fault"
)

// Authorship is deliberately separate from identity access and session data.
type AuthorSummary struct {
	UserID      int64  `json:"userId"`
	Slug        string `json:"slug"`
	DisplayName string `json:"displayName"`
	AvatarURL   string `json:"avatarUrl"`
}
type AuthorDetail struct {
	AuthorSummary
	BioMarkdown string `json:"bioMarkdown"`
	WebsiteURL  string `json:"websiteUrl"`
}
type AuthorPage struct {
	Items      []AuthorSummary `json:"items"`
	NextCursor *int64          `json:"nextCursor"`
}

// Summaries batches labels within the caller's authorized transaction.
func Summaries(ctx context.Context, q *dbsqlc.Queries, ids []int64) (map[int64]AuthorSummary, error) {
	result := make(map[int64]AuthorSummary)
	if len(ids) == 0 {
		return result, nil
	}
	unique := make([]int64, 0, len(ids))
	seen := map[int64]bool{}
	for _, id := range ids {
		if id > 0 && !seen[id] {
			unique = append(unique, id)
			seen[id] = true
		}
	}
	rows, err := q.AuthorSummaries(ctx, unique)
	if err != nil {
		return nil, dbError(err)
	}
	for _, r := range rows {
		result[r.UserID] = AuthorSummary{r.UserID, r.Slug, r.DisplayName, r.AvatarUrl}
	}
	return result, nil
}
func (s *Service) Authors(ctx context.Context, actor Principal, after int64, search string) (AuthorPage, error) {
	result := AuthorPage{Items: []AuthorSummary{}}
	err := s.withActor(ctx, actor, func(q *dbsqlc.Queries, _ Principal) error {
		if after < 0 || !utf8.ValidString(search) || len(search) > 200 {
			return fault.Validation
		}
		rows, err := q.ListAuthors(ctx, dbsqlc.ListAuthorsParams{AfterID: after, Search: strings.TrimSpace(search), PageSize: 100})
		if err != nil {
			return dbError(err)
		}
		for _, r := range rows {
			result.Items = append(result.Items, AuthorSummary{r.UserID, r.Slug, r.DisplayName, r.AvatarUrl})
		}
		if len(rows) == 100 {
			result.NextCursor = &rows[len(rows)-1].UserID
		}
		return nil
	})
	return result, err
}
func (s *Service) Author(ctx context.Context, actor Principal, id int64) (AuthorDetail, error) {
	var result AuthorDetail
	err := s.withActor(ctx, actor, func(q *dbsqlc.Queries, _ Principal) error {
		r, err := q.GetProfile(ctx, id)
		if err != nil {
			return dbError(err)
		}
		result = AuthorDetail{AuthorSummary{r.UserID, r.Slug, r.DisplayName, r.AvatarUrl}, r.BioMarkdown, r.WebsiteUrl}
		return nil
	})
	return result, err
}
