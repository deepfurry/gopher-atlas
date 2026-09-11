package content

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/deepfurry/gopher-atlas/internal/auth"
	"github.com/deepfurry/gopher-atlas/internal/config"
	dbsqlc "github.com/deepfurry/gopher-atlas/internal/database/sqlc"
	"github.com/deepfurry/gopher-atlas/internal/fault"
	"github.com/deepfurry/gopher-atlas/internal/testkit"
)

var ctx = context.Background()

type rig struct {
	db                             *sql.DB
	q                              *dbsqlc.Queries
	s                              *Service
	auth                           *auth.Service
	admin, editor, reviewer, other auth.Principal
}

func must(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}
func wantError(t *testing.T, err, want error) {
	t.Helper()
	if !errors.Is(err, want) {
		t.Fatalf("got %v, want %v", err, want)
	}
}
func newRig(t *testing.T) *rig {
	t.Helper()
	db := testkit.Database(t)
	r := &rig{db: db, q: dbsqlc.New(db), s: New(db), auth: auth.New(db, config.Config{}, nil)}
	r.admin = r.user(t, 1, "admin", "active")
	r.editor = r.user(t, 2, "editor", "active")
	r.reviewer = r.user(t, 3, "reviewer", "active")
	r.other = r.user(t, 4, "editor", "active")
	return r
}
func (r *rig) user(t *testing.T, id int64, role, status string) auth.Principal {
	t.Helper()
	now := time.Now().UnixMilli()
	u, err := r.q.CreateUser(ctx, dbsqlc.CreateUserParams{GithubUserID: id, GithubLogin: fmt.Sprint("test-", id), Role: role, Status: status, CreatedAt: now, UpdatedAt: now})
	must(t, err)
	must(t, r.q.CreateProfile(ctx, dbsqlc.CreateProfileParams{UserID: u.ID, Slug: fmt.Sprint("test-", id), DisplayName: "Test", CreatedAt: now, UpdatedAt: now}))
	token, err := auth.RandomToken()
	must(t, err)
	csrf, err := auth.RandomToken()
	must(t, err)
	sess, err := r.q.CreateSession(ctx, dbsqlc.CreateSessionParams{UserID: u.ID, TokenHash: auth.Hash(token), CsrfTokenHash: auth.Hash(csrf), CreatedAt: now, ExpiresAt: now + 3600000, LastSeenAt: now})
	must(t, err)
	return auth.Principal{User: u, Session: sess}
}
func (r *rig) create(t *testing.T, p auth.Principal, kind string) Detail {
	t.Helper()
	d, err := r.s.Create(ctx, p, kind)
	must(t, err)
	return d
}
func input(d Detail, slug string) DraftInput {
	in := d.Draft.DraftInput
	in.Title = "Title " + slug
	in.Slug = slug
	in.Language = "en"
	in.BodyMarkdown = "## Body\nOriginal **text**."
	return in
}
func (r *rig) prepared(t *testing.T, p auth.Principal, kind, slug string) Detail {
	t.Helper()
	d := r.create(t, p, kind)
	in := input(d, slug)
	switch kind {
	case "note":
		in.Payload = json.RawMessage(`{"group":"Runtime","groupSlug":"runtime","order":10}`)
	case "curated_article":
		in.Payload = json.RawMessage(`{"sourceUrl":"https://example.com/source"}`)
	}
	_, err := r.s.Save(ctx, p, d.ID, in)
	must(t, err)
	d, err = r.s.Get(ctx, p, d.ID)
	must(t, err)
	return d
}
func (r *rig) tag(t *testing.T, name string) Tag {
	t.Helper()
	tag, err := r.s.PutTag(ctx, r.admin, 0, TagInput{name, name, ""})
	must(t, err)
	return tag
}
func (r *rig) count(t *testing.T, table string) int {
	t.Helper()
	var n int
	must(t, r.db.QueryRow("SELECT count(*) FROM "+table).Scan(&n))
	return n
}

