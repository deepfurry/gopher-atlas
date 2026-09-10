package app

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/deepfurry/gopher-atlas/internal/auth"
	"github.com/deepfurry/gopher-atlas/internal/config"
	"github.com/deepfurry/gopher-atlas/internal/fault"
	"github.com/deepfurry/gopher-atlas/internal/oauth"
	"github.com/deepfurry/gopher-atlas/internal/testkit"
	"github.com/gofiber/fiber/v3"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
	"go.uber.org/zap/zaptest/observer"
)

type fakeOAuth struct {
	mu         sync.Mutex
	identities map[string]int64
}

func (p *fakeOAuth) AuthorizationURL(state string) string {
	return "https://github.com/login/oauth/authorize?state=" + url.QueryEscape(state)
}
func (p *fakeOAuth) Identity(_ context.Context, code string) (oauth.Identity, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	id, ok := p.identities[code]
	if !ok {
		return oauth.Identity{}, fault.OAuth
	}
	return oauth.Identity{ID: id, Login: "example-" + strconv.FormatInt(id, 10)}, nil
}

type runtimeTest struct {
	app      *fiber.App
	service  *auth.Service
	provider *fakeOAuth
	logs     *observer.ObservedLogs
	cfg      config.Config
}

func runtime(t *testing.T, secure bool) runtimeTest {
	t.Helper()
	pool := testkit.Database(t)
	cfg := config.Config{BaseURL: "http://127.0.0.1:5173", BootstrapAdminID: 1, SessionTTL: time.Hour, StateTTL: time.Minute}
	if secure {
		cfg.BaseURL = "https://cms.example"
	}
	provider := &fakeOAuth{identities: map[string]int64{}}
	service := auth.New(pool, cfg, provider)
	core, logs := observer.New(zapcore.DebugLevel)
	return runtimeTest{New(Dependencies{Config: cfg, DB: pool, Auth: service, Logger: zap.New(core)}), service, provider, logs, cfg}
}
func perform(t *testing.T, app *fiber.App, method, path string, cookies []*http.Cookie, body string, headers map[string]string) (*http.Response, []byte) {
	t.Helper()
	request := httptest.NewRequest(method, path, strings.NewReader(body))
	for _, cookie := range cookies {
		request.AddCookie(cookie)
	}
	for key, value := range headers {
		request.Header.Set(key, value)
	}
	response, err := app.Test(request, fiber.TestConfig{Timeout: 10 * time.Second})
	if err != nil {
		t.Fatal("HTTP test request failed")
	}
	data, err := io.ReadAll(response.Body)
	_ = response.Body.Close()
	if err != nil {
		t.Fatal("response read failed")
	}
	return response, data
}
func (r runtimeTest) login(t *testing.T, id int64) []*http.Cookie {
	t.Helper()
	start, _ := perform(t, r.app, "GET", "/api/auth/github", nil, "", nil)
	if start.StatusCode != 302 {
		t.Fatal("OAuth start failed")
	}
	location, err := url.Parse(start.Header.Get("Location"))
	if err != nil {
		t.Fatal("invalid provider redirect")
	}
	state := location.Query().Get("state")
	code, _ := auth.RandomToken()
	r.provider.mu.Lock()
	r.provider.identities[code] = id
	r.provider.mu.Unlock()
	callback, _ := perform(t, r.app, "GET", "/api/auth/github/callback?state="+url.QueryEscape(state)+"&code="+url.QueryEscape(code), start.Cookies(), "", nil)
	if callback.StatusCode != 303 || callback.Header.Get("Location") != "/" {
		t.Fatal("OAuth callback failed or leaked parameters")
	}
	return callback.Cookies()
}
func (r runtimeTest) headers(cookies []*http.Cookie) map[string]string {
	headers := map[string]string{"Origin": r.cfg.BaseURL, "Content-Type": "application/json"}
	for _, cookie := range cookies {
		if strings.HasSuffix(cookie.Name, "_csrf") {
			headers["X-CSRF-Token"] = cookie.Value
		}
	}
	return headers
}
func identity(t *testing.T, r runtimeTest, cookies []*http.Cookie) auth.Principal {
	t.Helper()
	for _, cookie := range cookies {
		if strings.HasSuffix(cookie.Name, "_session") {
			p, err := r.service.Resolve(context.Background(), cookie.Value)
			if err != nil {
				t.Fatal(err)
			}
			return p
		}
	}
	t.Fatal("session cookie missing")
	return auth.Principal{}
}
func errorCode(t *testing.T, body []byte) string {
	t.Helper()
	var envelope struct {
		Error struct{ Code, Message, RequestID string }
	}
	if json.Unmarshal(body, &envelope) != nil || envelope.Error.RequestID == "" {
		t.Fatal("stable error envelope missing")
	}
	return envelope.Error.Code
}

