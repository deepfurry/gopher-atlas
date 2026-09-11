package policy

import dbsqlc "github.com/deepfurry/gopher-atlas/internal/database/sqlc"

// Object authorization is separate from transition errors, so callers can report
// stale versions/state without duplicating role logic in transports.
func Active(u dbsqlc.User) bool   { return u.Status == "active" && ValidRole(u.Role) }
func Admin(u dbsqlc.User) bool    { return Active(u) && u.Role == "admin" }
func Reviewer(u dbsqlc.User) bool { return Active(u) && u.Role == "reviewer" }
func CanCreateContent(u dbsqlc.User, kind string) bool {
	switch kind {
	case "topic":
		return Admin(u)
	case "curated_article", "post", "note":
		return Active(u)
	default:
		return false
	}
}
func CanViewContent(u dbsqlc.User, c dbsqlc.ContentItem) bool {
	return Active(u) && (Admin(u) || (c.OwnerUserID == u.ID && !c.ArchivedAt.Valid) ||
		(Reviewer(u) && !c.ArchivedAt.Valid && c.EditorialState == "in_review" && c.PendingReviewRevisionID.Valid))
}
func CanEditDraft(u dbsqlc.User, c dbsqlc.ContentItem) bool {
	return Active(u) && (Admin(u) || c.OwnerUserID == u.ID)
}
func CanSubmit(u dbsqlc.User, c dbsqlc.ContentItem) bool         { return CanEditDraft(u, c) }
func CanWithdrawReview(u dbsqlc.User, c dbsqlc.ContentItem) bool { return CanEditDraft(u, c) }
func CanReview(u dbsqlc.User, c dbsqlc.ContentItem, r dbsqlc.ContentRevision) bool {
	return Admin(u) || (Reviewer(u) && c.OwnerUserID != u.ID && r.BylineUserID != u.ID)
}
func CanPublishReviewed(u dbsqlc.User, c dbsqlc.ContentItem, r dbsqlc.ContentRevision) bool {
	return CanReview(u, c, r)
}
func CanDirectPublish(u dbsqlc.User) bool                         { return Admin(u) }
func CanUnpublish(u dbsqlc.User) bool                             { return Admin(u) }
func CanArchive(u dbsqlc.User) bool                               { return Admin(u) }
func CanRestoreRevision(u dbsqlc.User, c dbsqlc.ContentItem) bool { return CanEditDraft(u, c) }
func CanSetByline(u dbsqlc.User, id int64) bool                   { return Admin(u) || (Active(u) && id == u.ID) }
func CanSetFeatured(u dbsqlc.User, old, next bool) bool {
	return Admin(u) || (Active(u) && old == next)
}
