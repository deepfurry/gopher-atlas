package policy

import dbsqlc "github.com/deepfurry/gopher-atlas/internal/database/sqlc"

// Projections describe available commands. Mutations still authorize inside
// their transaction and validate the submitted version/revision and payload.
type ContentActions struct {
	EditDraft       bool `json:"editDraft"`
	SubmitReview    bool `json:"submitReview"`
	WithdrawReview  bool `json:"withdrawReview"`
	DirectPublish   bool `json:"directPublish"`
	Unpublish       bool `json:"unpublish"`
	Archive         bool `json:"archive"`
	RestoreArchive  bool `json:"restoreArchive"`
	RestoreRevision bool `json:"restoreRevision"`
	AssignByline    bool `json:"assignByline"`
	SetFeatured     bool `json:"setFeatured"`
}

func ContentActionsFor(u dbsqlc.User, c dbsqlc.ContentItem) ContentActions {
	available := !c.ArchivedAt.Valid
	mutable := available && c.EditorialState != "in_review"
	submittable := available && (c.EditorialState == "draft" || c.EditorialState == "changes_requested")
	return ContentActions{
		EditDraft: mutable && CanEditDraft(u, c), SubmitReview: submittable && CanSubmit(u, c),
		WithdrawReview: available && c.PendingReviewRevisionID.Valid && CanWithdrawReview(u, c),
		DirectPublish:  submittable && CanDirectPublish(u), Unpublish: available && c.PublishedRevisionID.Valid && CanUnpublish(u),
		Archive: available && CanArchive(u), RestoreArchive: !available && CanArchive(u),
		RestoreRevision: mutable && CanRestoreRevision(u, c), AssignByline: mutable && Admin(u), SetFeatured: mutable && Admin(u),
	}
}

type ReviewActions struct {
	RequestChanges bool `json:"requestChanges"`
	ApprovePublish bool `json:"approvePublish"`
}

func ReviewActionsFor(u dbsqlc.User, c dbsqlc.ContentItem, r dbsqlc.ContentRevision) ReviewActions {
	pending := !c.ArchivedAt.Valid && c.EditorialState == "in_review" && c.PendingReviewRevisionID.Valid && c.PendingReviewRevisionID.Int64 == r.ID
	return ReviewActions{RequestChanges: pending && CanReview(u, c, r), ApprovePublish: pending && CanPublishReviewed(u, c, r)}
}
