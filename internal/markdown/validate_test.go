package markdown

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestSharedMathSafetyFixtures(t *testing.T) {
	source, err := os.ReadFile("../../tests/fixtures/markdown-math.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct {
		Name   string `json:"name"`
		Source string `json:"source"`
		Valid  bool   `json:"valid"`
	}
	if err := json.Unmarshal(source, &cases); err != nil {
		t.Fatal(err)
	}
	if len(cases) == 0 {
		t.Fatal("math fixtures missing")
	}
	for _, tc := range cases {
		t.Run(tc.Name, func(t *testing.T) {
			if got := Valid(tc.Source); got != tc.Valid {
				t.Fatalf("Go math safety = %t, want %t", got, tc.Valid)
			}
		})
	}
}

func TestSharedMarkdownFixtures(t *testing.T) {
	files, err := filepath.Glob("../../tests/fixtures/markdown/*.md")
	if err != nil || len(files) == 0 {
		t.Fatal("shared fixtures missing")
	}
	for _, file := range files {
		t.Run(filepath.Base(file), func(t *testing.T) {
			source, err := os.ReadFile(file)
			if err != nil {
				t.Fatal(err)
			}
			want := filepath.Base(file) != "unsafe.md"
			if Valid(string(source)) != want {
				t.Fatal("Go validator disagrees with shared fixture")
			}
		})
	}
}
func TestUnsafeMarkdownAndURLs(t *testing.T) {
	for _, body := range []string{"---\nname: example\n---\nbody", "# Heading", "<img src=x>", "[x](javascript:alert%281%29)", "[x](java&#x73;cript:alert%281%29)", "![ ](https://assets.gopheratlas.com/x)", "![x](https://external.example/x)", "[unused]: javascript:alert%281%29"} {
		if Valid(body) {
			t.Fatal("unsafe Markdown accepted")
		}
	}
	for _, url := range []string{"//other.example", "https://user:pass@example.com", "https://example.com\\x", "https://example.com/\n", "data:text/plain,bad"} {
		if WebURL(url, false) {
			t.Fatal("unsafe URL accepted")
		}
	}
}
