// Package markdown enforces the shared Markdown safety contract at the Go boundary.
// It validates profile biographies only in P0-1; it does not implement an editor.
package markdown

import (
	"html"
	"net/url"
	"regexp"
	"strings"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/extension"
	"github.com/yuin/goldmark/parser"
	"github.com/yuin/goldmark/text"
)

var frontmatter = regexp.MustCompile(`(?s)^---\r?\n.*?\r?\n(?:---|\.\.\.)(?:\r?\n|$)`)

func noControls(value string) bool {
	for _, r := range value {
		if r <= 32 || r == 127 || r == '\\' {
			return false
		}
	}
	return true
}

func WebURL(value string, httpsOnly bool) bool {
	if !noControls(value) {
		return false
	}
	u, err := url.Parse(value)
	return err == nil && u.Hostname() != "" && u.User == nil && (u.Scheme == "https" || (!httpsOnly && u.Scheme == "http"))
}

func safeLink(value string) bool {
	if !noControls(value) {
		return false
	}
	if strings.HasPrefix(value, "#") || (strings.HasPrefix(value, "/") && !strings.HasPrefix(value, "//")) {
		return true
	}
	if WebURL(value, false) {
		return true
	}
	u, err := url.Parse(value)
	return err == nil && u.Scheme == "mailto" && u.User == nil
}

func Valid(value string) bool {
	if frontmatter.MatchString(value) {
		return false
	}
	source := []byte(value)
	context := parser.NewContext()
	document := goldmark.New(goldmark.WithExtensions(extension.GFM, extension.Footnote)).Parser().Parse(text.NewReader(source), parser.WithContext(context))
	valid := true
	for _, ref := range context.References() {
		if !safeLink(html.UnescapeString(string(ref.Destination()))) {
			valid = false
		}
	}
	_ = ast.Walk(document, func(node ast.Node, entering bool) (ast.WalkStatus, error) {
		if !entering {
			return ast.WalkContinue, nil
		}
		switch node := node.(type) {
		case *ast.HTMLBlock, *ast.RawHTML:
			valid = false
		case *ast.Heading:
			if node.Level == 1 {
				valid = false
			}
		case *ast.Link:
			if !safeLink(html.UnescapeString(string(node.Destination))) {
				valid = false
			}
		case *ast.AutoLink:
			if !safeLink(html.UnescapeString(string(node.URL(source)))) {
				valid = false
			}
		case *ast.Image:
			destination := html.UnescapeString(string(node.Destination))
			u, err := url.Parse(destination)
			if !WebURL(destination, true) || err != nil || u.Host != "assets.gopheratlas.com" || !hasAlt(node, source) {
				valid = false
			}
		}
		return ast.WalkContinue, nil
	})
	return valid
}

func hasAlt(image *ast.Image, source []byte) bool {
	var alt strings.Builder
	_ = ast.Walk(image, func(node ast.Node, entering bool) (ast.WalkStatus, error) {
		if entering {
			switch node := node.(type) {
			case *ast.Text:
				alt.Write(node.Value(source))
			case *ast.String:
				alt.Write(node.Value)
			}
		}
		return ast.WalkContinue, nil
	})
	return strings.TrimSpace(alt.String()) != ""
}
