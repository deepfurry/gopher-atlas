package content

import (
	"reflect"
	"testing"

	"github.com/deepfurry/gopher-atlas/internal/fault"
)

func TestSQLiteConcurrentEditorialMutations(t *testing.T) {
	for round := 0; round < 4; round++ {
		t.Run("save-save", func(t *testing.T) {
			r := newRig(t)
			a, b := r.tag(t, "a"), r.tag(t, "b")
			for _, kind := range []string{"post", "topic"} {
				d := r.prepared(t, r.admin, kind, "race-"+kind)
				left, right := d.Draft.DraftInput, d.Draft.DraftInput
				left.Title = "A"
				right.Title = "B"
				if kind == "post" {
					left.TagIDs = []int64{a.ID}
					right.TagIDs = []int64{b.ID}
				} else {
					x := r.create(t, r.admin, "curated_article")
					y := r.create(t, r.admin, "curated_article")
					left.TopicEntries = []TopicEntry{{x.ID}}
					right.TopicEntries = []TopicEntry{{y.ID}}
				}
				results := racePair(func() error { _, e := r.s.Save(ctx, r.admin, d.ID, left); return e }, func() error { _, e := r.s.Save(ctx, r.admin, d.ID, right); return e })
				oneWinner(t, results, fault.ContentVersion)
				winner := left
				if results[1] == nil {
					winner = right
				}
				got, err := r.s.Get(ctx, r.admin, d.ID)
				must(t, err)
				if got.Draft.Title != winner.Title || got.Draft.Version != d.Draft.Version+1 || !reflect.DeepEqual(got.Draft.Relations, winner.Relations) {
					t.Fatal("save loser left partial scalar/tag/topic data")
				}
			}
		})
		t.Run("submit-submit", func(t *testing.T) {
			r := newRig(t)
			d := r.prepared(t, r.editor, "post", "submit-race")
			before := r.count(t, "audit_events")
			submit := func() error { _, e := r.s.Submit(ctx, r.editor, d.ID, d.Draft.Version); return e }
			oneWinner(t, racePair(submit, submit), fault.EditorialState)
			if r.count(t, "content_revisions") != 1 || r.count(t, "audit_events") != before+1 {
				t.Fatal("duplicate revision or failed audit")
			}
		})
		for _, against := range []string{"approve", "request-changes", "withdraw"} {
			t.Run("approve-"+against, func(t *testing.T) {
				r := newRig(t)
				d := r.prepared(t, r.editor, "post", "decision-race")
				d, err := r.s.Submit(ctx, r.editor, d.ID, d.Draft.Version)
				must(t, err)
				before := r.count(t, "audit_events")
				rid := d.PendingRevision.ID
				approve := func() error { _, e := r.s.PublishReviewed(ctx, r.reviewer, d.ID, rid, ""); return e }
				other := approve
				switch against {
				case "request-changes":
					other = func() error { _, e := r.s.RequestChanges(ctx, r.reviewer, d.ID, rid, "Please clarify"); return e }
				case "withdraw":
					other = func() error { _, e := r.s.Withdraw(ctx, r.editor, d.ID); return e }
				}
				results := racePair(approve, other)
				oneWinner(t, results, fault.EditorialState, fault.ReviewRevision)
				c, err := r.s.Get(ctx, r.editor, d.ID)
				must(t, err)
				if c.PendingRevision != nil || r.count(t, "audit_events") != before+1 {
					t.Fatal("decision did not commit atomically")
				}
				if c.PublishedRevisionID != nil {
					if *c.PublishedRevisionID != rid || c.EditorialState != "synced" || r.count(t, "content_reviews") != 1 || len(c.Routes) != 1 {
						t.Fatal("approve final state invalid")
					}
				} else if c.EditorialState == "changes_requested" {
					if r.count(t, "content_reviews") != 1 || len(c.Routes) != 0 {
						t.Fatal("changes final state invalid")
					}
				} else if c.EditorialState == "draft" {
					if r.count(t, "content_reviews") != 0 || len(c.Routes) != 0 {
						t.Fatal("withdraw final state invalid")
					}
				} else {
					t.Fatal("invalid terminal state")
				}
			})
		}
		t.Run("route-claim-route-claim", func(t *testing.T) {
			r := newRig(t)
			a := r.prepared(t, r.admin, "post", "route-race")
			b := r.prepared(t, r.admin, "post", "route-race")
			before := r.count(t, "audit_events")
			oneWinner(t, racePair(func() error { _, e := r.s.PublishDirect(ctx, r.admin, a.ID, a.Draft.Version); return e }, func() error { _, e := r.s.PublishDirect(ctx, r.admin, b.ID, b.Draft.Version); return e }), fault.RouteConflict)
			if r.count(t, "content_routes") != 1 || r.count(t, "content_revisions") != 1 || r.count(t, "audit_events") != before+1 {
				t.Fatal("route race partially committed")
			}
		})
		t.Run("direct-direct", func(t *testing.T) {
			r := newRig(t)
			d := r.prepared(t, r.admin, "post", "direct-race")
			direct := func() error { _, e := r.s.PublishDirect(ctx, r.admin, d.ID, d.Draft.Version); return e }
			oneWinner(t, racePair(direct, direct), fault.EditorialState)
			if r.count(t, "content_revisions") != 1 || r.count(t, "content_reviews") != 0 {
				t.Fatal("duplicate direct revision or fake approval")
			}
		})
		t.Run("restore-save", func(t *testing.T) {
			r := newRig(t)
			d := r.prepared(t, r.admin, "post", "restore-race")
			d, err := r.s.PublishDirect(ctx, r.admin, d.ID, d.Draft.Version)
			must(t, err)
			in := d.Draft.DraftInput
			in.Title = "New"
			results := racePair(func() error { _, e := r.s.RestoreRevision(ctx, r.admin, d.ID, 1, in.Version); return e }, func() error { _, e := r.s.Save(ctx, r.admin, d.ID, in); return e })
			oneWinner(t, results, fault.ContentVersion)
			got, err := r.s.Get(ctx, r.admin, d.ID)
			must(t, err)
			if got.Draft.Version != in.Version+1 || *got.PublishedRevisionID != *d.PublishedRevisionID || r.count(t, "content_revisions") != 1 {
				t.Fatal("restore/save broke isolation")
			}
		})
		t.Run("archive-publish", func(t *testing.T) {
			r := newRig(t)
			d := r.prepared(t, r.editor, "post", "archive-race")
			d, err := r.s.Submit(ctx, r.editor, d.ID, d.Draft.Version)
			must(t, err)
			before := r.count(t, "audit_events")
			results := racePair(func() error { _, e := r.s.Archive(ctx, r.admin, d.ID); return e }, func() error { _, e := r.s.PublishReviewed(ctx, r.reviewer, d.ID, d.PendingRevision.ID, ""); return e })
			must(t, results[0])
			// Both may succeed if publish linearizes first; archive still wins
			// the final state and permanently retains that committed route.
			delta := 1
			if results[1] != nil {
				wantError(t, results[1], fault.ContentArchived)
			} else {
				delta = 2
			}
			got, err := r.s.Get(ctx, r.admin, d.ID)
			must(t, err)
			if got.ArchivedAt == nil || got.PublishedRevisionID != nil || got.PendingRevision != nil || got.EditorialState != "draft" || r.count(t, "audit_events") != before+delta {
				t.Fatal("archive/publish state invalid")
			}
			if len(got.Routes) != delta-1 || r.count(t, "content_reviews") != delta-1 {
				t.Fatal("archive/publish history not serializable")
			}
		})
	}
}
