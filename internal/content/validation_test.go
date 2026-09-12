package content

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/deepfurry/gopher-atlas/internal/fault"
)

func TestPayloadAndMarkdownBoundary(t *testing.T) {
	for _, test := range []struct{ kind, body string }{
		{"post", `{"extra":1}`}, {"post", "null"}, {"post", "[]"}, {"post", "{} {}"},
		{"note", `{"order":null}`}, {"curated_article", `{"relatedLinks":null}`},
		{"note", `{"groupSlug":"Bad Slug"}`}, {"note", `{"order":-1}`}, {"topic", `{"order":1.5}`},
		{"curated_article", `{"sourceUrl":"javascript:alert(1)"}`},
		{"curated_article", `{"originalUrl":"https://user:password@example.com"}`},
		{"curated_article", `{"sourcePublishedAt":"2026-02-30"}`},
		{"curated_article", `{"relatedLinks":[{"label":"Code","url":"https://example.com","unknown":true}]}`},
		{"curated_article", `{"relatedLinks":[{"label":"","url":"https://example.com"}]}`},
	} {
		_, err := CanonicalPayload(test.kind, []byte(test.body), false)
		wantError(t, err, fault.Payload)
	}
	canonical, err := CanonicalPayload("note", []byte(`{ "order": 2, "groupSlug":"go", "group":"Go" }`), true)
	must(t, err)
	if string(canonical) != `{"group":"Go","groupSlug":"go","groupDescription":"","groupOrder":0,"order":2}` {
		t.Fatal("payload not canonical")
	}
	_, err = CanonicalPayload("note", []byte("{}"), true)
	wantError(t, err, fault.Payload)
	_, err = CanonicalPayload("curated_article", []byte("{}"), true)
	wantError(t, err, fault.Payload)
	base := Fields{Title: "Title", Slug: "go-runtime", Language: "zh-CN", BylineUserID: 1, Payload: json.RawMessage("{}")}
	for _, body := range []string{"# H1", "<script>alert(1)</script>", "---\ntitle: x\n---\nBody", "[link](javascript:alert)", "![alt](https://example.com/a.png)", string([]byte{0xff}), strings.Repeat("x", MarkdownLimit+1)} {
		f := base
		f.BodyMarkdown = body
		wantError(t, validateFields("post", &f, true), fault.Markdown)
	}
	for _, slug := range []string{"Upper", "bad_slug", "a--b", "-start", "trailing-", "a/b", "中文", strings.Repeat("a", 101)} {
		f := base
		f.Slug = slug
		wantError(t, validateFields("post", &f, true), fault.Validation)
	}
	f := base
	f.BodyMarkdown = "## Safe\n![Atlas](https://assets.gopheratlas.com/example.png)"
	must(t, validateFields("post", &f, true))
	wantError(t, validateComment("   ", true), fault.Markdown)
	wantError(t, validateComment(strings.Repeat("x", ReviewCommentLimit+1), false), fault.Markdown)
}

func TestTagNormalizationBoundedListsAndObjectVisibility(t *testing.T) {
	r := newRig(t)
	tag, err := r.s.PutTag(ctx, r.admin, 0, TagInput{"  Go\t Runtime  ", "go-runtime", ""})
	must(t, err)
	_, err = r.s.PutTag(ctx, r.admin, 0, TagInput{"go runtime", "different", ""})
	wantError(t, err, fault.TagConflict)
	tag, err = r.s.PutTag(ctx, r.admin, tag.ID, TagInput{"Changed name", tag.Slug, ""})
	must(t, err)
	if tag.Slug != "go-runtime" {
		t.Fatal("tag slug recomputed")
	}
	_, err = r.s.PutTag(ctx, r.editor, 0, TagInput{"Denied", "denied", ""})
	wantError(t, err, fault.Permission)
	for i := 0; i < 103; i++ {
		r.create(t, r.editor, "post")
	}
	page, err := r.s.List(ctx, r.editor, 0, false)
	must(t, err)
	if len(page.Items) != 100 || page.NextCursor == nil {
		t.Fatal("unbounded list")
	}
	next, err := r.s.List(ctx, r.editor, *page.NextCursor, false)
	must(t, err)
	if len(next.Items) != 3 || next.NextCursor != nil || next.Items[0].ID <= *page.NextCursor {
		t.Fatal("keyset cursor incorrect")
	}
	page, err = r.s.List(ctx, r.other, 0, false)
	must(t, err)
	if len(page.Items) != 0 {
		t.Fatal("editor read others")
	}
	page, err = r.s.List(ctx, r.reviewer, 0, false)
	must(t, err)
	if len(page.Items) != 0 {
		t.Fatal("reviewer read unsubmitted draft")
	}
	_, err = r.s.List(ctx, r.editor, 0, true)
	wantError(t, err, fault.Permission)
	d := r.prepared(t, r.editor, "post", "archived")
	_, err = r.s.Archive(ctx, r.admin, d.ID)
	must(t, err)
	_, err = r.s.Get(ctx, r.editor, d.ID)
	wantError(t, err, fault.Permission)
	_, err = r.s.Save(ctx, r.admin, d.ID, d.Draft.DraftInput)
	wantError(t, err, fault.ContentArchived)
	_, err = r.s.Create(ctx, r.user(t, 50, "editor", "pending"), "post")
	wantError(t, err, fault.Pending)
	// Demotion after the principal was resolved is observed inside the write lock.
	_, err = r.auth.ChangeUser(ctx, r.admin, r.reviewer.User.ID, "role", "editor")
	must(t, err)
	_, err = r.s.PendingReviews(ctx, r.reviewer, 0)
	wantError(t, err, fault.Permission)
}
