package content

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestProductListMetadataKeepsImmutableReviewerBoundary(t *testing.T) {
	r := newRig(t)
	d := r.prepared(t, r.editor, "curated_article", "product-list")
	in := d.Draft.DraftInput
	in.Summary = "Immutable summary"
	in.BodyMarkdown = "## Never in list"
	saved, err := r.s.Save(ctx, r.editor, d.ID, in)
	must(t, err)
	d, err = r.s.Submit(ctx, r.editor, d.ID, saved.Version)
	must(t, err)
	// Corrupt only the mutable Draft as a hostile fixture: reviewed metadata must
	// remain selected from the exact immutable revision, even on list enrichment.
	_, err = r.db.Exec("UPDATE content_drafts SET summary='PRIVATE_DRAFT',payload_json=? WHERE content_id=?", `{"sourceUrl":"https://private.example.com","rating":"C","difficulty":"advanced"}`, d.ID)
	must(t, err)
	list, err := r.s.List(ctx, r.reviewer, 0, false)
	must(t, err)
	encoded, err := json.Marshal(list)
	must(t, err)
	if strings.Contains(string(encoded), "PRIVATE_DRAFT") || strings.Contains(string(encoded), "private.example") || strings.Contains(string(encoded), "Never in list") {
		t.Fatal("private/body leaked in product summary")
	}
	if list.Items[0].Product.Summary != "Immutable summary" {
		t.Fatal("wrong metadata source")
	}
	_, err = r.s.Withdraw(ctx, r.editor, d.ID)
	must(t, err)
	list, err = r.s.List(ctx, r.reviewer, 0, false)
	must(t, err)
	if len(list.Items) != 0 {
		t.Fatal("product metadata bypassed visibility")
	}
}