func TestDraftRevisionReviewAndPublishedIsolation(t *testing.T) {
	r := newRig(t)
	a, b := r.tag(t, "go"), r.tag(t, "testing")
	d := r.prepared(t, r.editor, "post", "isolation")
	in := d.Draft.DraftInput
	in.TagIDs = []int64{a.ID}
	saved, err := r.s.Save(ctx, r.editor, d.ID, in)
	must(t, err)
	d, err = r.s.Submit(ctx, r.editor, d.ID, saved.Version)
	must(t, err)
	v1 := d.PendingRevision
	if v1 == nil || v1.RevisionNo != 1 {
		t.Fatal("first immutable submission missing")
	}
	_, err = r.s.Save(ctx, r.editor, d.ID, saved.DraftInput)
	wantError(t, err, fault.EditorialState)
	reviewView, err := r.s.Get(ctx, r.reviewer, d.ID)
	must(t, err)
	if reviewView.Draft != nil || reviewView.PendingRevision.ID != v1.ID {
		t.Fatal("reviewer saw mutable draft")
	}
	_, err = r.s.Get(ctx, r.other, d.ID)
	wantError(t, err, fault.Permission)
	_, err = r.s.PublishDirect(ctx, r.reviewer, d.ID, saved.Version)
	wantError(t, err, fault.Permission)
	_, err = r.s.RequestChanges(ctx, r.reviewer, d.ID, v1.ID, "## Changes\nPlease clarify.")
	must(t, err)
	d, err = r.s.Get(ctx, r.editor, d.ID)
	must(t, err)
	if d.EditorialState != "changes_requested" || d.PendingRevision != nil {
		t.Fatal("changes did not reopen draft")
	}
	in = d.Draft.DraftInput
	in.Title = "Revised title"
	in.BodyMarkdown = "## Revised"
	in.TagIDs = []int64{b.ID}
	saved, err = r.s.Save(ctx, r.editor, d.ID, in)
	must(t, err)
	d, err = r.s.Submit(ctx, r.editor, d.ID, saved.Version)
	must(t, err)
	v2 := d.PendingRevision
	if v2.RevisionNo != 2 || v2.ID == v1.ID {
		t.Fatal("resubmission reused revision")
	}
	_, err = r.s.PublishReviewed(ctx, r.reviewer, d.ID, v1.ID, "")
	wantError(t, err, fault.ReviewRevision)
	_, err = r.s.PublishReviewed(ctx, r.reviewer, d.ID, v2.ID, "")
	must(t, err)
	d, err = r.s.Get(ctx, r.editor, d.ID)
	must(t, err)
	if d.PublishedRevisionID == nil || *d.PublishedRevisionID != v2.ID || d.EditorialState != "synced" {
		t.Fatal("published wrong revision")
	}
	old, err := r.s.Revision(ctx, r.editor, d.ID, 1)
	must(t, err)
	if old.Title != v1.Title || old.BodyMarkdown != v1.BodyMarkdown || !reflect.DeepEqual(old.TagIDs, []int64{a.ID}) || old.Review.Decision != "changes_requested" {
		t.Fatal("old snapshot changed")
	}
	in = d.Draft.DraftInput
	in.Title = "Next draft"
	in.TagIDs = []int64{}
	saved, err = r.s.Save(ctx, r.editor, d.ID, in)
	must(t, err)
	d, err = r.s.Get(ctx, r.editor, d.ID)
	must(t, err)
	if d.EditorialState != "draft" || *d.PublishedRevisionID != v2.ID {
		t.Fatal("draft edit changed publication")
	}
	d, err = r.s.RestoreRevision(ctx, r.editor, d.ID, 1, saved.Version)
	must(t, err)
	if d.Draft.Version != saved.Version+1 || d.Draft.Title != v1.Title || *d.PublishedRevisionID != v2.ID || !reflect.DeepEqual(d.Draft.TagIDs, v1.TagIDs) {
		t.Fatal("restore changed wrong state")
	}
	_, err = r.s.RestoreRevision(ctx, r.editor, d.ID, 1, saved.Version)
	wantError(t, err, fault.ContentVersion)
	again, err := r.s.Revision(ctx, r.editor, d.ID, 1)
	must(t, err)
	if !reflect.DeepEqual(old, again) {
		t.Fatal("restore mutated history")
	}
	for _, query := range []string{
		"UPDATE content_revisions SET title='changed'",
		"DELETE FROM content_revisions",
		"DELETE FROM revision_tags",
		"UPDATE content_reviews SET decision='approved'",
		"UPDATE content_items SET type='note'",
	} {
		if _, err := r.db.Exec(query); err == nil {
			t.Fatal("immutable SQL accepted:", query)
		}
	}
	page, err := r.s.Revisions(ctx, r.editor, d.ID, 1)
	must(t, err)
	if len(page.Items) != 1 || page.Items[0].ID != v2.ID || !page.Items[0].Published {
		t.Fatal("revision cursor/flags incorrect")
	}
}

