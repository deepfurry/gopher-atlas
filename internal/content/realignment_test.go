package content

import (
	"encoding/json"
	"testing"

	"github.com/deepfurry/gopher-atlas/internal/fault"
)

func TestProductPayloadBoundaries(t *testing.T) {
	for _, body := range []string{`{"groupOrder":-1}`, `{"groupOrder":1000001}`, `{"groupDescription":null}`} {
		_, err := CanonicalPayload("note", []byte(body), false)
		wantError(t, err, fault.Payload)
	}
	for _, body := range []string{`{"recommendedCount":-1}`, `{"recommendedCount":101}`, `{"recommendedCount":0.5}`} {
		_, err := CanonicalPayload("topic", []byte(body), false)
		wantError(t, err, fault.Payload)
	}
	for _, field := range []string{"rating", "difficulty"} {
		_, err := CanonicalPayload("curated_article", []byte(`{"`+field+`":"arbitrary"}`), false)
		wantError(t, err, fault.Payload)
	}
	for _, rating := range []string{"S+", "S", "A+", "A", "B+", "B", "C+", "C"} {
		_, err := CanonicalPayload("curated_article", []byte(`{"sourceUrl":"https://example.com","rating":"`+rating+`","difficulty":"advanced"}`), true)
		must(t, err)
	}
}

func TestTopicProductTargetsAndRecommendationSnapshot(t *testing.T) {
	r := newRig(t)
	topic := r.prepared(t, r.admin, "topic", "product")
	for _, kind := range []string{"post", "note", "topic"} {
		target := r.prepared(t, r.admin, kind, "wrong-"+kind)
		in := topic.Draft.DraftInput
		in.TopicEntries = []TopicEntry{{target.ID}}
		_, err := r.s.Save(ctx, r.admin, topic.ID, in)
		wantError(t, err, fault.Validation)
	}
	target := r.prepared(t, r.admin, "curated_article", "curated")
	_, err := r.s.PublishDirect(ctx, r.admin, target.ID, target.Draft.Version)
	must(t, err)
	in := topic.Draft.DraftInput
	in.Payload = json.RawMessage(`{"order":0,"recommendedCount":2}`)
	in.TopicEntries = []TopicEntry{{target.ID}}
	_, err = r.s.Save(ctx, r.admin, topic.ID, in)
	wantError(t, err, fault.Payload)
	in.Payload = json.RawMessage(`{"order":0,"recommendedCount":1}`)
	draft, err := r.s.Save(ctx, r.admin, topic.ID, in)
	must(t, err)
	topic, err = r.s.Submit(ctx, r.admin, topic.ID, draft.Version)
	must(t, err)
	_, err = r.s.PublishReviewed(ctx, r.admin, topic.ID, topic.PendingRevision.ID, "")
	must(t, err)
	rev, err := r.s.Revision(ctx, r.admin, topic.ID, 1)
	must(t, err)
	var payload TopicPayload
	must(t, json.Unmarshal(rev.Payload, &payload))
	if payload.RecommendedCount != 1 {
		t.Fatal("recommended split not snapshotted")
	}
}

func TestPublishedNoteGroupConsistencyAndLegacyDatesAtomicity(t *testing.T) {
	r := newRig(t)
	a := r.prepared(t, r.admin, "note", "one")
	_, err := r.s.PublishDirect(ctx, r.admin, a.ID, a.Draft.Version)
	must(t, err)
	b := r.prepared(t, r.admin, "note", "two")
	in := b.Draft.DraftInput
	in.Payload = json.RawMessage(`{"group":"Runtime","groupSlug":"runtime","groupDescription":"conflicting","groupOrder":1,"order":2}`)
	draft, err := r.s.Save(ctx, r.admin, b.ID, in)
	must(t, err)
	before := r.count(t, "audit_events")
	_, err = r.s.PublishDirect(ctx, r.admin, b.ID, draft.Version)
	wantError(t, err, fault.Payload)
	if r.count(t, "audit_events") != before || r.count(t, "publication_jobs") != 1 {
		t.Fatal("group conflict leaked mutation")
	}
	in.Version = draft.Version
	in.Payload = json.RawMessage(`{"group":"Runtime","groupSlug":"runtime","groupDescription":"","groupOrder":0,"order":2}`)
	draft, err = r.s.Save(ctx, r.admin, b.ID, in)
	must(t, err)
	_, err = r.db.Exec("CREATE TRIGGER fail_legacy_job BEFORE INSERT ON publication_jobs BEGIN SELECT RAISE(ABORT,'forced'); END")
	must(t, err)
	_, err = r.s.PublishLegacy(ctx, r.admin, b.ID, draft.Version, LegacyDates{First: 1000, Last: 2000})
	wantError(t, err, fault.Unavailable)
	got, err := r.s.Get(ctx, r.admin, b.ID)
	must(t, err)
	if got.PublishedRevisionID != nil || got.FirstPublishedAt != nil || got.CreatedAt == 1000 {
		t.Fatal("dates/pointer escaped failed job transaction")
	}
	_, err = r.db.Exec("DROP TRIGGER fail_legacy_job")
	must(t, err)
	got, err = r.s.PublishLegacy(ctx, r.admin, b.ID, draft.Version, LegacyDates{First: 1000, Last: 2000})
	must(t, err)
	if *got.FirstPublishedAt != 1000 || *got.LastPublishedAt != 2000 {
		t.Fatal("legacy dates not restored")
	}
	rev, err := r.s.Revision(ctx, r.admin, b.ID, 1)
	must(t, err)
	if rev.CreatedAt <= 2000 {
		t.Fatal("invented historical revision time")
	}
}
