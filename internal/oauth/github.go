// Package oauth resolves identity; provider credentials never leave this boundary.
package oauth

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/deepfurry/gopher-atlas/internal/fault"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/github"
)

type Identity struct {
	ID                     int64
	Login, Name, AvatarURL string
}
type Provider interface {
	AuthorizationURL(state string) string
	Identity(context.Context, string) (Identity, error)
}

type GitHub struct {
	config  oauth2.Config
	client  *http.Client
	userURL string
}

func NewGitHub(clientID, secret, redirect string) *GitHub {
	return &GitHub{
		config:  oauth2.Config{ClientID: clientID, ClientSecret: secret, RedirectURL: redirect, Endpoint: github.Endpoint},
		client:  &http.Client{Timeout: 10 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }},
		userURL: "https://api.github.com/user",
	}
}

func (g *GitHub) AuthorizationURL(state string) string { return g.config.AuthCodeURL(state) }

func (g *GitHub) Identity(ctx context.Context, code string) (Identity, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	ctx = context.WithValue(ctx, oauth2.HTTPClient, g.client)
	token, err := g.config.Exchange(ctx, code)
	if err != nil || token.AccessToken == "" {
		return Identity{}, fault.OAuth
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, g.userURL, nil)
	if err != nil {
		return Identity{}, fault.OAuth
	}
	token.SetAuthHeader(request)
	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	response, err := g.client.Do(request)
	if err != nil {
		return Identity{}, fault.OAuth
	}
	defer response.Body.Close()
	var user struct {
		ID        int64  `json:"id"`
		Login     string `json:"login"`
		Name      string `json:"name"`
		AvatarURL string `json:"avatar_url"`
	}
	if response.StatusCode != http.StatusOK || json.NewDecoder(io.LimitReader(response.Body, 64<<10)).Decode(&user) != nil || user.ID <= 0 || strings.TrimSpace(user.Login) == "" || len(user.Login) > 100 {
		return Identity{}, fault.OAuth
	}
	return Identity{ID: user.ID, Login: user.Login, Name: user.Name, AvatarURL: user.AvatarURL}, nil
}