func TestSelfReviewOwnerBylineAdminBypassAndWithdraw(t *testing.T) {
	r := newRig(t)
	d := r.prepared(t, r.reviewer, "post", "reviewer-owned")
	d, err := r.s.Submit(ctx, r.reviewer, d.ID, d.Draft.Version)
	must(t, err)
	rid := d.PendingRevision.ID
	_, err = r.s.RequestChanges(ctx, r.reviewer, d.ID, rid, "Please revise")
	wantError(t, err, fault.SelfReview)
	_, err = r.s.PublishReviewed(ctx, r.reviewer, d.ID, rid, "")
	wantError(t, err, fault.SelfReview)
	queue, err := r.s.PendingReviews(ctx, r.reviewer, 0)
	must(t, err)
	if len(queue.Items) != 0 {
		t.Fatal("self-owned review in queue")
	}
	_, err = r.s.PublishReviewed(ctx, r.admin, d.ID, rid, "")
	must(t, err)
	byline := r.prepared(t, r.editor, "post", "reviewer-byline")
	in := byline.Draft.DraftInput
	in.BylineUserID = r.reviewer.User.ID
	_, err = r.s.Save(ctx, r.editor, byline.ID, in)
	wantError(t, err, fault.Permission)
	saved, err := r.s.Save(ctx, r.admin, byline.ID, in)
	must(t, err)
	byline, err = r.s.Submit(ctx, r.editor, byline.ID, saved.Version)
	must(t, err)
	_, err = r.s.RequestChanges(ctx, r.reviewer, byline.ID, byline.PendingRevision.ID, "Please revise")
	wantError(t, err, fault.SelfReview)
	_, err = r.s.PublishReviewed(ctx, r.reviewer, byline.ID, byline.PendingRevision.ID, "")
	wantError(t, err, fault.SelfReview)
	queue, err = r.s.PendingReviews(ctx, r.reviewer, 0)
	must(t, err)
	if len(queue.Items) != 0 {
		t.Fatal("self-byline review in queue")
	}
	n := r.count(t, "content_revisions")
	_, err = r.s.Withdraw(ctx, r.other, byline.ID)
	wantError(t, err, fault.Permission)
	_, err = r.s.Withdraw(ctx, r.editor, byline.ID)
	must(t, err)
	if r.count(t, "content_revisions") != n {
		t.Fatal("withdraw deleted history")
	}
	_, err = r.s.Withdraw(ctx, r.editor, byline.ID)
	wantError(t, err, fault.EditorialState)
	in = byline.Draft.DraftInput
	in.Featured = true
	_, err = r.s.Save(ctx, r.editor, byline.ID, in)
	wantError(t, err, fault.Permission)
	// Stale principal cannot write after role/status/session changes.
	_, err = r.auth.ChangeUser(ctx, r.admin, r.editor.User.ID, "disable", "")
	must(t, err)
	_, err = r.s.Create(ctx, r.editor, "post")
	wantError(t, err, fault.Authentication)
}

