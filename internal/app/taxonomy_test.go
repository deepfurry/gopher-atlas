package app

import (
	"encoding/json"
	"fmt"
	"github.com/deepfurry/gopher-atlas/internal/content"
	"testing"
)

func TestTaxonomyHTTPAuthorizationClosureAndSearch(t *testing.T) {
	r := runtime(t, false)
	admin := r.login(t, 1)
	editorCookies := r.login(t, 2)
	editor := identity(t, r, editorCookies)
	response, _ := perform(t, r.app, "POST", fmt.Sprintf("/api/admin/v1/users/%d/actions/approve", editor.User.ID), admin, `{"role":"editor"}`, r.headers(admin))
	if response.StatusCode != 200 {
		t.Fatal("setup")
	}
	payload := `{"slug":"engineering","name":"工程实践","description":"中文说明","nameEn":"Engineering","descriptionEn":"","order":3}`
	response, _ = perform(t, r.app, "POST", "/api/admin/v1/note-groups", editorCookies, payload, r.headers(editorCookies))
	if response.StatusCode != 403 {
		t.Fatal("editor managed taxonomy")
	}
	response, _ = perform(t, r.app, "POST", "/api/admin/v1/note-groups", admin, payload, nil)
	if response.StatusCode != 403 {
		t.Fatal("missing CSRF accepted")
	}
	response, body := perform(t, r.app, "POST", "/api/admin/v1/note-groups", admin, payload, r.headers(admin))
	var group content.NoteGroup
	if response.StatusCode != 201 || json.Unmarshal(body, &group) != nil || group.NameEn != "Engineering" {
		t.Fatalf("create group: %d", response.StatusCode)
	}
	for _, query := range []string{"engineering", "Engineering", "%E5%B7%A5%E7%A8%8B"} {
		response, body = perform(t, r.app, "GET", "/api/admin/v1/note-groups?q="+query, editorCookies, "", nil)
		var page content.Page[content.NoteGroup]
		if response.StatusCode != 200 || json.Unmarshal(body, &page) != nil || len(page.Items) != 1 || page.Items[0].ID != group.ID {
			t.Fatal("editor cannot select matching group")
		}
	}
	for _, bad := range []string{`{"slug":"bad","name":"Bad","description":"","nameEn":"","descriptionEn":"","order":0,"groupId":3}`, `{"slug":"bad","name":"Bad","description":"","nameEn":null,"descriptionEn":"","order":0}`, `{"slug":"bad","name":"Bad"}`} {
		response, _ = perform(t, r.app, "POST", "/api/admin/v1/note-groups", admin, bad, r.headers(admin))
		if response.StatusCode != 400 {
			t.Fatal("open or incomplete request accepted")
		}
	}
	group.Slug = "changed"
	data, _ := json.Marshal(group.NoteGroupInput)
	response, body = perform(t, r.app, "PUT", fmt.Sprintf("/api/admin/v1/note-groups/%d", group.ID), admin, string(data), r.headers(admin))
	if response.StatusCode != 409 || errorCode(t, body) != "taxonomy_slug_immutable" {
		t.Fatal("slug renamed")
	}
	response, body = perform(t, r.app, "POST", "/api/admin/v1/tags", admin, `{"name":"技术","slug":"tech","description":"","nameEn":"Technology","descriptionEn":""}`, r.headers(admin))
	var tag content.Tag
	if response.StatusCode != 201 || json.Unmarshal(body, &tag) != nil || tag.NameEn != "Technology" {
		t.Fatal("tag translation")
	}
	response, body = perform(t, r.app, "GET", "/api/admin/v1/tags?q=Technology", editorCookies, "", nil)
	var tags content.Page[content.Tag]
	if response.StatusCode != 200 || json.Unmarshal(body, &tags) != nil || len(tags.Items) != 1 {
		t.Fatal("translated tag search")
	}
	response, _ = perform(t, r.app, "DELETE", fmt.Sprintf("/api/admin/v1/note-groups/%d", group.ID), admin, "", r.headers(admin))
	if response.StatusCode < 400 {
		t.Fatal("hard delete exposed")
	}
}
