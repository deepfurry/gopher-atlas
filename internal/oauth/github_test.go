package oauth

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/deepfurry/gopher-atlas/internal/fault"
	"golang.org/x/oauth2"
)

func ephemeral() string {
	value := make([]byte, 32)
	if _, err := rand.Read(value); err != nil {
		panic(err)
	}
	return hex.EncodeToString(value)
}
func TestGitHubExchangeUsesNumericIdentityAndDiscardsProviderErrors(t *testing.T) {
	secret, code, access := ephemeral(), ephemeral(), ephemeral()
	fail := false
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/token":
			if r.ParseForm() != nil || r.Form.Get("code") != code {
				t.Error("OAuth code not exchanged")
			}
			w.Header().Set("Content-Type", "application/json")
			if fail {
				w.WriteHeader(400)
				_ = json.NewEncoder(w).Encode(map[string]string{"error": secret})
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]string{"access_token": access, "token_type": "bearer"})
		case "/user":
			if r.Header.Get("Authorization") != "Bearer "+access {
				t.Error("identity lookup was not authenticated")
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"id": int64(123), "login": "example", "name": "Example", "avatar_url": "https://avatars.githubusercontent.com/u/123"})
		default:
			w.WriteHeader(404)
		}
	}))
	defer upstream.Close()
	provider := NewGitHub("example-client", secret, "https://cms.example/api/auth/github/callback")
	provider.config.Endpoint = oauth2.Endpoint{AuthURL: upstream.URL + "/authorize", TokenURL: upstream.URL + "/token", AuthStyle: oauth2.AuthStyleInParams}
	provider.userURL = upstream.URL + "/user"
	identity, err := provider.Identity(context.Background(), code)
	if err != nil || identity.ID != 123 || identity.Login != "example" {
		t.Fatal("identity resolution failed")
	}
	serialized, _ := json.Marshal(identity)
	if strings.Contains(string(serialized), access) || strings.Contains(string(serialized), secret) {
		t.Fatal("provider credentials escaped identity boundary")
	}
	fail = true
	if _, err := provider.Identity(context.Background(), code); !errors.Is(err, fault.OAuth) {
		t.Fatal("unsafe provider error exposed")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := provider.Identity(ctx, code); !errors.Is(err, fault.OAuth) {
		t.Fatal("cancelled exchange succeeded")
	}
}
