package content

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	dbsqlc "github.com/deepfurry/gopher-atlas/internal/database/sqlc"
	"github.com/deepfurry/gopher-atlas/internal/fault"
)

func TestTaxonomyAuthorityPermissionsAndGeneration(t *testing.T) {
	r := newRig(t)
	group, err := r.s.PutNoteGroup(ctx, r.admin, 0, NoteGroupInput{Slug: "engineering", Name: "工程实践", Description: "中文说明", NameEn: "Engineering", Order: 3})
	must(t, err)
	_, err = r.s.PutNoteGroup(ctx, r.editor, group.ID, group.NoteGroupInput)
	wantError(t, err, fault.Permission)
	_, err = r.s.PutNoteGroup(ctx, r.reviewer, 0, NoteGroupInput{Slug: "denied", Name: "Denied"})
	wantError(t, err, fault.Permission)
	_, err = r.s.PutNoteGroup(ctx, r.admin, 0, group.NoteGroupInput)
	wantError(t, err, fault.GroupConflict)
	changed := group.NoteGroupInput
	changed.Slug = "renamed"
	_, err = r.s.PutNoteGroup(ctx, r.admin, group.ID, changed)
	wantError(t, err, fault.TaxonomySlug)
	if r.count(t, "publication_jobs") != 0 {
		t.Fatal("unused group published")
	}
	d := r.create(t, r.editor, "note")
	in := input(d, "stable")
	in.Payload = json.RawMessage(`{"groupSlug":"unknown","order":1}`)
	_, err = r.s.Save(ctx, r.editor, d.ID, in)
	wantError(t, err, fault.GroupMissing)
	in.Payload = json.RawMessage(`{"groupSlug":"engineering","order":1,"group":"forged","groupDescription":"forged","groupOrder":999}`)
	draft, err := r.s.Save(ctx, r.editor, d.ID, in)
	must(t, err)
	var payload NotePayload
	must(t, json.Unmarshal(draft.Payload, &payload))
	if payload.Group != "工程实践" || payload.GroupDescription != "中文说明" || payload.GroupOrder != 3 {
		t.Fatal("forged mirrors survived")
	}
	// Metadata changes between save and submit refresh only the new Revision.
	group.Name = "工程"
	group.Order = 4
	group, err = r.s.PutNoteGroup(ctx, r.admin, group.ID, group.NoteGroupInput)
	must(t, err)
	submitted, err := r.s.Submit(ctx, r.editor, d.ID, draft.Version)
	must(t, err)
	must(t, json.Unmarshal(submitted.PendingRevision.Payload, &payload))
	if payload.Group != "工程" || payload.GroupOrder != 4 {
		t.Fatal("submission used stale mirrors")
	}
	revisionBefore, err := r.q.GetRevision(ctx, dbsqlc.GetRevisionParams{ContentID: d.ID, RevisionNo: 1})
	must(t, err)
	group.Name = "实践"
	group.NameEn = "Practice"
	_, err = r.s.PutNoteGroup(ctx, r.admin, group.ID, group.NoteGroupInput)
	must(t, err)
	if r.count(t, "publication_jobs") != 0 {
		t.Fatal("draft-only taxonomy change published")
	}
	published, err := r.s.PublishReviewed(ctx, r.reviewer, d.ID, submitted.PendingRevision.ID, "")
	must(t, err)
	if *published.PublishedRevisionID != revisionBefore.ID {
		t.Fatal("reviewed revision replaced")
	}
	revAfter, err := r.q.GetRevision(ctx, dbsqlc.GetRevisionParams{ContentID: d.ID, RevisionNo: 1})
	must(t, err)
	if revisionBefore != revAfter {
		t.Fatal("historical revision rewritten")
	}
	oldRoutes, err := r.s.Routes(ctx, r.admin, d.ID, 0)
	must(t, err)
	before, err := r.q.GetSiteState(ctx)
	must(t, err)
	group.DescriptionEn = "Practice notes"
	_, err = r.s.PutNoteGroup(ctx, r.admin, group.ID, group.NoteGroupInput)
	must(t, err)
	after, err := r.q.GetSiteState(ctx)
	must(t, err)
	if after.PublicationGeneration != before.PublicationGeneration+1 || r.count(t, "content_revisions") != 1 {
		t.Fatal("group edit did not queue exactly one generation without revisions")
	}
	routes, err := r.s.Routes(ctx, r.admin, d.ID, 0)
	must(t, err)
	if fmt.Sprint(routes) != fmt.Sprint(oldRoutes) {
		t.Fatal("group metadata changed routes")
	}
	// Audit/outbox failures roll back both metadata and generation.
	_, err = r.db.Exec("CREATE TRIGGER fail_group_audit BEFORE INSERT ON audit_events WHEN NEW.entity_type='note_group' BEGIN SELECT RAISE(ABORT,'forced'); END")
	must(t, err)
	group.Name = "Rollback"
	_, err = r.s.PutNoteGroup(ctx, r.admin, group.ID, group.NoteGroupInput)
	wantError(t, err, fault.Unavailable)
	stored, err := r.q.GetNoteGroup(ctx, group.ID)
	must(t, err)
	if stored.Name == "Rollback" {
		t.Fatal("audit failure leaked metadata")
	}
	failedState, err := r.q.GetSiteState(ctx)
	must(t, err)
	if failedState != after {
		t.Fatal("audit failure advanced generation")
	}
}

