package content

import (
	"bytes"
	"encoding/json"
	"io"
	"regexp"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/deepfurry/gopher-atlas/internal/fault"
	"github.com/deepfurry/gopher-atlas/internal/markdown"
)

var slugPattern = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)
var languagePattern = regexp.MustCompile(`^[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{1,8})*$`)

func validSlug(s string) bool      { return len(s) <= 100 && slugPattern.MatchString(s) }
func bounded(s string, n int) bool { return utf8.ValidString(s) && utf8.RuneCountInString(s) <= n }
func webURL(s string) bool         { return len(s) <= 2048 && markdown.WebURL(s, false) }

type PostPayload struct{}
type NotePayload struct {
	Group            string `json:"group"`
	GroupSlug        string `json:"groupSlug"`
	GroupDescription string `json:"groupDescription"`
	GroupOrder       int64  `json:"groupOrder"`
	Order            int64  `json:"order"`
}
type TopicPayload struct {
	Order            int64 `json:"order"`
	RecommendedCount int64 `json:"recommendedCount"`
}
type RelatedLink struct {
	Label string `json:"label"`
	URL   string `json:"url"`
}
type CuratedPayload struct {
	SourceURL         string        `json:"sourceUrl"`
	OriginalURL       string        `json:"originalUrl"`
	SourceAuthor      string        `json:"sourceAuthor"`
	SourceName        string        `json:"sourceName"`
	SourcePublishedAt string        `json:"sourcePublishedAt"`
	SourceLanguage    string        `json:"sourceLanguage"`
	Difficulty        string        `json:"difficulty"`
	Rating            string        `json:"rating"`
	MustRead          bool          `json:"mustRead"`
	RelatedLinks      []RelatedLink `json:"relatedLinks"`
}

