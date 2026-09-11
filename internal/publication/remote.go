package publication

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"regexp"
	"time"

	"github.com/deepfurry/gopher-atlas/internal/fault"
)

func outbound(timeout time.Duration) *http.Client {
	return &http.Client{Timeout: timeout, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
}
func newHook(url string) func(context.Context) error {
	client := outbound(12 * time.Second)
	return func(ctx context.Context) error {
		request, err := http.NewRequestWithContext(ctx, "POST", url, nil)
		if err != nil {
			return fault.BuildTrigger
		}
		response, err := client.Do(request)
		if err != nil {
			return fault.BuildTrigger
		}
		defer response.Body.Close()
		// Acceptance depends only on 2xx. Never parse, return or log remote bodies.
		if response.StatusCode < 200 || response.StatusCode >= 300 {
			return fault.BuildTrigger
		}
		return nil
	}
}

type Marker struct {
	SchemaVersion  int    `json:"schemaVersion"`
	Generation     int64  `json:"generation"`
	SnapshotSHA256 string `json:"snapshotSha256"`
	BuiltAt        string `json:"builtAt"`
	CommitSHA      string `json:"commitSha"`
	BuildID        string `json:"buildId"`
}

var digestPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)
var commitPattern = regexp.MustCompile(`^[a-f0-9]{40,64}$`)
var buildIDPattern = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,100}$`)

func parseMarker(data []byte) (*Marker, error) {
	// A flat, closed document: reject absent, duplicate and null properties too.
	keys := map[string]bool{"schemaVersion": false, "generation": false, "snapshotSha256": false, "builtAt": false, "commitSha": false, "buildId": false}
	check := json.NewDecoder(bytes.NewReader(data))
	if token, err := check.Token(); err != nil || token != json.Delim('{') {
		return nil, fault.SnapshotInvalid
	}
	for check.More() {
		token, err := check.Token()
		if err != nil {
			return nil, fault.SnapshotInvalid
		}
		key, ok := token.(string)
		seen, known := keys[key]
		if !ok || !known || seen {
			return nil, fault.SnapshotInvalid
		}
		var value json.RawMessage
		if check.Decode(&value) != nil || bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
			return nil, fault.SnapshotInvalid
		}
		keys[key] = true
	}
	for _, seen := range keys {
		if !seen {
			return nil, fault.SnapshotInvalid
		}
	}
	var m Marker
	d := json.NewDecoder(bytes.NewReader(data))
	d.DisallowUnknownFields()
	if d.Decode(&m) != nil || d.Decode(new(any)) != io.EOF || m.SchemaVersion != 1 || m.Generation < 0 || m.Generation > 9007199254740991 || !digestPattern.MatchString(m.SnapshotSHA256) || !commitPattern.MatchString(m.CommitSHA) || !buildIDPattern.MatchString(m.BuildID) {
		return nil, fault.SnapshotInvalid
	}
	if _, err := time.Parse(time.RFC3339Nano, m.BuiltAt); err != nil {
		return nil, fault.SnapshotInvalid
	}
	return &m, nil
}
func newMarkerFetcher(origin string) func(context.Context) (*Marker, error) {
	client := outbound(5 * time.Second)
	return func(ctx context.Context) (*Marker, error) {
		if origin == "" {
			return nil, fault.PublicationNotConfigured
		}
		request, err := http.NewRequestWithContext(ctx, "GET", origin+"/.well-known/gopheratlas-build.json", nil)
		if err != nil {
			return nil, fault.SnapshotInvalid
		}
		response, err := client.Do(request)
		if err != nil {
			return nil, fault.SnapshotInvalid
		}
		defer response.Body.Close()
		if response.StatusCode != 200 {
			return nil, fault.SnapshotInvalid
		}
		data, err := io.ReadAll(io.LimitReader(response.Body, 8193))
		if err != nil || len(data) > 8192 {
			return nil, fault.SnapshotInvalid
		}
		return parseMarker(data)
	}
}