func TestTranslatedTagsSearchPaginationAndPermanentSlug(t *testing.T) {
	r := newRig(t)
	for i := 0; i < 102; i++ {
		_, err := r.s.PutTag(ctx, r.admin, 0, TagInput{Name: fmt.Sprintf("标签 %03d", i), Slug: fmt.Sprintf("tag-%03d", i), NameEn: fmt.Sprintf("Translated %03d", i)})
		must(t, err)
	}
	first, err := r.s.Tags(ctx, r.editor, 0, "translated")
	must(t, err)
	if len(first.Items) != 100 || first.NextCursor == nil {
		t.Fatal("unbounded search")
	}
	second, err := r.s.Tags(ctx, r.reviewer, *first.NextCursor, "translated")
	must(t, err)
	if len(second.Items) != 2 || second.NextCursor != nil || second.Items[0].ID <= first.Items[99].ID {
		t.Fatal("unstable keyset search")
	}
	for _, search := range []string{"标签 101", "tag-101", "TRANSLATED 101"} {
		page, err := r.s.Tags(ctx, r.editor, 0, search)
		must(t, err)
		if len(page.Items) != 1 || page.Items[0].ID != second.Items[1].ID {
			t.Fatal("missing bilingual search match")
		}
	}
	_, err = r.s.Tags(ctx, r.admin, 0, strings.Repeat("x", 101))
	wantError(t, err, fault.Validation)
	tag := first.Items[0]
	originalID := tag.ID
	tag.NameEn = ""
	tag.DescriptionEn = "orphan"
	_, err = r.s.PutTag(ctx, r.admin, tag.ID, tag.TagInput)
	wantError(t, err, fault.Validation)
	tag.DescriptionEn = ""
	tag.Slug = "changed"
	_, err = r.s.PutTag(ctx, r.admin, tag.ID, tag.TagInput)
	wantError(t, err, fault.TaxonomySlug)
	tag.Slug = first.Items[0].Slug
	tag, err = r.s.PutTag(ctx, r.admin, tag.ID, tag.TagInput)
	must(t, err)
	if tag.ID != originalID || tag.NameEn != "" || tag.DescriptionEn != "" {
		t.Fatal("translation removal changed identity or lacked fallback")
	}
	if r.count(t, "publication_jobs") != 0 {
		t.Fatal("unused tags published")
	}
}
