package auth

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/deepfurry/gopher-atlas/internal/config"
	dbsqlc "github.com/deepfurry/gopher-atlas/internal/database/sqlc"
	"github.com/deepfurry/gopher-atlas/internal/fault"
	"github.com/deepfurry/gopher-atlas/internal/oauth"
	"github.com/deepfurry/gopher-atlas/internal/testkit"
)

type providerStub struct {
	identity oauth.Identity
	calls    atomic.Int64
}

func (p *providerStub) AuthorizationURL(string) string {
	return "https://github.com/login/oauth/authorize"
}
func (p *providerStub) Identity(context.Context, string) (oauth.Identity, error) {
	p.calls.Add(1)
	return p.identity, nil
}

func setup(t *testing.T) *Service {
	t.Helper()
	return New(testkit.Database(t), config.Config{BootstrapAdminID: 1, SessionTTL: time.Hour, StateTTL: time.Minute, BaseURL: "https://cms.example"}, &providerStub{identity: oauth.Identity{ID: 1, Login: "example"}})
}
func login(t *testing.T, s *Service, id int64) (Principal, Credentials) {
	t.Helper()
	credentials, err := s.login(context.Background(), oauth.Identity{ID: id, Login: "example"}, "")
	if err != nil {
		t.Fatalf("login: %v", err)
	}
	p, err := s.Resolve(context.Background(), credentials.Session)
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	return p, credentials
}

func TestStateBrowserBindingExpiryReplay(t *testing.T) {
	for _, scenario := range []string{"missing", "mismatch", "expired", "valid-replay", "parallel"} {
		t.Run(scenario, func(t *testing.T) {
			s := setup(t)
			ctx := context.Background()
			now := time.Now()
			s.now = func() time.Time { return now }
			state, _, err := s.Start(ctx)
			if err != nil {
				t.Fatal(err)
			}
			cookie := state
			switch scenario {
			case "missing":
				cookie = ""
			case "mismatch":
				cookie, _ = RandomToken()
			case "expired":
				now = now.Add(s.cfg.StateTTL)
			}
			code, _ := RandomToken()
			if scenario == "parallel" {
				var success atomic.Int64
				var wg sync.WaitGroup
				for i := 0; i < 8; i++ {
					wg.Go(func() {
						_, err := s.Callback(ctx, state, cookie, code, "")
						if err == nil {
							success.Add(1)
						} else if !errors.Is(err, fault.State) {
							t.Error("unexpected concurrent callback error")
						}
					})
				}
				wg.Wait()
				if success.Load() != 1 {
					t.Fatal("state was not consumed atomically")
				}
				return
			}
			_, err = s.Callback(ctx, state, cookie, code, "")
			if scenario == "valid-replay" {
				if err != nil {
					t.Fatal(err)
				}
				_, err = s.Callback(ctx, state, cookie, code, "")
			}
			if !errors.Is(err, fault.State) {
				t.Fatal("invalid state accepted")
			}
			if scenario == "missing" || scenario == "mismatch" {
				if _, err := s.Callback(ctx, state, state, code, ""); err != nil {
					t.Fatal("browser mismatch consumed another browser state")
				}
			}
		})
	}
}