func strictPayload(raw []byte, out any) error {
	if !utf8.Valid(raw) || len(raw) > 32<<10 || len(bytes.TrimSpace(raw)) == 0 || bytes.TrimSpace(raw)[0] != '{' {
		return fault.Payload
	}
	// JSON null is not a value of any v1 payload field. Go's decoder otherwise
	// silently accepts null for scalar fields and substitutes a zero value.
	tokens := json.NewDecoder(bytes.NewReader(raw))
	for {
		token, err := tokens.Token()
		if err == io.EOF {
			break
		}
		if err != nil || token == nil {
			return fault.Payload
		}
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if decoder.Decode(out) != nil || decoder.Decode(new(any)) != io.EOF {
		return fault.Payload
	}
	return nil
}

// CanonicalPayload validates a concrete subtype before persisting its canonical
// struct encoding. Incomplete authoring fields are allowed only before submission.
func CanonicalPayload(kind string, raw []byte, complete bool) (json.RawMessage, error) {
	var value any
	switch kind {
	case "post":
		p := PostPayload{}
		if err := strictPayload(raw, &p); err != nil {
			return nil, err
		}
		value = p
	case "note":
		p := NotePayload{}
		if err := strictPayload(raw, &p); err != nil {
			return nil, err
		}
		if !bounded(p.Group, 100) || !bounded(p.GroupDescription, 1000) || p.GroupOrder < 0 || p.GroupOrder > 1000000 || p.Order < 0 || p.Order > 1000000 || (p.GroupSlug != "" && !validSlug(p.GroupSlug)) ||
			(complete && (strings.TrimSpace(p.Group) == "" || !validSlug(p.GroupSlug))) {
			return nil, fault.Payload
		}
		value = p
	case "topic":
		p := TopicPayload{}
		if err := strictPayload(raw, &p); err != nil {
			return nil, err
		}
		if p.Order < 0 || p.Order > 1000000 || p.RecommendedCount < 0 || p.RecommendedCount > RelationLimit {
			return nil, fault.Payload
		}
		value = p
	case "curated_article":
		p := CuratedPayload{}
		if err := strictPayload(raw, &p); err != nil {
			return nil, err
		}
		if (p.SourceURL != "" && !webURL(p.SourceURL)) || (complete && p.SourceURL == "") || (p.OriginalURL != "" && !webURL(p.OriginalURL)) ||
			!bounded(p.SourceAuthor, 200) || !bounded(p.SourceName, 200) || !bounded(p.Difficulty, 32) || !bounded(p.Rating, 16) ||
			len(p.SourceLanguage) > 32 || (p.SourceLanguage != "" && !languagePattern.MatchString(p.SourceLanguage)) || len(p.RelatedLinks) > 20 {
			return nil, fault.Payload
		}
		if p.SourcePublishedAt != "" {
			if _, err := time.Parse("2006-01-02", p.SourcePublishedAt); err != nil {
				return nil, fault.Payload
			}
		}
		if (!slices.Contains([]string{"beginner", "intermediate", "advanced"}, p.Difficulty) && (complete || p.Difficulty != "")) ||
			(!slices.Contains([]string{"S+", "S", "A+", "A", "B+", "B", "C+", "C"}, p.Rating) && (complete || p.Rating != "")) {
			return nil, fault.Payload
		}
		for _, link := range p.RelatedLinks {
			if !bounded(link.Label, 200) || strings.TrimSpace(link.Label) == "" || !webURL(link.URL) {
				return nil, fault.Payload
			}
		}
		if p.RelatedLinks == nil {
			p.RelatedLinks = []RelatedLink{}
		}
		value = p
	default:
		return nil, fault.Payload
	}
	data, err := json.Marshal(value)
	if err != nil {
		return nil, fault.Payload
	}
	return data, nil
}
func initialPayload(kind string) json.RawMessage {
	data, _ := CanonicalPayload(kind, []byte("{}"), false)
	return data
}
func validateFields(kind string, fields *Fields, complete bool) error {
	if !bounded(fields.Title, 200) || !bounded(fields.Summary, 4000) || !bounded(fields.SEOTitle, 120) || !bounded(fields.SEODescription, 320) ||
		fields.BylineUserID <= 0 || len(fields.Language) > 32 || (fields.Language != "" && !languagePattern.MatchString(fields.Language)) ||
		(fields.Slug != "" && !validSlug(fields.Slug)) {
		return fault.Validation
	}
	if complete && (strings.TrimSpace(fields.Title) == "" || !validSlug(fields.Slug) || fields.Language == "") {
		return fault.Validation
	}
	if len(fields.BodyMarkdown) > MarkdownLimit || !utf8.ValidString(fields.BodyMarkdown) || !markdown.Valid(fields.BodyMarkdown) {
		return fault.Markdown
	}
	data, err := CanonicalPayload(kind, fields.Payload, complete)
	if err != nil {
		return err
	}
	fields.Payload = data
	return nil
}
func validateComment(s string, required bool) error {
	if len(s) > ReviewCommentLimit || !utf8.ValidString(s) || !markdown.Valid(s) || (required && strings.TrimSpace(s) == "") {
		return fault.Markdown
	}
	return nil
}
func candidatePath(kind string, f Fields) (string, error) {
	if !validSlug(f.Slug) {
		return "", fault.Validation
	}
	switch kind {
	case "curated_article":
		return "/articles/" + f.Slug + "/", nil
	case "post":
		return "/posts/" + f.Slug + "/", nil
	case "topic":
		return "/topics/" + f.Slug + "/", nil
	case "note":
		var p NotePayload
		if strictPayload(f.Payload, &p) != nil || !validSlug(p.GroupSlug) {
			return "", fault.Payload
		}
		return "/notes/" + p.GroupSlug + "/" + f.Slug + "/", nil
	}
	return "", fault.Validation
}

// PublishedPath reuses the domain's complete-field validation for the public
// exporter without exposing mutable Draft state or introducing another grammar.
func PublishedPath(kind string, fields Fields) (string, error) {
	if err := validateFields(kind, &fields, true); err != nil {
		return "", err
	}
	return candidatePath(kind, fields)
}
