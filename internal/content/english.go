package content

import (
	"encoding/json"
	"strings"
	"unicode/utf8"

	"github.com/deepfurry/gopher-atlas/internal/fault"
	"github.com/deepfurry/gopher-atlas/internal/markdown"
)

// Partial English is private authoring material, including when a previously
// enabled translation is being edited. Publication checks the entire candidate.
func validateEnglish(kind string, f Fields, complete bool, policy markdown.Policy) error {
	e := f.EditorialEn
	if e == nil {
		return nil
	}
	if e.Labels.RelatedLinks == nil {
		e.Labels.RelatedLinks = []RelatedLink{}
	}
	if kind != "curated_article" && kind != "topic" {
		return fault.Validation
	}
	if !bounded(e.Title, 200) || !bounded(e.Summary, 4000) || !bounded(e.SEOTitle, 120) || !bounded(e.SEODescription, 320) {
		return fault.Validation
	}
	if len(e.BodyMarkdown) > MarkdownLimit || !utf8.ValidString(e.BodyMarkdown) || !policy.Valid(e.BodyMarkdown) {
		return fault.Markdown
	}
	if complete && e.Enabled && (strings.TrimSpace(e.Title) == "" || strings.TrimSpace(e.Summary) == "" || strings.TrimSpace(e.BodyMarkdown) == "") {
		return fault.Validation
	}
	if !bounded(e.Labels.SourceAuthor, 200) || !bounded(e.Labels.SourceName, 200) || len(e.Labels.RelatedLinks) > 20 {
		return fault.Validation
	}
	if kind == "topic" && (e.Labels.SourceAuthor != "" || e.Labels.SourceName != "" || len(e.Labels.RelatedLinks) > 0) {
		return fault.Validation
	}
	var p CuratedPayload
	if kind == "curated_article" && json.Unmarshal(f.Payload, &p) != nil {
		return fault.Payload
	}
	seen := map[string]bool{}
	for _, link := range e.Labels.RelatedLinks {
		found := false
		for _, shared := range p.RelatedLinks {
			if shared.URL == link.URL {
				found = true
			}
		}
		if !found || seen[link.URL] || !bounded(link.Label, 200) || !webURL(link.URL) {
			return fault.Validation
		}
		seen[link.URL] = true
	}
	return nil
}

// PublicEnglish exports only opted-in, valid text from the selected Revision.
func PublicEnglish(kind string, f Fields, policy markdown.Policy) (*EditorialEnglish, error) {
	if err := validateEnglish(kind, f, true, policy); err != nil {
		return nil, err
	}
	if f.EditorialEn == nil || !f.EditorialEn.Enabled {
		return nil, nil
	}
	return f.EditorialEn, nil
}
