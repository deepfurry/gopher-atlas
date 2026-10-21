package http

import (
	"encoding/json"
	"github.com/deepfurry/gopher-atlas/internal/content"
	"testing"
)

func TestEnglishPresenceAndScopedRequestCeiling(t *testing.T) {
	valid := map[string]any{"enabled": false, "title": "", "summary": "", "bodyMarkdown": "", "seoTitle": "", "seoDescription": "", "labels": map[string]any{"sourceAuthor": "", "sourceName": "", "relatedLinks": []any{}}}
	encode := func(e any) []byte { data, _ := json.Marshal(map[string]any{"editorialEn": e}); return data }
	if englishPresence(encode(valid)) != nil {
		t.Fatal("complete disabled English rejected")
	}
	for _, key := range []string{"enabled", "title", "summary", "bodyMarkdown", "seoTitle", "seoDescription", "labels"} {
		clone := map[string]any{}
		for k, v := range valid {
			clone[k] = v
		}
		delete(clone, key)
		if englishPresence(encode(clone)) == nil {
			t.Fatal("missing field accepted", key)
		}
		clone[key] = nil
		if englishPresence(encode(clone)) == nil {
			t.Fatal("null field accepted", key)
		}
	}
	if RequestBodyLimit("PUT", "/api/admin/v1/content/1/draft", "application/json") != 8<<20 {
		t.Fatal("bilingual request ceiling")
	}
	for _, path := range []string{"/api/admin/v1/content", "/api/admin/v1/tags", "/api/admin/v1/content/1/actions/publish"} {
		if RequestBodyLimit("POST", path, "application/json") != content.JSONBodyLimit {
			t.Fatal("unrelated request limit changed")
		}
	}
}
