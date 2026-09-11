package config

import (
	"crypto/rand"
	"strings"
	"testing"
)

func TestProductionConfigFailsClosed(t *testing.T) {
	valid := map[string]string{"APP_ENV": "production", "CMS_BASE_URL": "https://cms.example", "GITHUB_OAUTH_CLIENT_ID": "example-client", "GITHUB_OAUTH_CLIENT_SECRET": rand.Text(), "GITHUB_OAUTH_REDIRECT_URI": "https://cms.example/api/auth/github/callback", "BOOTSTRAP_ADMIN_GITHUB_ID": "1"}
	for k, v := range externalConfig() {
		valid[k] = v
	}
	if cfg, err := Load(func(key string) string { return valid[key] }); err != nil || !cfg.SecureCookies() {
		t.Fatal("valid production config rejected")
	}
	for key, value := range map[string]string{"APP_ENV": "prod", "CMS_BASE_URL": "http://cms.example", "GITHUB_OAUTH_CLIENT_ID": "", "GITHUB_OAUTH_CLIENT_SECRET": "", "GITHUB_OAUTH_REDIRECT_URI": "https://other.example/api/auth/github/callback", "BOOTSTRAP_ADMIN_GITHUB_ID": "-1", "SESSION_TTL": "0s", "OAUTH_STATE_TTL": "invalid", "LOG_LEVEL": "verbose", "LOG_MAX_SIZE_MB": "0", "LOG_MAX_BACKUPS": "-1", "LOG_MAX_AGE_DAYS": "-1", "LOG_COMPRESS": "invalid"} {
		t.Run(key, func(t *testing.T) {
			_, err := Load(func(k string) string {
				if k == key {
					return value
				}
				return valid[k]
			})
			if err == nil {
				t.Fatal("unsafe production configuration accepted")
			}
			if strings.Contains(err.Error(), valid["GITHUB_OAUTH_CLIENT_SECRET"]) {
				t.Fatal("secret leaked in validation")
			}
		})
	}
}

func TestDevelopmentOriginsAndCookies(t *testing.T) {
	for _, origin := range []string{"http://127.0.0.1:5173", "http://localhost:5174", "http://[::1]:46217", "https://cms.example"} {
		cfg, err := Load(func(key string) string {
			if key == "CMS_BASE_URL" {
				return origin
			}
			return ""
		})
		if err != nil || cfg.SecureCookies() != strings.HasPrefix(origin, "https:") {
			t.Fatal("cookie security mode incorrect")
		}
	}
	for _, origin := range []string{"http://example.com", "https://user:pass@cms.example", "https://cms.example/path", "https://cms.example?query=value", "https://cms.example/#fragment"} {
		if _, err := Load(func(key string) string {
			if key == "CMS_BASE_URL" {
				return origin
			}
			return ""
		}); err == nil {
			t.Fatal("unsafe origin accepted")
		}
	}
}