func TestHTTPIdentityCookiesCSRFAndUserActions(t *testing.T) {
	r := runtime(t, true)
	adminCookies := r.login(t, 1)
	admin := identity(t, r, adminCookies)
	for _, cookie := range adminCookies {
		if cookie.MaxAge < 0 {
			continue
		}
		if !strings.HasPrefix(cookie.Name, "__Host-gopheratlas_") || !cookie.Secure || cookie.Domain != "" || cookie.Path != "/" || cookie.SameSite != http.SameSiteLaxMode {
			t.Fatal("production cookie policy violated")
		}
		if cookie.HttpOnly == strings.HasSuffix(cookie.Name, "_csrf") {
			t.Fatal("cookie HttpOnly policy violated")
		}
	}
	pendingCookies := r.login(t, 2)
	pending := identity(t, r, pendingCookies)
	resp, body := perform(t, r.app, "GET", "/api/admin/v1/me", pendingCookies, "", nil)
	if resp.StatusCode != 200 || !strings.Contains(string(body), `"pending"`) {
		t.Fatal("pending identity not visible")
	}
	resp, body = perform(t, r.app, "GET", "/api/admin/v1/users", pendingCookies, "", nil)
	if resp.StatusCode != 403 || errorCode(t, body) != "account_pending" {
		t.Fatal("pending access allowed")
	}
	path := "/api/admin/v1/users/" + strconv.FormatInt(pending.User.ID, 10) + "/actions/approve"
	resp, _ = perform(t, r.app, "POST", path, adminCookies, `{"role":"editor"}`, map[string]string{"Content-Type": "application/json"})
	if resp.StatusCode != 403 {
		t.Fatal("mutation without CSRF accepted")
	}
	headers := r.headers(adminCookies)
	headers["Origin"] = "https://other.example"
	resp, _ = perform(t, r.app, "POST", path, adminCookies, `{"role":"editor"}`, headers)
	if resp.StatusCode != 403 {
		t.Fatal("cross-origin mutation accepted")
	}
	resp, _ = perform(t, r.app, "POST", path, adminCookies, `{"role":"editor"}`, r.headers(adminCookies))
	if resp.StatusCode != 200 {
		t.Fatal("Admin approval failed")
	}
	resp, _ = perform(t, r.app, "GET", "/api/admin/v1/users", pendingCookies, "", nil)
	if resp.StatusCode != 403 {
		t.Fatal("Editor manages users")
	}
	resp, body = perform(t, r.app, "POST", "/api/admin/v1/users/"+strconv.FormatInt(admin.User.ID, 10)+"/actions/disable", adminCookies, "", r.headers(adminCookies))
	if resp.StatusCode != 409 || errorCode(t, body) != "last_admin_required" {
		t.Fatal("last Admin API protection failed")
	}
	resp, _ = perform(t, r.app, "PUT", "/api/admin/v1/authors/me", pendingCookies, `{"displayName":"Example","bioMarkdown":"Safe **bio**","websiteUrl":"https://example.com"}`, r.headers(pendingCookies))
	if resp.StatusCode != 200 {
		t.Fatal("own profile update failed")
	}
	resp, _ = perform(t, r.app, "PUT", "/api/admin/v1/authors/me", pendingCookies, `{"displayName":"Example","bioMarkdown":"","websiteUrl":"","slug":"changed"}`, r.headers(pendingCookies))
	if resp.StatusCode != 400 {
		t.Fatal("read-only slug mutation accepted")
	}
	resp, _ = perform(t, r.app, "PUT", "/api/admin/v1/authors/me", pendingCookies, `{"displayName":"Example"}`, r.headers(pendingCookies))
	if resp.StatusCode != 400 {
		t.Fatal("incomplete profile replacement accepted")
	}
	resp, body = perform(t, r.app, "GET", "/api/admin/v1/missing", adminCookies, "", nil)
	if resp.StatusCode != 404 || errorCode(t, body) != "not_found" {
		t.Fatal("unknown Admin API became SPA")
	}
	resp, _ = perform(t, r.app, "POST", "/api/auth/logout", pendingCookies, "", r.headers(pendingCookies))
	if resp.StatusCode != 204 {
		t.Fatal("logout failed")
	}
	for _, cookie := range resp.Cookies() {
		if cookie.MaxAge >= 0 {
			t.Fatal("logout did not expire cookies")
		}
	}
	resp, _ = perform(t, r.app, "GET", "/api/admin/v1/me", pendingCookies, "", nil)
	if resp.StatusCode != 401 {
		t.Fatal("revoked session still accepted")
	}
}