func TestRoutesArePermanentIdentityReservations(t *testing.T) {
	r := newRig(t)
	d := r.prepared(t, r.admin, "post", "first")
	d, err := r.s.PublishDirect(ctx, r.admin, d.ID, d.Draft.Version)
	must(t, err)
	if r.count(t, "content_reviews") != 0 || len(d.Routes) != 1 || d.Routes[0] != (Route{"/posts/first/", "canonical"}) {
		t.Fatal("direct publish created approval or missed route")
	}
	for _, slug := range []string{"second", "third", "first"} {
		in := d.Draft.DraftInput
		in.Slug = slug
		saved, err := r.s.Save(ctx, r.admin, d.ID, in)
		must(t, err)
		d, err = r.s.PublishDirect(ctx, r.admin, d.ID, saved.Version)
		must(t, err)
	}
	routes, err := r.q.ContentRoutes(ctx, dbsqlc.ContentRoutesParams{ContentID: d.ID, PageSize: PageSize})
	must(t, err)
	if len(routes) != 3 {
		t.Fatal("route history lost")
	}
	for _, route := range routes {
		resolved, err := r.q.ResolveRoute(ctx, route.Path)
		must(t, err)
		if resolved.CanonicalPath != "/posts/first/" || resolved.ContentID != d.ID {
			t.Fatal("redirect chain/wrong identity")
		}
	}
	other := r.prepared(t, r.admin, "post", "second")
	n := r.count(t, "content_revisions")
	a := r.count(t, "audit_events")
	_, err = r.s.Submit(ctx, r.admin, other.ID, other.Draft.Version)
	wantError(t, err, fault.RouteConflict)
	if r.count(t, "content_revisions") != n || r.count(t, "audit_events") != a {
		t.Fatal("failed submit partially committed")
	}
	d, err = r.s.Unpublish(ctx, r.admin, d.ID)
	must(t, err)
	_, err = r.s.PublishDirect(ctx, r.admin, other.ID, other.Draft.Version)
	wantError(t, err, fault.RouteConflict)
	_, err = r.s.Archive(ctx, r.admin, d.ID)
	must(t, err)
	_, err = r.s.PublishDirect(ctx, r.admin, other.ID, other.Draft.Version)
	wantError(t, err, fault.RouteConflict)
	d, err = r.s.RestoreArchive(ctx, r.admin, d.ID)
	must(t, err)
	if d.PublishedRevisionID != nil || d.EditorialState != "draft" || len(d.Routes) != 3 {
		t.Fatal("archive restore republished or lost routes")
	}
	for _, query := range []string{"DELETE FROM content_routes", "UPDATE content_routes SET content_id=2", "UPDATE content_routes SET path='/stolen/'"} {
		if _, err := r.db.Exec(query); err == nil {
			t.Fatal("route ownership mutable")
		}
	}
	note := r.prepared(t, r.admin, "note", "scheduler")
	note, err = r.s.PublishDirect(ctx, r.admin, note.ID, note.Draft.Version)
	must(t, err)
	in := note.Draft.DraftInput
	in.Payload = json.RawMessage(`{"group":"Advanced","groupSlug":"advanced","order":2}`)
	saved, err := r.s.Save(ctx, r.admin, note.ID, in)
	must(t, err)
	note, err = r.s.PublishDirect(ctx, r.admin, note.ID, saved.Version)
	must(t, err)
	if !reflect.DeepEqual(note.Routes, []Route{{"/notes/runtime/scheduler/", "redirect"}, {"/notes/advanced/scheduler/", "canonical"}}) {
		t.Fatal("note lost old full path")
	}
	// A route that was free at submission must be authoritatively rechecked.
	first := r.prepared(t, r.editor, "post", "late-claim")
	first, err = r.s.Submit(ctx, r.editor, first.ID, first.Draft.Version)
	must(t, err)
	second := r.prepared(t, r.admin, "post", "late-claim")
	_, err = r.s.PublishDirect(ctx, r.admin, second.ID, second.Draft.Version)
	must(t, err)
	_, err = r.s.PublishReviewed(ctx, r.reviewer, first.ID, first.PendingRevision.ID, "")
	wantError(t, err, fault.RouteConflict)
	unchanged, err := r.s.Get(ctx, r.editor, first.ID)
	must(t, err)
	if unchanged.EditorialState != "in_review" || unchanged.PublishedRevisionID != nil {
		t.Fatal("failed approval changed state")
	}
}

