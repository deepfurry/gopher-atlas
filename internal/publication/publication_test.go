package publication

import (
	"bytes"
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"image"
	"image/color"
	"image/png"
	"sync"
	"testing"

	"github.com/deepfurry/gopher-atlas/internal/assets"
	"github.com/deepfurry/gopher-atlas/internal/auth"
	"github.com/deepfurry/gopher-atlas/internal/config"
	"github.com/deepfurry/gopher-atlas/internal/content"
	dbsqlc "github.com/deepfurry/gopher-atlas/internal/database/sqlc"
	"github.com/deepfurry/gopher-atlas/internal/fault"
	"github.com/deepfurry/gopher-atlas/internal/testkit"
	"github.com/deepfurry/gopher-atlas/internal/testkit/identity"
	"go.uber.org/zap"
)

var ctx = context.Background()

type rig struct {
	db                      *sql.DB
	q                       *dbsqlc.Queries
	auth                    *auth.Service
	content                 *content.Service
	assets                  *assets.Service
	worker                  *Service
	store                   *testkit.MemoryStore
	admin, editor, reviewer auth.Principal
}

func must(t testing.TB, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}
func newRig(t *testing.T) *rig {
	db := testkit.Database(t)
	a := auth.New(db, config.Config{}, nil)
	store := testkit.NewMemoryStore()
	r := &rig{db: db, q: dbsqlc.New(db), auth: a, content: content.New(db, a.PublicationFence()), assets: assets.New(db, store, "assets"), store: store}
	r.admin = identity.Principal(t, db, 1, "admin")
	r.editor = identity.Principal(t, db, 2, "editor")
	r.reviewer = identity.Principal(t, db, 3, "reviewer")
	r.worker = New(db, config.Publication{Endpoint: "https://r2.invalid", ContentBucket: "content", HookURL: "https://hook.invalid", PublicSiteURL: "https://site.invalid"}, store, a.PublicationFence(), zap.NewNop())
	r.worker.hook = func(context.Context) error { return nil }
	r.worker.marker = func(context.Context) (*Marker, error) { return nil, fault.SnapshotInvalid }
	return r
}
func (r *rig) draft(t *testing.T, kind, slug string) content.Detail {
	d, err := r.content.Create(ctx, r.admin, kind)
	must(t, err)
	in := d.Draft.DraftInput
	in.Title = "Public " + slug
	in.Slug = slug
	in.Language = "en"
	in.BodyMarkdown = "## Public body"
	in.BylineUserID = r.editor.User.ID
	if kind == "note" {
		in.Payload = json.RawMessage(`{"group":"Public group","groupSlug":"public","order":1}`)
	}
	if kind == "curated_article" {
		in.Payload = json.RawMessage(`{"sourceUrl":"https://example.com/source"}`)
	}
	_, err = r.content.Save(ctx, r.admin, d.ID, in)
	must(t, err)
	d, err = r.content.Get(ctx, r.admin, d.ID)
	must(t, err)
	return d
}
func (r *rig) publish(t *testing.T, d content.Detail) content.Detail {
	d, err := r.content.PublishDirect(ctx, r.admin, d.ID, d.Draft.Version)
	must(t, err)
	return d
}
func (r *rig) generation(t *testing.T) int64 {
	s, err := r.q.GetSiteState(ctx)
	must(t, err)
	return s.PublicationGeneration
}
func (r *rig) count(t *testing.T, table string) int {
	var n int
	must(t, r.db.QueryRow("SELECT count(*) FROM "+table).Scan(&n))
	return n
}
func (r *rig) image(t *testing.T, shade uint8) assets.Asset {
	var b bytes.Buffer
	i := image.NewRGBA(image.Rect(0, 0, 1, 1))
	i.Set(0, 0, color.RGBA{R: shade, A: 255})
	must(t, png.Encode(&b, i))
	a, err := r.assets.Upload(ctx, r.admin, b.Bytes())
	must(t, err)
	return a
}

