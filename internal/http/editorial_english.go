package http

import (
	"bytes"
	"encoding/json"
	"github.com/deepfurry/gopher-atlas/internal/fault"
)

// Presence is checked recursively, so null/missing values cannot silently become
// Go zero values and erase a translated full snapshot. Unknown fields are rejected
// by the ordinary strict DTO decoder before this check.
func englishPresence(body []byte) error {
	var root map[string]json.RawMessage
	if json.Unmarshal(body, &root) != nil {
		return fault.Validation
	}
	raw, exists := root["editorialEn"]
	if !exists {
		return nil
	}
	object := func(raw json.RawMessage, keys ...string) (map[string]json.RawMessage, error) {
		var fields map[string]json.RawMessage
		if json.Unmarshal(raw, &fields) != nil || fields == nil {
			return nil, fault.Validation
		}
		for _, key := range keys {
			value, ok := fields[key]
			if !ok || bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
				return nil, fault.Validation
			}
		}
		return fields, nil
	}
	e, err := object(raw, "enabled", "title", "summary", "bodyMarkdown", "seoTitle", "seoDescription", "labels")
	if err != nil {
		return err
	}
	labels, err := object(e["labels"], "sourceAuthor", "sourceName", "relatedLinks")
	if err != nil {
		return err
	}
	var links []json.RawMessage
	if json.Unmarshal(labels["relatedLinks"], &links) != nil {
		return fault.Validation
	}
	for _, link := range links {
		if _, err = object(link, "url", "label"); err != nil {
			return err
		}
	}
	return nil
}