func TestTopicSnapshotsAndPublicationTargets(t *testing.T) {
	r := newRig(t)
	for _, p := range []auth.Principal{r.editor, r.reviewer} {
		_, err := r.s.Create(ctx, p, "topic")
		wantError(t, err, fault.Permission)
	}
	a := r.prepared(t, r.admin, "post", "target-a")
	b := r.prepared(t, r.admin, "post", "target-b")
	topic := r.prepared(t, r.admin, "topic", "learning")
	for _, entries := range [][]TopicEntry{{{topic.ID}}, {{a.ID}, {a.ID}}} {
		in := topic.Draft.DraftInput
		in.TopicEntries = entries
		_, err := r.s.Save(ctx, r.admin, topic.ID, in)
		wantError(t, err, fault.Validation)
	}
	in := topic.Draft.DraftInput
	in.TopicEntries = []TopicEntry{{b.ID}, {a.ID}}
	saved, err := r.s.Save(ctx, r.admin, topic.ID, in)
	must(t, err)
	topic, err = r.s.Submit(ctx, r.admin, topic.ID, saved.Version)
	must(t, err)
	v1 := topic.PendingRevision
	if !reflect.DeepEqual(v1.TopicEntries, in.TopicEntries) {
		t.Fatal("topic snapshot reordered")
	}
	_, err = r.s.PublishReviewed(ctx, r.admin, topic.ID, v1.ID, "")
	wantError(t, err, fault.TopicTarget)
	_, err = r.s.PublishDirect(ctx, r.admin, a.ID, a.Draft.Version)
	must(t, err)
	_, err = r.s.PublishDirect(ctx, r.admin, b.ID, b.Draft.Version)
	must(t, err)
	_, err = r.s.Archive(ctx, r.admin, b.ID)
	must(t, err)
	_, err = r.s.PublishReviewed(ctx, r.admin, topic.ID, v1.ID, "")
	wantError(t, err, fault.TopicTarget)
	b, err = r.s.RestoreArchive(ctx, r.admin, b.ID)
	must(t, err)
	_, err = r.s.PublishDirect(ctx, r.admin, b.ID, b.Draft.Version)
	must(t, err)
	topic, err = r.s.PublishReviewed(ctx, r.admin, topic.ID, v1.ID, "")
	must(t, err)
	in = topic.Draft.DraftInput
	in.TopicEntries = []TopicEntry{{a.ID}, {b.ID}}
	saved, err = r.s.Save(ctx, r.admin, topic.ID, in)
	must(t, err)
	old, err := r.s.Revision(ctx, r.admin, topic.ID, 1)
	must(t, err)
	if !reflect.DeepEqual(old.TopicEntries, v1.TopicEntries) {
		t.Fatal("reorder altered historical topic")
	}
	topic, err = r.s.RestoreRevision(ctx, r.admin, topic.ID, 1, saved.Version)
	must(t, err)
	if !reflect.DeepEqual(topic.Draft.TopicEntries, v1.TopicEntries) {
		t.Fatal("topic restore missed relations")
	}
	tag := r.tag(t, "topic-tag")
	in = topic.Draft.DraftInput
	in.TagIDs = []int64{tag.ID}
	_, err = r.s.Save(ctx, r.admin, topic.ID, in)
	wantError(t, err, fault.Validation)
}