func TestGenerationAtomicRollbackAndPublicImpact(t *testing.T) {
	r := newRig(t)
	d := r.draft(t, "post", "atomic")
	tag, err := r.content.PutTag(ctx, r.admin, 0, content.TagInput{Name: "Public", Slug: "public"})
	must(t, err)
	in := d.Draft.DraftInput
	in.TagIDs = []int64{tag.ID}
	_, err = r.content.Save(ctx, r.admin, d.ID, in)
	must(t, err)
	d, err = r.content.Get(ctx, r.admin, d.ID)
	must(t, err)
	profile := auth.ProfileInput{DisplayName: "Author updated"}
	_, err = r.auth.UpdateAuthorProfile(ctx, r.admin, r.editor.User.ID, profile)
	must(t, err)
	if r.generation(t) != 0 {
		t.Fatal("unpublished changes advanced generation")
	}
	before := r.count(t, "audit_events")
	_, err = r.db.Exec("CREATE TRIGGER reject_job BEFORE INSERT ON publication_jobs BEGIN SELECT RAISE(ABORT,'forced'); END;")
	must(t, err)
	_, err = r.content.PublishDirect(ctx, r.admin, d.ID, d.Draft.Version)
	if !errors.Is(err, fault.Unavailable) {
		t.Fatal("forced job insert did not fail")
	}
	got, err := r.content.Get(ctx, r.admin, d.ID)
	must(t, err)
	if got.PublishedRevisionID != nil || r.generation(t) != 0 || r.count(t, "content_routes") != 0 || r.count(t, "content_revisions") != 0 || r.count(t, "audit_events") != before || r.count(t, "publication_jobs") != 0 {
		t.Fatal("outbox failure partially committed publish")
	}
	_, err = r.db.Exec("DROP TRIGGER reject_job")
	must(t, err)
	d = r.publish(t, d)
	if r.generation(t) != 1 || r.count(t, "publication_jobs") != 1 {
		t.Fatal("publish job missing")
	}
	_, err = r.auth.UpdateAuthorProfile(ctx, r.admin, r.editor.User.ID, profile)
	must(t, err)
	_, err = r.content.PutTag(ctx, r.admin, tag.ID, content.TagInput{Name: "Updated", Slug: tag.Slug})
	must(t, err)
	if r.generation(t) != 3 {
		t.Fatal("public Author/Tag did not queue")
	}
	_, err = r.auth.UpdateAuthorProfile(ctx, r.admin, r.reviewer.User.ID, profile)
	must(t, err)
	unused, err := r.content.PutTag(ctx, r.admin, 0, content.TagInput{Name: "Unused", Slug: "unused"})
	must(t, err)
	_, err = r.content.PutTag(ctx, r.admin, unused.ID, content.TagInput{Name: "Unused changed", Slug: unused.Slug})
	must(t, err)
	if r.generation(t) != 3 {
		t.Fatal("unpublished Author/Tag queued")
	}
	before = r.count(t, "audit_events")
	_, err = r.db.Exec("CREATE TRIGGER reject_job BEFORE INSERT ON publication_jobs BEGIN SELECT RAISE(ABORT,'forced'); END;")
	must(t, err)
	_, err = r.content.Unpublish(ctx, r.admin, d.ID)
	if !errors.Is(err, fault.Unavailable) {
		t.Fatal("unpublish failure")
	}
	_, err = r.auth.UpdateAuthorProfile(ctx, r.admin, r.editor.User.ID, auth.ProfileInput{DisplayName: "Should roll back"})
	if !errors.Is(err, fault.Unavailable) {
		t.Fatal("profile failure")
	}
	_, err = r.content.PutTag(ctx, r.admin, tag.ID, content.TagInput{Name: "Should roll back", Slug: tag.Slug})
	if !errors.Is(err, fault.Unavailable) {
		t.Fatal("tag failure")
	}
	got, err = r.content.Get(ctx, r.admin, d.ID)
	must(t, err)
	if got.PublishedRevisionID == nil || r.generation(t) != 3 || r.count(t, "audit_events") != before {
		t.Fatal("public mutation rollback")
	}
	author, err := r.q.GetProfile(ctx, r.editor.User.ID)
	must(t, err)
	if author.DisplayName != profile.DisplayName {
		t.Fatal("profile leaked failed mutation")
	}
	_, err = r.db.Exec("DROP TRIGGER reject_job")
	must(t, err)
	_, err = r.content.Archive(ctx, r.admin, d.ID)
	must(t, err)
	if r.generation(t) != 4 {
		t.Fatal("published archive did not queue")
	}
	d, err = r.content.RestoreArchive(ctx, r.admin, d.ID)
	must(t, err)
	_, err = r.content.Archive(ctx, r.admin, d.ID)
	must(t, err)
	if r.generation(t) != 4 {
		t.Fatal("unpublished archive queued")
	}
}