func TestMonitorOrderingRecoverMetricsAndAccessPrivacy(t *testing.T) {
	r := runtime(t, false)
	adminCookies := r.login(t, 1)
	admin := identity(t, r, adminCookies)
	for _, role := range []string{"editor", "reviewer"} {
		id := int64(2)
		if role == "reviewer" {
			id = 3
		}
		cookies := r.login(t, id)
		p := identity(t, r, cookies)
		if _, err := r.service.ChangeUser(context.Background(), admin, p.User.ID, "approve", role); err != nil {
			t.Fatal(err)
		}
		response, _ := perform(t, r.app, "GET", "/ops/monitor", cookies, "", nil)
		if response.StatusCode != 403 {
			t.Fatal("non-Admin Monitor access")
		}
	}
	response, _ := perform(t, r.app, "GET", "/ops/monitor", nil, "", nil)
	if response.StatusCode != 401 {
		t.Fatal("anonymous Monitor access")
	}
	// Add real downstream test routes after assembly; API paths never hit SPA fallback.
	r.app.Get("/api/probe/ok", func(c fiber.Ctx) error { return c.SendStatus(200) })
	r.app.Get("/api/probe/client-error", func(fiber.Ctx) error { return fault.Validation })
	r.app.Get("/api/probe/error", func(fiber.Ctx) error { return errors.New("private implementation detail") })
	r.app.Get("/api/probe/panic", func(fiber.Ctx) error { panic("private implementation detail") })
	r.app.Post("/api/probe/body", func(c fiber.Ctx) error { return c.Send(c.Body()) })
	r.logs.TakeAll()
	for path, status := range map[string]int{"/api/probe/ok": 200, "/api/probe/client-error": 400, "/api/probe/error": 500, "/api/probe/panic": 500} {
		response, body := perform(t, r.app, "GET", path, nil, "", nil)
		if response.StatusCode != status {
			t.Fatal("middleware status classification incorrect")
		}
		if status >= 400 {
			errorCode(t, body)
		}
		if strings.Contains(string(body), "private implementation detail") {
			t.Fatal("internal error leaked")
		}
	}
	sensitive, _ := auth.RandomToken()
	perform(t, r.app, "GET", "/api/auth/github/callback?code="+sensitive+"&state="+sensitive, nil, "", map[string]string{"Authorization": sensitive, "Cookie": "unrelated=" + sensitive, "User-Agent": sensitive, "X-Request-ID": sensitive})
	perform(t, r.app, "POST", "/api/probe/body", nil, sensitive, nil)
	perform(t, r.app, "GET", "/healthz", nil, "", nil)
	perform(t, r.app, "GET", "/readyz", nil, "", nil)
	response, body := perform(t, r.app, "GET", "/ops/monitor", adminCookies, "", map[string]string{"Accept": "application/json"})
	if response.StatusCode != 200 {
		t.Fatal("Admin Monitor denied")
	}
	var metrics struct {
		HTTP struct {
			Requests, InFlight uint64
			Status             map[string]uint64
		}
		Runtime struct {
			Pause bool `json:"gc_pause_metrics_enabled"`
		}
	}
	if json.Unmarshal(body, &metrics) != nil || metrics.HTTP.Requests != 14 || metrics.HTTP.InFlight != 0 || metrics.HTTP.Status["5xx"] != 2 || metrics.HTTP.Status["4xx"] != 2 || metrics.Runtime.Pause {
		t.Fatal("app-wide Monitor/Recover metrics incorrect")
	}
	entries := r.logs.All()
	if len(entries) != 6 {
		t.Fatalf("access logging skip/order mismatch: %d records", len(entries))
	}
	for _, entry := range entries {
		fields := entry.ContextMap()
		encoded, _ := json.Marshal(fields)
		if strings.Contains(string(encoded), sensitive) || strings.Contains(string(encoded), "private implementation detail") {
			t.Fatal("sensitive request/response data logged")
		}
		for _, key := range []string{"url", "ip", "ua", "body", "resBody", "Authorization", "cookies", "error"} {
			if _, ok := fields[key]; ok {
				t.Fatal("forbidden access field")
			}
		}
		if fields["request_id"] == nil || fields["path"] == nil || fields["status"] == nil || fields["latency"] == nil || fields["method"] == nil {
			t.Fatal("required access fields missing")
		}
		if fields["status"] == int64(500) && entry.Level != zapcore.ErrorLevel {
			t.Fatal("consumed error not logged at error level")
		}
	}
	// Dashboard has no external fonts or scripts in the pinned Monitor implementation.
	_, body = perform(t, r.app, "GET", "/ops/monitor", adminCookies, "", map[string]string{"Accept": "text/html"})
	if strings.Contains(string(body), "fonts.googleapis.com") || strings.Contains(string(body), "cdn.jsdelivr.net") {
		t.Fatal("Monitor loads external dashboard dependencies")
	}
}