func TestAuditAtomicityPrivacyAndNoAutosave(t *testing.T) {
	r := newRig(t)
	d := r.prepared(t, r.admin, "post", "audit")
	before := r.count(t, "audit_events")
	in := d.Draft.DraftInput
	in.BodyMarkdown = "## Editorial text\nNot audit metadata"
	saved, err := r.s.Save(ctx, r.admin, d.ID, in)
	must(t, err)
	if r.count(t, "audit_events") != before {
		t.Fatal("autosave audited")
	}
	// Force the final audit insert to fail: revision, route and pointer roll back.
	_, err = r.db.Exec("CREATE TRIGGER fail_audit BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT,'test failure'); END;")
	must(t, err)
	_, err = r.s.PublishDirect(ctx, r.admin, d.ID, saved.Version)
	wantError(t, err, fault.Unavailable)
	if r.count(t, "content_revisions") != 0 || r.count(t, "content_routes") != 0 {
		t.Fatal("audit failure committed publication")
	}
	_, err = r.db.Exec("DROP TRIGGER fail_audit")
	must(t, err)
	d, err = r.s.PublishDirect(ctx, r.admin, d.ID, saved.Version)
	must(t, err)
	_, err = r.s.Unpublish(ctx, r.admin, d.ID)
	must(t, err)
	_, err = r.s.Archive(ctx, r.admin, d.ID)
	must(t, err)
	d, err = r.s.RestoreArchive(ctx, r.admin, d.ID)
	must(t, err)
	_, err = r.s.RestoreRevision(ctx, r.admin, d.ID, 1, d.Draft.Version)
	must(t, err)
	tag := r.tag(t, "audit-tag")
	_, err = r.s.PutTag(ctx, r.admin, tag.ID, TagInput{"New name", tag.Slug, ""})
	must(t, err)
	page, err := r.s.Audit(ctx, r.reviewer, 0)
	must(t, err)
	actions := map[string]bool{}
	for _, e := range page.Items {
		actions[e.Action] = true
		if string(e.Metadata) != "{}" {
			t.Fatal("editorial audit stored unexpected data")
		}
	}
	for _, action := range []string{"content.created", "content.published_direct", "content.unpublished", "content.archived", "content.archive_restored", "content.revision_restored", "tag.created", "tag.updated"} {
		if !actions[action] {
			t.Fatal("missing audit", action)
		}
	}
	encoded, err := json.Marshal(page)
	must(t, err)
	if strings.Contains(string(encoded), in.BodyMarkdown) || strings.Contains(string(encoded), "bodyMarkdown") || strings.Contains(string(encoded), "payload") {
		t.Fatal("audit body leak")
	}
	_, err = r.s.Audit(ctx, r.editor, 0)
	wantError(t, err, fault.Permission)
	for _, query := range []string{"DELETE FROM audit_events", "UPDATE audit_events SET action='changed'"} {
		if _, err := r.db.Exec(query); err == nil {
			t.Fatal("audit mutable")
		}
	}
}

func racePair(a, b func() error) [2]error {
	var result [2]error
	start := make(chan struct{})
	var wg sync.WaitGroup
	wg.Add(2)
	go func() { defer wg.Done(); <-start; result[0] = a() }()
	go func() { defer wg.Done(); <-start; result[1] = b() }()
	close(start)
	wg.Wait()
	return result
}
func oneWinner(t *testing.T, results [2]error, allowed ...error) {
	t.Helper()
	wins := 0
	for _, err := range results {
		if err == nil {
			wins++
			continue
		}
		ok := false
		for _, want := range allowed {
			if errors.Is(err, want) {
				ok = true
			}
		}
		if !ok {
			t.Fatalf("unstable race loser: %v", err)
		}
	}
	if wins != 1 {
		t.Fatalf("expected one winner, got %d", wins)
	}
}
