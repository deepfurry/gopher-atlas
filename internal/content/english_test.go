package content

import (
	"github.com/deepfurry/gopher-atlas/internal/fault"
	"strings"
	"testing"
)

func english() *EditorialEnglish {
	return &EditorialEnglish{Title: "English title", Summary: "English summary", BodyMarkdown: "## English\n\n" + strings.Repeat("original ", 5000), Labels: EnglishLabels{RelatedLinks: []RelatedLink{}}}
}

func TestEnglishVersionedSaveReviewRestoreAndLimits(t *testing.T) {
	r := newRig(t)
	d := r.prepared(t, r.admin, "curated_article", "bilingual")
	in := d.Draft.DraftInput
	in.EditorialEn = english()
	saved, err := r.s.Save(ctx, r.admin, d.ID, in)
	must(t, err)
	if saved.EditorialEn == nil || len(saved.EditorialEn.BodyMarkdown) <= 32<<10 || saved.EditorialEn.Enabled {
		t.Fatal("English body lost or automatically enabled")
	}
	published, err := r.s.PublishDirect(ctx, r.admin, d.ID, saved.Version)
	must(t, err)
	rev, err := r.s.Revision(ctx, r.admin, d.ID, 1)
	must(t, err)
	if rev.EditorialEn == nil || rev.EditorialEn.BodyMarkdown != saved.EditorialEn.BodyMarkdown {
		t.Fatal("Revision omitted English")
	}
	in = published.Draft.DraftInput
	in.EditorialEn.Title = "New English"
	in.EditorialEn.Enabled = true
	saved, err = r.s.Save(ctx, r.admin, d.ID, in)
	must(t, err)
	original, err := r.s.Revision(ctx, r.admin, d.ID, 1)
	must(t, err)
	if original.EditorialEn.Title != "English title" || original.EditorialEn.Enabled {
		t.Fatal("autosave changed history")
	}
	restored, err := r.s.RestoreRevision(ctx, r.admin, d.ID, 1, saved.Version)
	must(t, err)
	if restored.Draft.EditorialEn.Title != "English title" || restored.Draft.EditorialEn.Enabled || *restored.PublishedRevisionID != *published.PublishedRevisionID {
		t.Fatal("restore mixed languages/publication")
	}
	in = restored.Draft.DraftInput
	in.EditorialEn.BodyMarkdown = "<script>unsafe</script>"
	_, err = r.s.Save(ctx, r.admin, d.ID, in)
	wantError(t, err, fault.Markdown)
	in.EditorialEn.BodyMarkdown = strings.Repeat("a", MarkdownLimit+1)
	_, err = r.s.Save(ctx, r.admin, d.ID, in)
	wantError(t, err, fault.Markdown)
}

func TestEnglishExplicitPublicationCompletenessAndTypeBoundary(t *testing.T) {
	r := newRig(t)
	d := r.prepared(t, r.admin, "topic", "translate")
	in := d.Draft.DraftInput
	in.EditorialEn = english()
	in.EditorialEn.Enabled = true
	in.EditorialEn.Summary = " "
	saved, err := r.s.Save(ctx, r.admin, d.ID, in)
	must(t, err)
	_, err = r.s.PublishDirect(ctx, r.admin, d.ID, saved.Version)
	wantError(t, err, fault.Validation)
	in.Version = saved.Version
	in.EditorialEn.Enabled = false
	saved, err = r.s.Save(ctx, r.admin, d.ID, in)
	must(t, err)
	_, err = r.s.PublishDirect(ctx, r.admin, d.ID, saved.Version)
	must(t, err)
	n := r.prepared(t, r.admin, "note", "original-note")
	ni := n.Draft.DraftInput
	ni.EditorialEn = english()
	_, err = r.s.Save(ctx, r.admin, n.ID, ni)
	wantError(t, err, fault.Validation)
}

func TestEnglishReviewedCandidateIsExactAndOmissionCannotEraseText(t *testing.T) {
	r := newRig(t)
	d := r.prepared(t, r.editor, "curated_article", "review-language")
	in := d.Draft.DraftInput
	in.EditorialEn = english()
	in.EditorialEn.Enabled = true
	saved, err := r.s.Save(ctx, r.editor, d.ID, in)
	must(t, err)
	stale := saved.DraftInput
	stale.EditorialEn = nil
	_, err = r.s.Save(ctx, r.editor, d.ID, stale)
	wantError(t, err, fault.Validation)
	candidate, err := r.s.Submit(ctx, r.editor, d.ID, saved.Version)
	must(t, err)
	reviewed, err := r.s.Get(ctx, r.reviewer, d.ID)
	must(t, err)
	if reviewed.Draft != nil || reviewed.PendingRevision.EditorialEn.Title != "English title" {
		t.Fatal("review did not select immutable bilingual candidate")
	}
	published, err := r.s.PublishReviewed(ctx, r.reviewer, d.ID, candidate.PendingRevision.ID, "")
	must(t, err)
	if *published.PublishedRevisionID != candidate.PendingRevision.ID {
		t.Fatal("published another Revision")
	}
}
