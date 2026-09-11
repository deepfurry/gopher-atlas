package content

import (
	"encoding/json"
	"github.com/deepfurry/gopher-atlas/internal/auth"
	dbsqlc "github.com/deepfurry/gopher-atlas/internal/database/sqlc"
	"github.com/deepfurry/gopher-atlas/internal/fault"
	"strings"
	"testing"
)

func TestEditorialUXActionsAndImmutableReviewDetail(t *testing.T) {
	r := newRig(t)
	d := r.prepared(t, r.editor, "post", "projection")
	if !d.Actions.EditDraft || !d.Actions.SubmitReview || d.Actions.DirectPublish || d.Actions.AssignByline || d.Actions.SetFeatured {
		t.Fatal("editor action projection")
	}
	admin, err := r.s.Get(ctx, r.admin, d.ID)
	must(t, err)
	if !admin.Actions.DirectPublish || !admin.Actions.AssignByline || !admin.Actions.SetFeatured {
		t.Fatal("admin projection")
	}
	d, err = r.s.Submit(ctx, r.editor, d.ID, d.Draft.Version)
	must(t, err)
	if d.Actions.EditDraft || d.Actions.SubmitReview || !d.Actions.WithdrawReview {
		t.Fatal("pending draft not locked")
	}
	for _, actor := range []auth.Principal{r.admin, r.reviewer} {
		view, err := r.s.ReviewDetail(ctx, actor, d.ID, 0)
		must(t, err)
		data, err := json.Marshal(view)
		must(t, err)
		if strings.Contains(string(data), `"draft"`) || !view.Actions.ApprovePublish || view.Revision.ID != d.PendingRevision.ID {
			t.Fatal("review endpoint leaked Draft or wrong projection")
		}
	}
	_, err = r.s.ReviewDetail(ctx, r.editor, d.ID, 0)
	wantError(t, err, fault.Permission)
	_, err = r.s.RequestChanges(ctx, r.reviewer, d.ID, d.PendingRevision.ID, "## Please clarify")
	must(t, err)
	d, err = r.s.Get(ctx, r.editor, d.ID)
	must(t, err)
	if d.LatestReview == nil || d.LatestReview.RevisionNo != 1 || d.LatestReview.Reviewer.UserID != r.reviewer.User.ID {
		t.Fatal("feedback labels")
	}
	in := d.Draft.DraftInput
	in.Title = "PRIVATE NEXT DRAFT"
	_, err = r.s.Save(ctx, r.editor, d.ID, in)
	must(t, err)
	for _, actor := range []auth.Principal{r.admin, r.reviewer} {
		view, err := r.s.ReviewDetail(ctx, actor, 0, d.LatestReview.ID)
		must(t, err)
		data, err := json.Marshal(view)
		must(t, err)
		if strings.Contains(string(data), "PRIVATE NEXT DRAFT") || view.Actions.ApprovePublish || view.Actions.RequestChanges || view.Revision.Title == in.Title {
			t.Fatal("history leaked draft or enabled completed actions")
		}
	}
	_, err = r.s.ReviewDetail(ctx, r.editor, 0, d.LatestReview.ID)
	wantError(t, err, fault.Permission)
	history, err := r.s.ReviewHistory(ctx, r.reviewer, 0)
	must(t, err)
	if history.Items[0].Title == in.Title || history.Items[0].Reviewer.UserID == 0 {
		t.Fatal("history label source")
	}
}
func TestEditorialUXFiltersKeepObjectVisibility(t *testing.T) {
	r := newRig(t)
	a := r.prepared(t, r.editor, "post", "visible")
	b := r.prepared(t, r.other, "note", "hidden")
	_, err := r.s.List(ctx, r.editor, 0, false, Filters{OwnerUserID: r.other.User.ID})
	wantError(t, err, fault.Permission)
	rows, err := r.s.List(ctx, r.editor, 0, false, Filters{Search: "hidden"})
	must(t, err)
	if len(rows.Items) != 0 {
		t.Fatal("filter bypass")
	}
	rows, err = r.s.List(ctx, r.admin, 0, false, Filters{Type: "note", Search: "hidden", OwnerUserID: r.other.User.ID})
	must(t, err)
	if len(rows.Items) != 1 || rows.Items[0].ID != b.ID {
		t.Fatal("admin filters")
	}
	_, err = r.s.Submit(ctx, r.editor, a.ID, a.Draft.Version)
	must(t, err)
	// Simulate out-of-band damage to prove query filters use immutable metadata,
	// rather than merely depending on the workflow's normal Draft lock.
	_, err = r.db.Exec("UPDATE content_drafts SET title='PRIVATE METADATA' WHERE content_id=?", a.ID)
	must(t, err)
	rows, err = r.s.List(ctx, r.reviewer, 0, false, Filters{Search: "PRIVATE"})
	must(t, err)
	if len(rows.Items) != 0 {
		t.Fatal("filter leaked Draft")
	}
	rows, err = r.s.List(ctx, r.reviewer, 0, false, Filters{Search: "visible", EditorialState: "in_review", Type: "post"})
	must(t, err)
	if len(rows.Items) != 1 || rows.Items[0].Title != "Title visible" || rows.Items[0].Actions.EditDraft || rows.Items[0].Owner.UserID != r.editor.User.ID {
		t.Fatal("visible pending projection")
	}
	_, err = r.s.List(ctx, r.admin, 0, false, Filters{Type: "asset"})
	wantError(t, err, fault.Validation)
	_, err = r.s.List(ctx, r.admin, 0, false, Filters{Search: strings.Repeat("x", 201)})
	wantError(t, err, fault.Validation)
}
func TestEditorialUXAuthorPrivacyAndSharedProfileValidation(t *testing.T) {
	r := newRig(t)
	page, err := r.auth.Authors(ctx, r.editor, 0, "")
	must(t, err)
	if len(page.Items) != 4 {
		t.Fatal("author directory")
	}
	data, err := json.Marshal(page)
	must(t, err)
	for _, forbidden := range []string{`"role"`, `"status"`, `"session"`, `"githubUserId"`, `token`, `csrf`} {
		if strings.Contains(string(data), forbidden) {
			t.Fatal("sensitive author summary")
		}
	}
	input := auth.ProfileInput{DisplayName: "Readable author", BioMarkdown: "## About", WebsiteURL: "https://example.com"}
	_, err = r.auth.UpdateAuthorProfile(ctx, r.editor, r.other.User.ID, input)
	wantError(t, err, fault.Permission)
	before := r.count(t, "audit_events")
	_, err = r.auth.UpdateAuthorProfile(ctx, r.admin, r.other.User.ID, input)
	must(t, err)
	if r.count(t, "audit_events") != before+1 {
		t.Fatal("profile audit missing")
	}
	detail, err := r.auth.Author(ctx, r.editor, r.other.User.ID)
	must(t, err)
	if detail.DisplayName != input.DisplayName {
		t.Fatal("author detail")
	}
	input.BioMarkdown = "# Unsafe"
	_, err = r.auth.UpdateAuthorProfile(ctx, r.admin, r.other.User.ID, input)
	wantError(t, err, fault.Validation)
	if r.count(t, "audit_events") != before+1 {
		t.Fatal("failed edit audited")
	}
	_, err = r.q.SetUserAccess(ctx, dbsqlc.SetUserAccessParams{ID: r.editor.User.ID, Role: "editor", Status: "disabled", UpdatedAt: 1})
	must(t, err)
	_, err = r.auth.Authors(ctx, r.editor, 0, "")
	if err == nil {
		t.Fatal("stale actor authorized")
	}
}
func TestEditorialUXSelfReviewAndArchiveProjections(t *testing.T) {
	r := newRig(t)
	d := r.prepared(t, r.reviewer, "post", "self-review")
	d, err := r.s.Submit(ctx, r.reviewer, d.ID, d.Draft.Version)
	must(t, err)
	view, err := r.s.ReviewDetail(ctx, r.reviewer, d.ID, 0)
	must(t, err)
	if view.Actions.ApprovePublish || view.Actions.RequestChanges {
		t.Fatal("self review projected")
	}
	view, err = r.s.ReviewDetail(ctx, r.admin, d.ID, 0)
	must(t, err)
	if !view.Actions.ApprovePublish {
		t.Fatal("admin bypass missing")
	}
	d, err = r.s.PublishReviewed(ctx, r.admin, d.ID, d.PendingRevision.ID, "")
	must(t, err)
	if d.PublishedRevisionNo == nil || *d.PublishedRevisionNo != 1 || !d.Actions.EditDraft || d.Actions.DirectPublish || d.Actions.SubmitReview {
		t.Fatal("synced projection")
	}
	d, err = r.s.Archive(ctx, r.admin, d.ID)
	must(t, err)
	if !d.Actions.RestoreArchive || d.Actions.EditDraft || d.Actions.Archive || d.Actions.Unpublish || d.Actions.RestoreRevision {
		t.Fatal("archive projection")
	}
}

func TestRestoreProjectionPreservesExistingHistoricalBylineSemantics(t *testing.T) {
	r := newRig(t)
	d := r.prepared(t, r.editor, "post", "historical-byline")
	in := d.Draft.DraftInput
	in.BylineUserID = r.reviewer.User.ID
	saved, err := r.s.Save(ctx, r.admin, d.ID, in)
	must(t, err)
	d, err = r.s.PublishDirect(ctx, r.admin, d.ID, saved.Version)
	must(t, err)
	rev, err := r.s.Revision(ctx, r.editor, d.ID, 1)
	must(t, err)
	if !rev.RestoreDraft {
		t.Fatal("projection invented a historical byline restriction")
	}
	_, err = r.s.RestoreRevision(ctx, r.editor, d.ID, 1, d.Draft.Version)
	must(t, err)
}
