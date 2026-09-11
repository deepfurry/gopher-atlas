package auth

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/deepfurry/gopher-atlas/internal/audit"
	dbsqlc "github.com/deepfurry/gopher-atlas/internal/database/sqlc"
	"github.com/deepfurry/gopher-atlas/internal/fault"
	"github.com/deepfurry/gopher-atlas/internal/oauth"
)

func TestIdentityAuditAndAtomicRollback(t *testing.T) {
	s := setup(t)
	admin, adminCredentials := login(t, s, 1)
	pending, pendingCredentials := login(t, s, 2)
	requestCtx := audit.WithRequestID(context.Background(), "12345678-1234-4123-8123-123456789abc")
	for _, operation := range []struct{ action, role string }{{"approve", "editor"}, {"role", "reviewer"}, {"disable", ""}, {"enable", ""}} {
		if _, err := s.ChangeUser(requestCtx, admin, pending.User.ID, operation.action, operation.role); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := s.UpdateProfile(requestCtx, admin, ProfileInput{"Admin", "## Private biography", "https://example.com"}); err != nil {
		t.Fatal(err)
	}
	rows, err := s.queries.ListAudit(context.Background(), dbsqlc.ListAuditParams{PageSize: 100})
	if err != nil {
		t.Fatal(err)
	}
	counts := map[string]int{}
	for _, row := range rows {
		counts[row.Action]++
		if row.Action != "auth.login" && row.RequestID != "12345678-1234-4123-8123-123456789abc" {
			t.Fatal("trusted operation context lost")
		}
	}
	for _, action := range []string{"auth.login", "user.approved", "user.role_changed", "user.disabled", "user.enabled", "author.profile_updated"} {
		if counts[action] == 0 {
			t.Fatal("identity audit missing", action)
		}
	}
	encoded, _ := json.Marshal(rows)
	for _, private := range []string{adminCredentials.Session, adminCredentials.CSRF, pendingCredentials.Session, pendingCredentials.CSRF, "Private biography"} {
		if strings.Contains(string(encoded), private) {
			t.Fatal("identity audit contains sensitive data")
		}
	}
	before := len(rows)
	if _, err := s.ChangeUser(requestCtx, admin, admin.User.ID, "disable", ""); !errors.Is(err, fault.LastAdmin) {
		t.Fatal("last Admin changed")
	}
	rows, _ = s.queries.ListAudit(context.Background(), dbsqlc.ListAuditParams{PageSize: 100})
	if len(rows) != before {
		t.Fatal("failed identity mutation audited")
	}
	// An unavailable audit sink must roll back identity, profile and login writes.
	if _, err := s.db.Exec("CREATE TRIGGER fail_identity_audit BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT,'test failure'); END;"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ChangeUser(requestCtx, admin, pending.User.ID, "disable", ""); !errors.Is(err, fault.Unavailable) {
		t.Fatal("audit failure ignored")
	}
	user, err := s.queries.GetUser(context.Background(), pending.User.ID)
	if err != nil || user.Status != "active" {
		t.Fatal("user mutation survived audit failure")
	}
	if _, err := s.UpdateProfile(requestCtx, admin, ProfileInput{"Wrong", "", ""}); !errors.Is(err, fault.Unavailable) {
		t.Fatal("profile audit failure ignored")
	}
	profile, err := s.Profile(context.Background(), admin)
	if err != nil || profile.DisplayName != "Admin" {
		t.Fatal("profile survived audit failure")
	}
	if _, err := s.login(requestCtx, oauth.Identity{ID: 99, Login: "new-user"}, ""); !errors.Is(err, fault.Unavailable) {
		t.Fatal("login audit failure ignored")
	}
	if _, err := s.queries.GetUserByGitHubID(context.Background(), 99); err == nil {
		t.Fatal("failed login committed identity")
	}
}
