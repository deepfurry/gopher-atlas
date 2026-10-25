package content

import (
	"fmt"
	"reflect"
	"strings"
	"testing"

	"github.com/deepfurry/gopher-atlas/internal/auth"
	"github.com/deepfurry/gopher-atlas/internal/fault"
)

func allContent(t *testing.T, r *rig, actor auth.Principal, f Filters) []Summary {
	t.Helper()
	var result []Summary
	for i := 0; i < 10; i++ {
		page, err := r.s.List(ctx, actor, 0, false, f)
		must(t, err)
		result = append(result, page.Items...)
		if page.NextPageCursor == nil {
			return result
		}
		f.Cursor = *page.NextPageCursor
	}
	t.Fatal("pagination did not end")
	return nil
}
func TestContentGlobalOrderingAndFilters(t *testing.T) {
	r := newRig(t)
	tag := r.tag(t, "cross-page")
	for _, kind := range []string{"note", "topic", "curated_article"} {
		t.Run(kind, func(t *testing.T) {
			ids := []int64{}
			for i := 0; i < 121; i++ {
				d := r.prepared(t, r.admin, kind, fmt.Sprintf("list-%s-%03d", strings.ReplaceAll(kind, "_", "-"), i))
				ids = append(ids, d.ID)
				// Equal timestamps straddle a page boundary; IDs alone do not determine the full order.
				_, err := r.db.Exec("UPDATE content_items SET updated_at=? WHERE id=?", int64(1000+i%3), d.ID)
				must(t, err)
				if kind != "topic" {
					_, err = r.db.Exec("INSERT INTO draft_tags(content_id,tag_id) VALUES(?,?)", d.ID, tag.ID)
					must(t, err)
				}
			}
			f := Filters{Type: kind}
			rows := allContent(t, r, r.admin, f)
			if len(rows) != 121 {
				t.Fatalf("got %d", len(rows))
			}
			seen := map[int64]bool{}
			for i, row := range rows {
				if seen[row.ID] {
					t.Fatal("duplicate cursor row")
				}
				seen[row.ID] = true
				if i > 0 && (rows[i-1].UpdatedAt < row.UpdatedAt || (rows[i-1].UpdatedAt == row.UpdatedAt && rows[i-1].ID < row.ID)) {
					t.Fatal("not globally descending")
				}
			}
			f.Sort = "updated_asc"
			asc := allContent(t, r, r.admin, f)
			for i := range rows {
				if asc[i].ID != rows[len(rows)-1-i].ID {
					t.Fatal("ascending tuple mismatch")
				}
			}
			page, err := r.s.List(ctx, r.admin, 0, false, Filters{Type: kind})
			must(t, err)
			if page.NextPageCursor == nil {
				t.Fatal("missing cursor")
			}
			legacy, err := r.s.List(ctx, r.admin, *page.NextCursor, false, Filters{Type: kind})
			must(t, err)
			stable, err := r.s.List(ctx, r.admin, 0, false, Filters{Type: kind, Cursor: *page.NextPageCursor})
			must(t, err)
			if !reflect.DeepEqual(legacy.Items, stable.Items) {
				t.Fatal("legacy after does not follow updated order")
			}
			_, err = r.s.List(ctx, r.admin, 0, false, Filters{Type: kind, Published: "yes", Cursor: *page.NextPageCursor})
			wantError(t, err, fault.Validation)
			_, err = r.s.List(ctx, r.admin, 0, false, Filters{Type: kind, Sort: "updated_asc", Cursor: *page.NextPageCursor})
			wantError(t, err, fault.Validation)
			// Changing an anchor later cannot move the encoded boundary.
			_, err = r.db.Exec("UPDATE content_items SET updated_at=9999 WHERE id=?", *page.NextCursor)
			must(t, err)
			again, err := r.s.List(ctx, r.admin, 0, false, Filters{Type: kind, Cursor: *page.NextPageCursor})
			must(t, err)
			if !reflect.DeepEqual(again.Items, stable.Items) {
				t.Fatal("cursor reread mutable anchor")
			}
			if kind != "topic" {
				tagged := allContent(t, r, r.admin, Filters{Type: kind, TagID: tag.ID})
				if len(tagged) != 121 {
					t.Fatal("tag filter limited to loaded rows")
				}
				rare := r.tag(t, "rare-"+strings.ReplaceAll(kind, "_", "-"))
				_, err = r.db.Exec("INSERT INTO draft_tags(content_id,tag_id) VALUES(?,?)", ids[0], rare.ID)
				must(t, err)
				matched, err := r.s.List(ctx, r.admin, 0, false, Filters{Type: kind, TagID: rare.ID})
				must(t, err)
				if len(matched.Items) != 1 || matched.Items[0].ID != ids[0] {
					t.Fatal("rare tag was filtered after pagination")
				}
			}
			if kind == "note" {
				_, err = r.db.Exec(`UPDATE content_drafts SET payload_json='{"groupSlug":"advanced","order":10}' WHERE content_id=?`, ids[0])
				must(t, err)
				group, err := r.s.List(ctx, r.admin, 0, false, Filters{Type: kind, Group: "advanced"})
				must(t, err)
				if len(group.Items) != 1 || group.Items[0].ID != ids[0] {
					t.Fatal("group filter did not select global set")
				}
			}
			filtered, err := r.s.List(ctx, r.admin, 0, false, Filters{Type: kind, Search: "020", Language: map[bool]string{true: "zh-CN", false: "en"}[kind != "note"]})
			must(t, err)
			if len(filtered.Items) != 1 || filtered.Items[0].ID != ids[20] {
				t.Fatal("search/language before pagination")
			}
		})
	}
	rows, err := r.s.List(ctx, r.editor, 0, false)
	must(t, err)
	if len(rows.Items) != 0 {
		t.Fatal("Editor saw another owner's content")
	}
	_, err = r.s.List(ctx, r.editor, 0, true)
	wantError(t, err, fault.Permission)
}

