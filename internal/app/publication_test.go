package app

import (
	"bytes"
	"encoding/json"
	"image"
	"image/png"
	"mime/multipart"
	"net/http"
	"strconv"
	"strings"
	"testing"

	"github.com/deepfurry/gopher-atlas/internal/assets"
	"github.com/deepfurry/gopher-atlas/internal/testkit"
)

func TestAssetMultipartAndPublicationHTTPAuthorization(t *testing.T) {
	store := testkit.NewMemoryStore()
	r := runtime(t, false, store)
	admin := r.login(t, 1)
	editor := r.login(t, 2)
	user := identity(t, r, editor)
	response, _ := perform(t, r.app, "POST", "/api/admin/v1/users/"+strconv.FormatInt(user.User.ID, 10)+"/actions/approve", admin, `{"role":"editor"}`, r.headers(admin))
	if response.StatusCode != 200 {
		t.Fatal("approve")
	}
	var pngBytes bytes.Buffer
	if png.Encode(&pngBytes, image.NewRGBA(image.Rect(0, 0, 2, 2))) != nil {
		t.Fatal("png fixture")
	}
	multipartBody := func(data []byte) (string, string) {
		var b bytes.Buffer
		w := multipart.NewWriter(&b)
		part, err := w.CreateFormFile("file", "untrusted-private-local-name.svg")
		if err != nil {
			t.Fatal(err)
		}
		if _, err = part.Write(data); err != nil {
			t.Fatal(err)
		}
		if w.Close() != nil {
			t.Fatal("multipart close")
		}
		return b.String(), w.FormDataContentType()
	}
	body, kind := multipartBody(pngBytes.Bytes())
	headers := r.headers(editor)
	headers["Content-Type"] = kind
	response, _ = perform(t, r.app, "POST", "/api/admin/v1/assets", editor, body, map[string]string{"Content-Type": kind})
	if response.StatusCode != 403 {
		t.Fatal("upload CSRF bypass")
	}
	bad := r.headers(editor)
	bad["Origin"] = "https://other.invalid"
	bad["Content-Type"] = kind
	response, _ = perform(t, r.app, "POST", "/api/admin/v1/assets", editor, body, bad)
	if response.StatusCode != 403 {
		t.Fatal("upload Origin bypass")
	}
	response, data := perform(t, r.app, "POST", "/api/admin/v1/assets", editor, body, headers)
	if response.StatusCode != 201 {
		t.Fatal("upload failed")
	}
	if bytes.Contains(data, []byte("untrusted-private-local-name")) {
		t.Fatal("local filename retained")
	}
	var a assets.Asset
	if json.Unmarshal(data, &a) != nil || a.MIMEType != "image/png" {
		t.Fatal("bytes did not determine format")
	}
	path := "/api/admin/v1/assets/" + strconv.FormatInt(a.ID, 10) + "/actions/delete"
	response, _ = perform(t, r.app, "POST", path, editor, "", r.headers(editor))
	if response.StatusCode != 403 {
		t.Fatal("editor delete")
	}
	response, _ = perform(t, r.app, "POST", path, admin, "", r.headers(admin))
	if response.StatusCode != 200 || len(store.Objects()) != 1 {
		t.Fatal("soft delete")
	}
	response, _ = perform(t, r.app, "GET", "/api/admin/v1/assets?includeDeleted=true", editor, "", nil)
	if response.StatusCode != 403 {
		t.Fatal("deleted list")
	}
	for _, input := range [][]byte{[]byte(`<svg xmlns="http://www.w3.org/2000/svg"/>`), []byte("fake extension")} {
		body, kind = multipartBody(input)
		headers["Content-Type"] = kind
		response, _ = perform(t, r.app, "POST", "/api/admin/v1/assets", editor, body, headers)
		if response.StatusCode != 422 {
			t.Fatal("invalid image accepted")
		}
	}
	body, kind = multipartBody([]byte(strings.Repeat("x", assets.MaxFileBytes+1)))
	headers["Content-Type"] = kind
	response, _ = perform(t, r.app, "POST", "/api/admin/v1/assets", editor, body, headers)
	if response.StatusCode != http.StatusRequestEntityTooLarge {
		t.Fatal("file size")
	}
	for _, path := range []string{"/api/admin/v1/publication/status", "/api/admin/v1/publication/jobs"} {
		response, _ = perform(t, r.app, "GET", path, editor, "", nil)
		if response.StatusCode != 403 {
			t.Fatal("Editor publication visibility")
		}
		response, _ = perform(t, r.app, "GET", path, admin, "", nil)
		if response.StatusCode != 200 {
			t.Fatal("Admin publication visibility")
		}
	}
	response, data = perform(t, r.app, "GET", "/api/admin/v1/publication/status", admin, "", nil)
	if response.StatusCode != 200 || !bytes.Contains(data, []byte(`"pipelineConfigured":false`)) {
		t.Fatal("disabled status")
	}
	response, _ = perform(t, r.app, "POST", "/api/admin/v1/publication/jobs/1/actions/retry", admin, "", nil)
	if response.StatusCode != 403 {
		t.Fatal("retry CSRF")
	}
}