func TestReviewedPublicationAndNonPublicActionsGeneration(t *testing.T) {
	r := newRig(t)
	d := r.draft(t, "post", "review-generation")
	d, err := r.content.Submit(ctx, r.admin, d.ID, d.Draft.Version)
	must(t, err)
	_, err = r.content.RequestChanges(ctx, r.reviewer, d.ID, *d.PendingRevisionID, "## Please revise")
	must(t, err)
	d, err = r.content.Get(ctx, r.admin, d.ID)
	must(t, err)
	d, err = r.content.Submit(ctx, r.admin, d.ID, d.Draft.Version)
	must(t, err)
	d, err = r.content.Withdraw(ctx, r.admin, d.ID)
	must(t, err)
	d, err = r.content.RestoreRevision(ctx, r.admin, d.ID, 1, d.Draft.Version)
	must(t, err)
	d, err = r.content.Submit(ctx, r.admin, d.ID, d.Draft.Version)
	must(t, err)
	if r.generation(t) != 0 || r.count(t, "publication_jobs") != 0 {
		t.Fatal("nonpublic editorial action queued build")
	}
	before := r.count(t, "audit_events")
	reviews := r.count(t, "content_reviews")
	pending := *d.PendingRevisionID
	_, err = r.db.Exec("CREATE TRIGGER reject_review_job BEFORE INSERT ON publication_jobs BEGIN SELECT RAISE(ABORT,'forced'); END")
	must(t, err)
	_, err = r.content.PublishReviewed(ctx, r.reviewer, d.ID, pending, "")
	if !errors.Is(err, fault.Unavailable) {
		t.Fatal("review job failure")
	}
	d, err = r.content.Get(ctx, r.admin, d.ID)
	must(t, err)
	if d.PublishedRevisionID != nil || d.PendingRevisionID == nil || *d.PendingRevisionID != pending || r.count(t, "content_reviews") != reviews || r.count(t, "audit_events") != before || r.count(t, "content_routes") != 0 || r.generation(t) != 0 {
		t.Fatal("reviewed publication partial rollback")
	}
	_, err = r.db.Exec("DROP TRIGGER reject_review_job")
	must(t, err)
	_, err = r.content.PublishReviewed(ctx, r.reviewer, d.ID, pending, "")
	must(t, err)
	if r.generation(t) != 1 {
		t.Fatal("reviewed generation")
	}
	_, err = r.auth.ChangeUser(ctx, r.admin, r.editor.User.ID, "disable", "")
	must(t, err)
	_, err = r.auth.ChangeUser(ctx, r.admin, r.editor.User.ID, "enable", "")
	must(t, err)
	if r.generation(t) != 1 {
		t.Fatal("identity access changed public generation")
	}
	_, err = r.content.Unpublish(ctx, r.admin, d.ID)
	must(t, err)
	if r.generation(t) != 2 || r.count(t, "publication_jobs") != 2 {
		t.Fatal("unpublish generation")
	}
}

