package config

import (
	"errors"
	"net/url"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/deepfurry/gopher-atlas/internal/markdown"
)

type Publication struct {
	Mode, LocalRoot                              string
	Endpoint, AccessKeyID, SecretAccessKey       string
	AssetsBucket, ContentBucket, AssetsPublicURL string
	HookURL, PublicSiteURL                       string
}

func (p Publication) Configured() bool {
	return (p.Mode == "local" && p.LocalRoot != "") || p.Endpoint != ""
}

func (p Publication) AssetPolicy() markdown.Policy {
	if p.Mode == "local" {
		policy, err := markdown.DevelopmentPolicy(p.AssetsPublicURL)
		if err == nil {
			return policy
		}
	}
	return markdown.Policy{}
}

func publicationConfig(getenv func(string) string, production bool) (Publication, error) {
	if !production {
		db, addr := getenv("DATABASE_PATH"), getenv("CMS_LISTEN_ADDR")
		if db == "" {
			db = "./data/gopheratlas.db"
		}
		if addr == "" {
			addr = "127.0.0.1:46217"
		}
		base := "http://" + addr + "/__dev/assets"
		if _, err := markdown.DevelopmentPolicy(base); err != nil {
			return Publication{}, err
		}
		return Publication{Mode: "local", LocalRoot: filepath.Join(filepath.Dir(db), "storage"), AssetsBucket: "assets", ContentBucket: "content", AssetsPublicURL: base}, nil
	}
	p := Publication{Mode: "r2"}
	values := []struct {
		key    string
		target *string
	}{
		{"R2_ENDPOINT", &p.Endpoint}, {"R2_ACCESS_KEY_ID", &p.AccessKeyID},
		{"R2_SECRET_ACCESS_KEY", &p.SecretAccessKey}, {"R2_ASSETS_BUCKET", &p.AssetsBucket},
		{"R2_CONTENT_BUCKET", &p.ContentBucket}, {"R2_ASSETS_PUBLIC_URL", &p.AssetsPublicURL},
		{"CLOUDFLARE_DEPLOY_HOOK_URL", &p.HookURL}, {"PUBLIC_SITE_URL", &p.PublicSiteURL},
	}
	count := 0
	for _, v := range values {
		*v.target = getenv(v.key)
		if *v.target != "" {
			count++
		}
	}
	invalid := errors.New("publication configuration must be complete and use valid endpoints, buckets and controlled asset origin")
	if count != len(values) {
		return Publication{}, invalid
	}
	for _, endpoint := range []string{p.Endpoint, p.HookURL, p.PublicSiteURL, p.AssetsPublicURL} {
		u, err := url.Parse(endpoint)
		if err != nil || u.Host == "" || u.User != nil || u.Fragment != "" || strings.ContainsAny(endpoint, "\r\n\t\\") ||
			(u.Scheme != "https" && !(u.Scheme == "http" && !production && loopbackHost(u.Hostname()))) {
			return Publication{}, invalid
		}
	}
	for _, origin := range []string{p.Endpoint, p.PublicSiteURL, p.AssetsPublicURL} {
		u, _ := url.Parse(origin)
		if u.RawQuery != "" || (u.Path != "" && u.Path != "/") {
			return Publication{}, invalid
		}
	}
	p.Endpoint = strings.TrimSuffix(p.Endpoint, "/")
	p.PublicSiteURL = strings.TrimSuffix(p.PublicSiteURL, "/")
	p.AssetsPublicURL = strings.TrimSuffix(p.AssetsPublicURL, "/")
	// Shared Go/TS Markdown validators intentionally accept exactly this origin.
	if p.AssetsPublicURL != "https://assets.gopheratlas.com" {
		return Publication{}, invalid
	}
	bucket := regexp.MustCompile(`^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$`)
	if !bucket.MatchString(p.AssetsBucket) || !bucket.MatchString(p.ContentBucket) || p.AssetsBucket == p.ContentBucket {
		return Publication{}, invalid
	}
	return p, nil
}
