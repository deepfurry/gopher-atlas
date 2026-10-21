package publication

import (
	"encoding/json"
	"errors"
	"testing"

	"github.com/deepfurry/gopher-atlas/internal/content"
	"github.com/deepfurry/gopher-atlas/internal/fault"
	"github.com/deepfurry/gopher-atlas/internal/storage"
)

func TestV2AuthoritativeTaxonomyAndPublicationPipeline(t *testing.T) {
	r := newRig(t)
	tag, err := r.content.PutTag(ctx, r.admin, 0, content.TagInput{Name: "技术", Slug: "tech", Description: "中文说明"})
	must(t, err)
	d := r.draft(t, "note", "localized")
	in := d.Draft.DraftInput
	in.TagIDs = []int64{tag.ID}
	_, err = r.content.Save(ctx, r.admin, d.ID, in)
	must(t, err)
	d, err = r.content.Get(ctx, r.admin, d.ID)
	must(t, err)
	d = r.publish(t, d)
	// A group update changes the v2 authority, never historical display mirrors.
	group, err := r.q.GetNoteGroupBySlug(ctx, "public")
	must(t, err)
	_, err = r.content.PutNoteGroup(ctx, r.admin, group.ID, content.NoteGroupInput{Slug: "public", Name: "公开分组", Description: "中文", DescriptionEn: "English description", Order: 2})
	must(t, err)
	tag.NameEn = "Technology"
	_, err = r.content.PutTag(ctx, r.admin, tag.ID, tag.TagInput)
	must(t, err)
	if r.generation(t) != 3 || r.count(t, "content_revisions") != 1 {
		t.Fatal("taxonomy did not independently publish exactly once")
	}
	exported, err := (&Exporter{DB: r.db}).Export(ctx, 3)
	must(t, err)
	if exported.Snapshot.SchemaVersion != 3 || len(exported.Snapshot.Groups) != 1 || exported.Snapshot.Groups[0].Name != "公开分组" || exported.Snapshot.Groups[0].NameEn != "" || exported.Snapshot.Groups[0].DescriptionEn != "English description" {
		t.Fatal("authoritative group projection")
	}
	if exported.Snapshot.Tags[0].NameEn != "Technology" || exported.Snapshot.Tags[0].DescriptionEn != "" {
		t.Fatal("tag field fallback values")
	}
	var payload map[string]json.RawMessage
	must(t, json.Unmarshal(exported.Snapshot.Content[0].Payload, &payload))
	if len(payload) != 2 || payload["groupSlug"] == nil || payload["order"] == nil {
		t.Fatal("legacy mirrors leaked into v2")
	}
	must(t, r.worker.ProcessOnce(ctx))
	latestBytes, err := r.store.Get(ctx, "content", "latest.json", 8192)
	must(t, err)
	var latest Latest
	must(t, json.Unmarshal(latestBytes, &latest))
	bytes, err := r.store.Get(ctx, "content", latest.SnapshotKey, storage.MaxSnapshotBytes)
	must(t, err)
	if latest.SchemaVersion != 3 || latest.Generation != 3 || latest.SHA256 != exported.SHA256 || storage.Digest(bytes) != latest.SHA256 {
		t.Fatal("v2 pointer/hash mismatch")
	}
	// Graph failures remain closed, including group identity and two-way references.
	for _, mutate := range []func(*Snapshot){
		func(s *Snapshot) { s.SchemaVersion = 4 },
		func(s *Snapshot) { s.Groups = nil },
		func(s *Snapshot) { s.Groups = append(s.Groups, s.Groups[0]) },
		func(s *Snapshot) { g := s.Groups[0]; g.ID++; g.Slug = "unused"; s.Groups = append(s.Groups, g) },
		func(s *Snapshot) { s.Content[0].Payload = json.RawMessage(`{"groupSlug":"missing","order":0}`) },
		func(s *Snapshot) {
			s.Content[0].Payload = json.RawMessage(`{"groupSlug":"public","order":0,"group":"old"}`)
		},
	} {
		var bad Snapshot
		must(t, json.Unmarshal(exported.Bytes, &bad))
		mutate(&bad)
		if !errors.Is(validateGraph(bad), fault.SnapshotInvalid) {
			t.Fatal("invalid v2 graph accepted")
		}
	}
}
