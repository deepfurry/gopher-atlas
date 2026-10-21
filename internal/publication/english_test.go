package publication

import (
	"github.com/deepfurry/gopher-atlas/internal/content"
	"testing"
)

func TestEnglishExportUsesOnlySelectedRevisionAndExplicitOptIn(t *testing.T) {
	r := newRig(t)
	d := r.draft(t, "curated_article", "english-projection")
	in := d.Draft.DraftInput
	in.EditorialEn = &content.EditorialEnglish{Title: "English title", Summary: "English summary", BodyMarkdown: "## English body"}
	saved, err := r.content.Save(ctx, r.admin, d.ID, in)
	must(t, err)
	d.Draft = &saved
	d = r.publish(t, d)
	export := func() *content.EditorialEnglish {
		t.Helper()
		exported, err := (&Exporter{DB: r.db}).Export(ctx, r.generation(t))
		must(t, err)
		if len(exported.Snapshot.Content) != 1 || exported.Snapshot.Content[0].ID != d.ID {
			t.Fatal("language view changed content identity")
		}
		return exported.Snapshot.Content[0].EditorialEn
	}
	if export() != nil {
		t.Fatal("complete but disabled text became public")
	}
	in = d.Draft.DraftInput
	in.EditorialEn.Enabled = true
	saved, err = r.content.Save(ctx, r.admin, d.ID, in)
	must(t, err)
	if export() != nil {
		t.Fatal("Draft opt-in bypassed published Revision")
	}
	d.Draft = &saved
	d = r.publish(t, d)
	if got := export(); got == nil || got.Title != "English title" || got.BodyMarkdown != "## English body" {
		t.Fatal("selected English projection missing")
	}
	in = d.Draft.DraftInput
	in.EditorialEn.Title = "Unpublished private title"
	in.EditorialEn.Enabled = false
	_, err = r.content.Save(ctx, r.admin, d.ID, in)
	must(t, err)
	if got := export(); got == nil || got.Title != "English title" {
		t.Fatal("autosave changed selected public translation")
	}
}