func TestReadinessAndJSONRouteBoundaries(t *testing.T) {
	r := runtime(t, false)
	for _, path := range []string{"/api/missing", "/ops/missing", "/healthz/missing", "/readyz/missing"} {
		response, body := perform(t, r.app, "GET", path, nil, "", nil)
		if response.StatusCode != 404 || errorCode(t, body) != "not_found" {
			t.Fatal("reserved route became SPA")
		}
	}
	_ = r.service // database failure must not change liveness
	// Build an empty, unmigrated runtime and prove /readyz does not migrate it.
	pool := testkit.Open(t)
	service := auth.New(pool, r.cfg, nil)
	app := New(Dependencies{Config: r.cfg, DB: pool, Auth: service, Logger: zap.NewNop()})
	response, body := perform(t, app, "GET", "/readyz", nil, "", nil)
	if response.StatusCode != 503 || errorCode(t, body) != "dependency_unavailable" {
		t.Fatal("empty DB considered ready")
	}
	testkit.Migrate(t, pool)
	response, _ = perform(t, app, "GET", "/readyz", nil, "", nil)
	if response.StatusCode != 200 {
		t.Fatal("migrated DB not ready")
	}
	_ = pool.Close()
	response, _ = perform(t, app, "GET", "/readyz", nil, "", nil)
	if response.StatusCode != 503 {
		t.Fatal("closed DB considered ready")
	}
	response, _ = perform(t, app, "GET", "/healthz", nil, "", nil)
	if response.StatusCode != 200 {
		t.Fatal("liveness coupled to persistence")
	}
}
