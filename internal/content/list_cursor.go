package content

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"

	"github.com/deepfurry/gopher-atlas/internal/fault"
)

// ContentPage adds a value-based cursor without removing the legacy numeric after contract.
// Cursors are positions, not authorization tokens: every page rechecks visibility in SQL.
type ContentPage struct {
	Page[Summary]
	NextPageCursor *string `json:"nextPageCursor"`
}
type listPosition struct {
	Version int    `json:"v"`
	Updated int64  `json:"u"`
	ID      int64  `json:"i"`
	Scope   string `json:"s"`
}

func listScope(f Filters, archived bool, actor int64, role string) string {
	f.Cursor = ""
	f.Search = cleanSearch(f.Search)
	if f.Sort == "" {
		f.Sort = "updated_desc"
	}
	b, _ := json.Marshal(struct {
		Filters
		Archived bool
		Actor    int64
		Role     string
	}{f, archived, actor, role})
	hash := sha256.Sum256(b)
	return base64.RawURLEncoding.EncodeToString(hash[:])
}
func decodeListPosition(value, scope string) (listPosition, error) {
	var p listPosition
	if len(value) > 512 {
		return p, fault.Validation
	}
	b, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil || json.Unmarshal(b, &p) != nil || p.Version != 1 || p.Updated < 0 || p.ID <= 0 || p.Scope != scope {
		return p, fault.Validation
	}
	return p, nil
}
func encodeListPosition(updated, id int64, scope string) string {
	b, _ := json.Marshal(listPosition{1, updated, id, scope})
	return base64.RawURLEncoding.EncodeToString(b)
}