func TestCoverSnapshotPrivacyAndPublishedIsolation(t *testing.T) {
	r := newRig(t)
	a, b := r.image(t, 10), r.image(t, 20)
	tag, err := r.content.PutTag(ctx, r.admin, 0, content.TagInput{Name: "Public tag", Slug: "public-tag"})
	must(t, err)
	d := r.draft(t, "note", "isolation")
	in := d.Draft.DraftInput
	in.CoverAssetID = &a.ID
	in.TagIDs = []int64{tag.ID}
	_, err = r.content.Save(ctx, r.admin, d.ID, in)
	must(t, err)
	d, err = r.content.Get(ctx, r.admin, d.ID)
	must(t, err)
	d = r.publish(t, d)
	private := rand.Text()
	in = d.Draft.DraftInput
	in.Title = private
	in.BodyMarkdown = "## " + private
	in.CoverAssetID = &b.ID
	in.TagIDs = []int64{}
	in.Payload = json.RawMessage(`{"group":"` + private + `","groupSlug":"private","order":9}`)
	_, err = r.content.Save(ctx, r.admin, d.ID, in)
	must(t, err)
	_, err = r.db.Exec("UPDATE users SET github_login=? WHERE id=?", private, r.editor.User.ID)
	must(t, err)
	_, err = r.db.Exec("INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id,request_id,created_at) VALUES(1,'test','content',1,?,1)", private)
	must(t, err)
	_, err = r.db.Exec("INSERT INTO content_reviews(content_id,revision_id,reviewer_user_id,decision,comment_markdown,created_at) VALUES(?,?,?,'approved',?,1)", d.ID, *d.PublishedRevisionID, r.reviewer.User.ID, private)
	must(t, err)
	exported, err := (&Exporter{DB: r.db}).Export(ctx, 1)
	must(t, err)
	if bytes.Contains(exported.Bytes, []byte(private)) {
		t.Fatal("private data exported")
	}
	for _, field := range []string{`"role"`, `"status"`, `"githubLogin"`, `"session"`, `"review"`, `"draft"`, `"requestId"`, `"deletedAt"`} {
		if bytes.Contains(exported.Bytes, []byte(field)) {
			t.Fatal("private field exported", field)
		}
	}
	item := exported.Snapshot.Content[0]
	if item.Title != d.Draft.Title || *item.CoverAssetID != a.ID || len(item.TagIDs) != 1 || len(exported.Snapshot.Assets) != 1 || exported.Snapshot.Assets[0].ID != a.ID || len(exported.Snapshot.Authors) != 1 {
		t.Fatal("published fields/relations not isolated")
	}
	again, err := (&Exporter{DB: r.db}).Export(ctx, 1)
	must(t, err)
	if !bytes.Equal(exported.Bytes, again.Bytes) {
		t.Fatal("restart encoding not deterministic")
	}
	if _, err = (&Exporter{DB: r.db, MaxBytes: 100}).Export(ctx, 1); !errors.Is(err, fault.SnapshotInvalid) {
		t.Fatal("snapshot size limit")
	}
	_, err = r.assets.SetDeleted(ctx, r.admin, a.ID, true)
	must(t, err)
	current, err := r.content.Get(ctx, r.admin, d.ID)
	must(t, err)
	in = current.Draft.DraftInput
	in.CoverAssetID = &a.ID
	_, err = r.content.Save(ctx, r.admin, d.ID, in)
	if !errors.Is(err, fault.AssetDeleted) {
		t.Fatal("selected deleted cover")
	}
	in.CoverAssetID = new(int64)
	*in.CoverAssetID = 999
	_, err = r.content.Save(ctx, r.admin, d.ID, in)
	if !errors.Is(err, fault.AssetInvalid) {
		t.Fatal("selected missing cover")
	}
	restored, err := r.content.RestoreRevision(ctx, r.admin, d.ID, 1, current.Draft.Version)
	must(t, err)
	if *restored.Draft.CoverAssetID != a.ID {
		t.Fatal("historical cover restore")
	}
	again, err = (&Exporter{DB: r.db}).Export(ctx, 1)
	must(t, err)
	if !bytes.Equal(exported.Bytes, again.Bytes) {
		t.Fatal("soft delete changed published projection")
	}
	_, err = r.content.Unpublish(ctx, r.admin, d.ID)
	must(t, err)
	empty, err := (&Exporter{DB: r.db}).Export(ctx, 2)
	must(t, err)
	if len(empty.Snapshot.Content) != 0 || len(empty.Snapshot.Routes) != 0 || len(empty.Snapshot.Assets) != 0 || len(empty.Snapshot.Tags) != 0 || len(empty.Snapshot.Authors) != 0 || r.count(t, "content_routes") != 1 {
		t.Fatal("unpublish snapshot/reservation")
	}
}

