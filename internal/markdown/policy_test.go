package markdown

import (
	"strings"
	"testing"
)

func TestExplicitLocalImagePolicy(t *testing.T) {
	base := "http://127.0.0.1:46217/__dev/assets"
	p, err := DevelopmentPolicy(base)
	if err != nil {
		t.Fatal(err)
	}
	key := "media/sha256/aa/" + strings.Repeat("a", 64) + ".png"
	image := "![alt](" + base + "/" + key + ")"
	if !p.Valid(image) || Valid(image) {
		t.Fatal("origin isolation")
	}
	for _, bad := range []string{base + "2/" + key, "http://127.0.0.1:46218/__dev/assets/" + key, base + "/../x.png", base + "/" + key + "?x=1", "https://other.example/x.png", "https://assets.gopheratlas.com/x.png"} {
		if p.Valid("![alt](" + bad + ")") {
			t.Fatal("uncontrolled local image", bad)
		}
	}
	for _, bad := range []string{"<script>x</script>", "# Heading", "![ ](" + base + "/" + key + ")"} {
		if p.Valid(bad) {
			t.Fatal("syntax relaxed")
		}
	}
	for _, base := range []string{"http://remote.example:46217/__dev/assets", "https://127.0.0.1:46217/__dev/assets", "http://127.0.0.1:46217/", "http://user@localhost:46217/__dev/assets"} {
		if _, err := DevelopmentPolicy(base); err == nil {
			t.Fatal("bad policy", base)
		}
	}
}
