package app

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/deepfurry/gopher-atlas/internal/content"
	"github.com/gofiber/fiber/v3"
)

func TestEditorialHTTPWorkflowContractAndPrivacy(t *testing.T) {
	r := runtime(t, false)
	adminCookies := r.login(t, 1)
	admin := identity(t, r, adminCookies)
	editorCookies := r.login(t, 2)
	editor := identity(t, r, editorCookies)
	reviewerCookies := r.login(t, 3)
	reviewer := identity(t, r, reviewerCookies)
	for id, role := range map[int64]string{editor.User.ID: "editor", reviewer.User.ID: "reviewer"} {
		response, _ := perform(t, r.app, "POST", fmt.Sprintf("/api/admin/v1/users/%d/actions/approve", id), adminCookies, `{"role":"`+role+`"}`, r.headers(adminCookies))
		if response.StatusCode != 200 {
			t.Fatal("approval failed")
		}
	}
	response, body := perform(t, r.app, "POST", "/api/admin/v1/content", editorCookies, `{"type":"post"}`, r.headers(editorCookies))
	if response.StatusCode != 201 {
		t.Fatal("create content API failed")
	}
	var d content.Detail
	if json.Unmarshal(body, &d) != nil || d.Draft == nil || d.Draft.Version != 1 {
		t.Fatal("content DTO invalid")
	}
	path := fmt.Sprintf("/api/admin/v1/content/%d", d.ID)
	in := d.Draft.DraftInput
	in.Title = "HTTP workflow"
	in.Slug = "http-workflow"
	in.Language = "en"
	in.BodyMarkdown = "## Large Markdown\n" + strings.Repeat("a", 40<<10)
	data, _ := json.Marshal(in)
	response, _ = perform(t, r.app, "PUT", path+"/draft", editorCookies, string(data), map[string]string{"Content-Type": "application/json"})
	if response.StatusCode != 403 {
		t.Fatal("editorial mutation bypassed CSRF")
	}
	wrongOrigin := r.headers(editorCookies)
	wrongOrigin["Origin"] = "https://different.example"
	response, _ = perform(t, r.app, "PUT", path+"/draft", editorCookies, string(data), wrongOrigin)
	if response.StatusCode != 403 {
		t.Fatal("editorial mutation bypassed Origin")
	}
	response, body = perform(t, r.app, "PUT", path+"/draft", editorCookies, string(data), r.headers(editorCookies))
	if response.StatusCode != 200 {
		t.Fatal("identity body limit still blocks Markdown")
	}
	var saved content.Draft
	if json.Unmarshal(body, &saved) != nil || saved.Version != 2 {
		t.Fatal("draft DTO invalid")
	}
	response, body = perform(t, r.app, "PUT", path+"/draft", editorCookies, string(data), r.headers(editorCookies))
	if response.StatusCode != 409 || errorCode(t, body) != "content_version_conflict" {
		t.Fatal("stale save did not return stable 409")
	}
	response, _ = perform(t, r.app, "PUT", path+"/draft", editorCookies, `{"version":2,"title":"missing fields"}`, r.headers(editorCookies))
	if response.StatusCode != 400 {
		t.Fatal("incomplete replacement accepted")
	}
	in = saved.DraftInput
	in.Payload = json.RawMessage(`{"unknown":true}`)
	data, _ = json.Marshal(in)
	response, body = perform(t, r.app, "PUT", path+"/draft", editorCookies, string(data), r.headers(editorCookies))
	if response.StatusCode != 422 || errorCode(t, body) != "invalid_payload" {
		t.Fatal("typed payload API validation missing")
	}
	in = saved.DraftInput
	in.BodyMarkdown = strings.Repeat("a", content.MarkdownLimit+1)
	data, _ = json.Marshal(in)
	response, body = perform(t, r.app, "PUT", path+"/draft", editorCookies, string(data), r.headers(editorCookies))
	if response.StatusCode != 422 || errorCode(t, body) != "invalid_markdown" {
		t.Fatal("domain body limit missing")
	}
	response, body = perform(t, r.app, "POST", path+"/actions/submit-review", editorCookies, `{"version":2}`, r.headers(editorCookies))
	if response.StatusCode != 200 || json.Unmarshal(body, &d) != nil || d.PendingRevision == nil {
		t.Fatal("submit API failed")
	}
	rid := d.PendingRevision.ID
	response, body = perform(t, r.app, "GET", path, reviewerCookies, "", nil)
	if response.StatusCode != 200 {
		t.Fatal("review material denied")
	}
	var visible content.Detail
	if json.Unmarshal(body, &visible) != nil || visible.Draft != nil || visible.PendingRevision.ID != rid {
		t.Fatal("review API exposed draft")
	}
	response, body = perform(t, r.app, "GET", "/api/admin/v1/reviews?view=pending", reviewerCookies, "", nil)
	var queue content.Page[content.PendingReview]
	if response.StatusCode != 200 || json.Unmarshal(body, &queue) != nil || len(queue.Items) != 1 || queue.Items[0].RevisionID != rid {
		t.Fatal("review queue contract wrong")
	}
	response, _ = perform(t, r.app, "POST", path+"/actions/publish", reviewerCookies, fmt.Sprintf(`{"mode":"reviewed","revisionId":%d,"version":2}`, rid), r.headers(reviewerCookies))
	if response.StatusCode != 400 {
		t.Fatal("ambiguous publish mode accepted")
	}
	response, _ = perform(t, r.app, "POST", path+"/actions/publish", reviewerCookies, fmt.Sprintf(`{"mode":"reviewed","revisionId":%d}`, rid), r.headers(reviewerCookies))
	if response.StatusCode != 200 {
		t.Fatal("reviewed publish API failed")
	}
	response, body = perform(t, r.app, "GET", path+"/revisions/1", editorCookies, "", nil)
	var rev content.Revision
	if response.StatusCode != 200 || json.Unmarshal(body, &rev) != nil || rev.ID != rid || !rev.Published || rev.Review == nil || rev.Review.Decision != "approved" {
		t.Fatal("revision API contract wrong")
	}
	response, _ = perform(t, r.app, "GET", path+"/revisions/1", reviewerCookies, "", nil)
	if response.StatusCode != 403 {
		t.Fatal("reviewer retained unnecessary content access")
	}
	response, body = perform(t, r.app, "GET", "/api/admin/v1/reviews?view=history", reviewerCookies, "", nil)
	var history content.Page[content.Review]
	if response.StatusCode != 200 || json.Unmarshal(body, &history) != nil || len(history.Items) != 1 {
		t.Fatal("review history API failed")
	}
	response, body = perform(t, r.app, "GET", "/api/admin/v1/audit", adminCookies, "", nil)
	var events content.Page[content.AuditEvent]
	if response.StatusCode != 200 || json.Unmarshal(body, &events) != nil {
		t.Fatal("audit API failed")
	}
	actions := map[string]bool{}
	for _, event := range events.Items {
		actions[event.Action] = true
		if len(event.RequestID) != 36 {
			t.Fatal("HTTP audit missing server request ID")
		}
	}
	for _, action := range []string{"auth.login", "user.approved", "content.created", "content.submitted", "content.published"} {
		if !actions[action] {
			t.Fatal("missing HTTP audit", action)
		}
	}
	if strings.Contains(string(body), "Large Markdown") || strings.Contains(string(body), "bodyMarkdown") {
		t.Fatal("audit exposed content")
	}
	response, _ = perform(t, r.app, "GET", "/api/admin/v1/audit", editorCookies, "", nil)
	if response.StatusCode != 403 {
		t.Fatal("editor audit access")
	}
	response, _ = perform(t, r.app, "GET", "/api/admin/v1/content?after=invalid", editorCookies, "", nil)
	if response.StatusCode != 400 {
		t.Fatal("invalid cursor accepted")
	}
	// Same version restoration leaves the publication pointer untouched.
	response, body = perform(t, r.app, "POST", path+"/revisions/1/actions/restore", editorCookies, `{"version":2}`, r.headers(editorCookies))
	if response.StatusCode != 200 || json.Unmarshal(body, &d) != nil || d.Draft.Version != 3 || *d.PublishedRevisionID != rid {
		t.Fatal("HTTP restore failed")
	}
	for _, action := range []string{"unpublish", "archive", "restore-archive"} {
		response, _ = perform(t, r.app, "POST", path+"/actions/"+action, adminCookies, "", r.headers(adminCookies))
		if response.StatusCode != 200 {
			t.Fatal("Admin lifecycle API failed", action)
		}
	}
	response, body = perform(t, r.app, "POST", "/api/admin/v1/tags", adminCookies, `{"name":"Go","slug":"go","description":""}`, r.headers(adminCookies))
	var tag content.Tag
	if response.StatusCode != 201 || json.Unmarshal(body, &tag) != nil {
		t.Fatal("tag create API failed")
	}
	response, _ = perform(t, r.app, "PUT", fmt.Sprintf("/api/admin/v1/tags/%d", tag.ID), adminCookies, `{"name":"Golang","slug":"go","description":""}`, r.headers(adminCookies))
	if response.StatusCode != 200 {
		t.Fatal("tag update failed")
	}
	response, body = perform(t, r.app, "GET", "/api/admin/v1/tags", editorCookies, "", nil)
	var tags content.Page[content.Tag]
	if response.StatusCode != 200 || json.Unmarshal(body, &tags) != nil || len(tags.Items) != 1 || tags.Items[0].Slug != "go" {
		t.Fatal("tag list failed")
	}
	_ = admin
}

func TestJSONBodyLimitOnRealHTTPConnection(t *testing.T) {
	r := runtime(t, false)
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() { done <- r.app.Listener(listener, fiber.ListenConfig{DisableStartupMessage: true}) }()
	t.Cleanup(func() { _ = listener.Close(); <-done })
	conn, err := net.DialTimeout("tcp", listener.Addr().String(), 5*time.Second)
	if err != nil {
		t.Fatal("body limit connection failed")
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(5 * time.Second))
	// Advertise the oversized body before sending it. This exercises the real
	// parser without platform-dependent resets during concurrent body writes.
	_, err = fmt.Fprintf(conn, "POST /api/admin/v1/content HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: %d\r\nConnection: close\r\n\r\n", content.JSONBodyLimit+1)
	if err != nil {
		t.Fatal("body limit request write failed")
	}
	response, err := http.ReadResponse(bufio.NewReader(conn), &http.Request{Method: "POST"})
	if err != nil {
		t.Fatal("real body limit request failed")
	}
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	if err != nil || response.StatusCode != 413 || errorCode(t, body) != "payload_too_large" {
		t.Fatal("global body limit missing")
	}
}