func TestSnapshotGraphAndExportGenerationChange(t *testing.T) {
	r := newRig(t)
	a := r.publish(t, r.draft(t, "post", "a"))
	b := r.publish(t, r.draft(t, "curated_article", "b"))
	topic := r.draft(t, "topic", "ordered")
	in := topic.Draft.DraftInput
	in.TopicEntries = []content.TopicEntry{{TargetContentID: b.ID}, {TargetContentID: a.ID}}
	_, err := r.content.Save(ctx, r.admin, topic.ID, in)
	must(t, err)
	topic, err = r.content.Get(ctx, r.admin, topic.ID)
	must(t, err)
	topic = r.publish(t, topic)
	snapshot, err := (&Exporter{DB: r.db}).Export(ctx, 3)
	must(t, err)
	if entries := snapshot.Snapshot.Content[2].TopicEntries; entries[0].TargetContentID != b.ID || entries[1].Position != 2 {
		t.Fatal("Topic order")
	}
	_, err = r.content.Unpublish(ctx, r.admin, b.ID)
	must(t, err)
	if _, err = (&Exporter{DB: r.db}).Export(ctx, 4); !errors.Is(err, fault.SnapshotInvalid) {
		t.Fatal("broken Topic graph exported")
	}
	_, err = r.content.Unpublish(ctx, r.admin, topic.ID)
	must(t, err)
	exporter := &Exporter{DB: r.db, afterReadStarted: func() {
		_, err := r.auth.UpdateAuthorProfile(ctx, r.admin, r.editor.User.ID, auth.ProfileInput{DisplayName: "Next public author"})
		must(t, err)
	}}
	if _, err = exporter.Export(ctx, 5); !errors.Is(err, fault.SnapshotStale) {
		t.Fatal("changed generation exported")
	}
	if r.generation(t) != 6 {
		t.Fatal("generation did not advance during export")
	}
	_, err = r.db.Exec("DROP INDEX content_canonical")
	must(t, err)
	_, err = r.db.Exec("INSERT INTO content_routes(content_id,path,kind,created_at) VALUES(?,'/posts/duplicate/','canonical',1)", a.ID)
	must(t, err)
	if _, err = (&Exporter{DB: r.db}).Export(ctx, 6); !errors.Is(err, fault.SnapshotInvalid) {
		t.Fatal("invalid route graph exported")
	}
}

func TestConcurrentPublicMutationsAreMonotonic(t *testing.T) {
	r := newRig(t)
	drafts := []content.Detail{}
	for _, slug := range []string{"a", "b", "c", "d"} {
		drafts = append(drafts, r.draft(t, "post", slug))
	}
	var wg sync.WaitGroup
	fail := make(chan error, len(drafts))
	for _, d := range drafts {
		wg.Go(func() { _, err := r.content.PublishDirect(ctx, r.admin, d.ID, d.Draft.Version); fail <- err })
	}
	wg.Wait()
	close(fail)
	for err := range fail {
		must(t, err)
	}
	if r.generation(t) != 4 || r.count(t, "publication_jobs") != 4 {
		t.Fatal("nonmonotonic generations")
	}
	jobs, err := r.q.ListPublicationJobs(ctx, dbsqlc.ListPublicationJobsParams{PageSize: 100})
	must(t, err)
	for i, j := range jobs {
		if j.Generation != int64(i+1) {
			t.Fatal("duplicate/missing generation")
		}
	}
}