func TestBootstrapIdentityAndDisabled(t *testing.T) {
	s := setup(t)
	ctx := context.Background()
	pending, _ := login(t, s, 2)
	if pending.User.Role != "editor" || pending.User.Status != "pending" {
		t.Fatal("unknown identity elevated")
	}
	admin, _ := login(t, s, 1)
	if admin.User.Role != "admin" || admin.User.Status != "active" {
		t.Fatal("bootstrap failed")
	}
	profile, err := s.Profile(ctx, admin)
	if err != nil {
		t.Fatal(err)
	}
	creds, err := s.login(ctx, oauth.Identity{ID: 1, Login: "renamed"}, "")
	if err != nil {
		t.Fatal(err)
	}
	renamed, err := s.Resolve(ctx, creds.Session)
	if err != nil {
		t.Fatal(err)
	}
	after, _ := s.Profile(ctx, renamed)
	if renamed.User.ID != admin.User.ID || renamed.User.GithubLogin != "renamed" || profile.Slug != after.Slug {
		t.Fatal("numeric identity or stable slug lost")
	}
	if _, err := s.ChangeUser(ctx, admin, pending.User.ID, "disable", ""); err != nil {
		t.Fatal(err)
	}
	s.cfg.BootstrapAdminID = 2
	// Simulate recovery configuration when no Admin exists; a disabled match stays disabled.
	if _, err := s.queries.SetUserAccess(ctx, dbsqlc.SetUserAccessParams{ID: admin.User.ID, Role: "editor", Status: "active"}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.login(ctx, oauth.Identity{ID: 2, Login: "example"}, ""); !errors.Is(err, fault.Disabled) {
		t.Fatal("bootstrap revived a disabled user")
	}
}

func TestSessionsHashRotationExpiryRevokeAndCSRF(t *testing.T) {
	s := setup(t)
	ctx := context.Background()
	now := time.Now()
	s.now = func() time.Time { return now }
	p, credentials := login(t, s, 1)
	if bytes.Equal(p.Session.TokenHash, []byte(credentials.Session)) || !bytes.Equal(p.Session.TokenHash, Hash(credentials.Session)) || !bytes.Equal(p.Session.CsrfTokenHash, Hash(credentials.CSRF)) {
		t.Fatal("session token storage is not hash-only")
	}
	wrong, _ := RandomToken()
	for _, args := range [][3]string{{s.cfg.BaseURL, "", credentials.CSRF}, {s.cfg.BaseURL, wrong, wrong}, {"https://evil.example", credentials.CSRF, credentials.CSRF}, {"", credentials.CSRF, credentials.CSRF}, {s.cfg.BaseURL, credentials.CSRF, wrong}} {
		if s.CheckCSRF(p, args[0], args[1], args[2]) == nil {
			t.Fatal("invalid CSRF or Origin accepted")
		}
	}
	if err := s.CheckCSRF(p, s.cfg.BaseURL, credentials.CSRF, credentials.CSRF); err != nil {
		t.Fatal(err)
	}
	// A new service instance sees the same persistent session.
	other := New(s.db, s.cfg, s.provider)
	if _, err := other.Resolve(ctx, credentials.Session); err != nil {
		t.Fatal("session lost on restart")
	}
	rotated, err := s.login(ctx, oauth.Identity{ID: 1, Login: "example"}, credentials.Session)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.Resolve(ctx, credentials.Session); !errors.Is(err, fault.Authentication) {
		t.Fatal("old session not rotated")
	}
	p, err = s.Resolve(ctx, rotated.Session)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Logout(ctx, p); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Resolve(ctx, rotated.Session); !errors.Is(err, fault.Authentication) {
		t.Fatal("logout did not revoke")
	}
	_, credentials = login(t, s, 1)
	now = now.Add(s.cfg.SessionTTL)
	if _, err := s.Resolve(ctx, credentials.Session); !errors.Is(err, fault.Authentication) {
		t.Fatal("expired session accepted")
	}
}

func TestUserActionsAndLastAdminConcurrency(t *testing.T) {
	s := setup(t)
	ctx := context.Background()
	admin, _ := login(t, s, 1)
	pending, pc := login(t, s, 2)
	if _, err := s.ChangeUser(ctx, pending, admin.User.ID, "disable", ""); !errors.Is(err, fault.Pending) {
		t.Fatal("pending mutation accepted")
	}
	if _, err := s.ChangeUser(ctx, admin, pending.User.ID, "approve", "reviewer"); err != nil {
		t.Fatal(err)
	}
	reviewer, err := s.Resolve(ctx, pc.Session)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.ListUsers(ctx, reviewer, 0); !errors.Is(err, fault.Permission) {
		t.Fatal("reviewer manages users")
	}
	if _, err := s.ChangeUser(ctx, admin, admin.User.ID, "disable", ""); !errors.Is(err, fault.LastAdmin) {
		t.Fatal("last Admin disabled")
	}
	if _, err := s.ChangeUser(ctx, admin, admin.User.ID, "role", "editor"); !errors.Is(err, fault.LastAdmin) {
		t.Fatal("last Admin demoted")
	}
	if _, err := s.ChangeUser(ctx, admin, reviewer.User.ID, "role", "admin"); err != nil {
		t.Fatal(err)
	}
	second, err := s.Resolve(ctx, pc.Session)
	if err != nil {
		t.Fatal(err)
	}
	var successes atomic.Int64
	var wg sync.WaitGroup
	for _, actor := range []Principal{admin, second} {
		wg.Go(func() {
			_, err := s.ChangeUser(ctx, actor, actor.User.ID, "role", "editor")
			if err == nil {
				successes.Add(1)
			} else if !errors.Is(err, fault.LastAdmin) {
				t.Error("unexpected concurrent demotion error")
			}
		})
	}
	wg.Wait()
	count, err := s.queries.CountActiveAdmins(ctx)
	if err != nil || count != 1 || successes.Load() != 1 {
		t.Fatal("concurrent last Admin protection failed")
	}
	// Refresh actor after the concurrency test, then disable/re-enable the other user.
	active := admin
	target := second
	if u, _ := s.queries.GetUser(ctx, admin.User.ID); u.Role != "admin" {
		active, target = second, admin
	}
	if _, err := s.ChangeUser(ctx, active, target.User.ID, "disable", ""); err != nil {
		t.Fatal(err)
	}
	if _, err := resolve(ctx, s.queries, target.Session.TokenHash, s.now().UnixMilli()); !errors.Is(err, fault.Authentication) {
		t.Fatal("disabled sessions not revoked")
	}
	if _, err := s.ChangeUser(ctx, active, target.User.ID, "enable", ""); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ChangeUser(ctx, target, active.User.ID, "disable", ""); !errors.Is(err, fault.Authentication) {
		t.Fatal("stale revoked actor accepted")
	}
}

func TestProfileSafetyAndStableSlug(t *testing.T) {
	s := setup(t)
	ctx := context.Background()
	admin, _ := login(t, s, 1)
	before, _ := s.Profile(ctx, admin)
	valid := ProfileInput{DisplayName: "Example", BioMarkdown: "## Hello\n\nSafe **bio**.", WebsiteURL: "https://example.com"}
	updated, err := s.UpdateProfile(ctx, admin, valid)
	if err != nil || updated.Slug != before.Slug {
		t.Fatal("valid profile or stable slug failed")
	}
	for _, body := range []string{"# H1", "<script>bad</script>", "[x](javascript:alert%281%29)", "![x](https://external.example/image.png)"} {
		bad := valid
		bad.BioMarkdown = body
		if _, err := s.UpdateProfile(ctx, admin, bad); !errors.Is(err, fault.Validation) {
			t.Fatal("unsafe profile accepted")
		}
	}
}

func TestConcurrentBootstrapAndExistingAdminBoundary(t *testing.T) {
	s := setup(t)
	ctx := context.Background()
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Go(func() {
			if _, err := s.login(ctx, oauth.Identity{ID: 1, Login: "example"}, ""); err != nil {
				t.Error("concurrent bootstrap failed")
			}
		})
	}
	wg.Wait()
	users, err := s.queries.ListUsers(ctx, dbsqlc.ListUsersParams{PageSize: 100})
	if err != nil || len(users) != 1 || users[0].Role != "admin" || users[0].Status != "active" {
		t.Fatal("bootstrap identity was duplicated or lost")
	}
	s.cfg.BootstrapAdminID = 2
	p, _ := login(t, s, 2)
	if p.User.Status != "pending" || p.User.Role != "editor" {
		t.Fatal("bootstrap setting elevated a user while an Admin exists")
	}
}

func TestIdentityTransactionRollsBackOnProfileFailure(t *testing.T) {
	s := setup(t)
	ctx := context.Background()
	admin, _ := login(t, s, 1)
	// Force a conflicting stable slug to exercise atomic user/profile creation.
	if _, err := s.db.ExecContext(ctx, "UPDATE author_profiles SET slug = 'github-4' WHERE user_id = ?", admin.User.ID); err != nil {
		t.Fatal("test setup failed")
	}
	if _, err := s.login(ctx, oauth.Identity{ID: 4, Login: "example"}, ""); !errors.Is(err, fault.Unavailable) {
		t.Fatal("profile conflict did not fail closed")
	}
	if _, err := s.queries.GetUserByGitHubID(ctx, 4); !errors.Is(err, sql.ErrNoRows) {
		t.Fatal("failed identity transaction left an orphan user")
	}
}