func TestTopicFilterChoicesNeverRevealUnpublishedDrafts(t *testing.T) {
	r := newRig(t)
	d := r.prepared(t, r.admin, "topic", "published-topic")
	_, err := r.s.PublishDirect(ctx, r.admin, d.ID, d.Draft.Version)
	must(t, err)
	_, err = r.db.Exec("UPDATE content_drafts SET title='SECRET TOPIC',title_en='SECRET ENGLISH' WHERE content_id=?", d.ID)
	must(t, err)
	r.prepared(t, r.admin, "topic", "unpublished-topic")
	for _, actor := range []auth.Principal{r.editor, r.reviewer} {
		choices, err := r.s.TopicChoices(ctx, actor, 0, "")
		must(t, err)
		if len(choices.Items) != 1 || choices.Items[0].Title != "Title published-topic" {
			t.Fatal("Topic choices exposed Draft labels")
		}
		choices, err = r.s.TopicChoices(ctx, actor, 0, "SECRET")
		must(t, err)
		if len(choices.Items) != 0 {
			t.Fatal("search exposed private label")
		}
	}
	choices, err := r.s.TopicChoices(ctx, r.admin, 0, "SECRET")
	must(t, err)
	if len(choices.Items) != 1 {
		t.Fatal("Admin cannot search Draft label")
	}
}

func TestContentFiltersUseOnlyVisibleRevisionAndRelations(t *testing.T) {
	r := newRig(t)
	publicTag, privateTag := r.tag(t, "visible"), r.tag(t, "secret")
	d := r.prepared(t, r.editor, "curated_article", "visible-slug")
	in := d.Draft.DraftInput
	in.TagIDs = []int64{publicTag.ID}
	in.EditorialEn = &EditorialEnglish{Title: "Visible English", Summary: "Visible English Summary"}
	in.Payload = []byte(`{"sourceUrl":"https://example.com","sourceLanguage":"en","rating":"A","difficulty":"beginner"}`)
	saved, err := r.s.Save(ctx, r.editor, d.ID, in)
	must(t, err)
	d, err = r.s.Submit(ctx, r.editor, d.ID, saved.Version)
	must(t, err)
	_, err = r.db.Exec("UPDATE content_drafts SET title='PRIVATE',summary='PRIVATE',slug='private',title_en='PRIVATE',summary_en='PRIVATE',language='private',payload_json=? WHERE content_id=?", `{"rating":"C","difficulty":"advanced","sourceLanguage":"private"}`, d.ID)
	must(t, err)
	_, err = r.db.Exec("DELETE FROM draft_tags WHERE content_id=?", d.ID)
	must(t, err)
	_, err = r.db.Exec("INSERT INTO draft_tags(content_id,tag_id) VALUES(?,?)", d.ID, privateTag.ID)
	must(t, err)
	topic := r.prepared(t, r.admin, "topic", "private-topic")
	_, err = r.db.Exec("INSERT INTO draft_topic_entries(topic_content_id,target_content_id,position) VALUES(?,?,1)", topic.ID, d.ID)
	must(t, err)
	for _, f := range []Filters{{Search: "PRIVATE"}, {Language: "private"}, {Rating: "C"}, {Difficulty: "advanced"}, {SourceLanguage: "private"}, {TagID: privateTag.ID}, {TopicID: topic.ID}, {Published: "yes"}} {
		rows, err := r.s.List(ctx, r.reviewer, 0, false, f)
		must(t, err)
		if len(rows.Items) != 0 {
			t.Fatalf("private filter side channel: %+v", f)
		}
	}
	for _, search := range []string{"Visible English", "English Summary", "visible-slug"} {
		rows, err := r.s.List(ctx, r.reviewer, 0, false, Filters{Search: search, TagID: publicTag.ID, Rating: "A", Difficulty: "beginner", SourceLanguage: "en", Language: "zh-CN", Published: "no"})
		must(t, err)
		if len(rows.Items) != 1 || rows.Items[0].ID != d.ID {
			t.Fatalf("missing immutable match: %s", search)
		}
	}
	rows, err := r.s.List(ctx, r.admin, 0, false, Filters{TopicID: topic.ID})
	must(t, err)
	if len(rows.Items) != 1 {
		t.Fatal("Admin topic Draft membership missing")
	}
	_, err = r.s.Withdraw(ctx, r.editor, d.ID)
	must(t, err)
	rows, err = r.s.List(ctx, r.reviewer, 0, false, Filters{Rating: "A"})
	must(t, err)
	if len(rows.Items) != 0 {
		t.Fatal("filters bypass visibility")
	}
}
