// Package config reads process environment only; .env loading is explicit tooling.
package config

import (
	"fmt"
	"net"
	"net/url"
	"strconv"
	"strings"
	"time"

	"go.uber.org/zap/zapcore"
)

type Config struct {
	ListenAddr        string
	Environment       string
	BaseURL           string
	DatabasePath      string
	OAuthClientID     string
	OAuthClientSecret string
	OAuthRedirectURI  string
	BootstrapAdminID  int64
	SessionTTL        time.Duration
	StateTTL          time.Duration
	Log               LogConfig
}

type LogConfig struct {
	Level      string
	File       string
	MaxSizeMB  int
	MaxBackups int
	MaxAgeDays int
	Compress   bool
}

func Load(getenv func(string) string) (Config, error) {
	addr := getenv("CMS_LISTEN_ADDR")
	if addr == "" {
		addr = "127.0.0.1:46217"
	}
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return Config{}, fmt.Errorf("CMS_LISTEN_ADDR must be a loopback IP and port")
	}
	ip := net.ParseIP(host)
	number, err := strconv.Atoi(port)
	if ip == nil || !ip.IsLoopback() || err != nil || number < 1024 || number > 65535 {
		return Config{}, fmt.Errorf("CMS_LISTEN_ADDR requires a loopback IP and port 1024–65535")
	}
	value := func(key, fallback string) string {
		if v := getenv(key); v != "" {
			return v
		}
		return fallback
	}
	cfg := Config{
		Environment: value("APP_ENV", "development"), ListenAddr: addr,
		BaseURL: value("CMS_BASE_URL", "http://127.0.0.1:5173"), DatabasePath: value("DATABASE_PATH", "./data/gopheratlas.db"),
		OAuthClientID: getenv("GITHUB_OAUTH_CLIENT_ID"), OAuthClientSecret: getenv("GITHUB_OAUTH_CLIENT_SECRET"),
		OAuthRedirectURI: getenv("GITHUB_OAUTH_REDIRECT_URI"),
		Log:              LogConfig{Level: value("LOG_LEVEL", "info"), File: value("LOG_FILE", "./logs/cms.jsonl")},
	}
	invalid := func(key string) (Config, error) { return Config{}, fmt.Errorf("invalid or missing %s", key) }
	if cfg.Environment != "development" && cfg.Environment != "production" {
		return invalid("APP_ENV")
	}
	base, err := url.Parse(cfg.BaseURL)
	if err != nil || base.User != nil || base.RawQuery != "" || base.Fragment != "" || base.Host == "" || (base.Path != "" && base.Path != "/") {
		return invalid("CMS_BASE_URL")
	}
	if base.Scheme != "https" && !(cfg.Environment == "development" && base.Scheme == "http" && loopbackHost(base.Hostname())) {
		return invalid("CMS_BASE_URL (HTTPS or development loopback HTTP required)")
	}
	cfg.BaseURL = base.Scheme + "://" + base.Host
	if v := getenv("BOOTSTRAP_ADMIN_GITHUB_ID"); v != "" {
		cfg.BootstrapAdminID, err = strconv.ParseInt(v, 10, 64)
		if err != nil || cfg.BootstrapAdminID <= 0 {
			return invalid("BOOTSTRAP_ADMIN_GITHUB_ID")
		}
	}
	hasAuth := cfg.OAuthClientID != "" || cfg.OAuthClientSecret != "" || cfg.OAuthRedirectURI != ""
	if cfg.Environment == "production" || hasAuth {
		if cfg.OAuthClientID == "" {
			return invalid("GITHUB_OAUTH_CLIENT_ID")
		}
		if cfg.OAuthClientSecret == "" {
			return invalid("GITHUB_OAUTH_CLIENT_SECRET")
		}
		redirect, err := url.Parse(cfg.OAuthRedirectURI)
		if err != nil || redirect.User != nil || redirect.RawQuery != "" || redirect.Fragment != "" || redirect.Scheme+"://"+redirect.Host != cfg.BaseURL || redirect.Path != "/api/auth/github/callback" {
			return invalid("GITHUB_OAUTH_REDIRECT_URI (must match CMS origin and callback path)")
		}
	}
	if cfg.Environment == "production" && cfg.BootstrapAdminID == 0 {
		return invalid("BOOTSTRAP_ADMIN_GITHUB_ID")
	}
	for _, entry := range []struct {
		key, fallback string
		target        *time.Duration
	}{
		{"SESSION_TTL", "168h", &cfg.SessionTTL}, {"OAUTH_STATE_TTL", "10m", &cfg.StateTTL},
	} {
		*entry.target, err = time.ParseDuration(value(entry.key, entry.fallback))
		if err != nil || *entry.target < time.Second {
			return invalid(entry.key)
		}
	}
	for _, entry := range []struct {
		key, fallback string
		min           int
		target        *int
	}{
		{"LOG_MAX_SIZE_MB", "100", 1, &cfg.Log.MaxSizeMB}, {"LOG_MAX_BACKUPS", "10", 0, &cfg.Log.MaxBackups}, {"LOG_MAX_AGE_DAYS", "30", 0, &cfg.Log.MaxAgeDays},
	} {
		*entry.target, err = strconv.Atoi(value(entry.key, entry.fallback))
		if err != nil || *entry.target < entry.min || *entry.target > 100000 {
			return invalid(entry.key)
		}
	}
	cfg.Log.Compress, err = strconv.ParseBool(value("LOG_COMPRESS", "true"))
	if err != nil {
		return invalid("LOG_COMPRESS")
	}
	var level zapcore.Level
	if err := level.UnmarshalText([]byte(cfg.Log.Level)); err != nil {
		return invalid("LOG_LEVEL")
	}
	return cfg, nil
}

func loopbackHost(host string) bool {
	ip := net.ParseIP(host)
	return host == "localhost" || (ip != nil && ip.IsLoopback())
}

func (c Config) SecureCookies() bool { return strings.HasPrefix(c.BaseURL, "https://") }
