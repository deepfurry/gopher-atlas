package config

import (
	"crypto/rand"
	"strings"
	"testing"
)

func externalConfig() map[string]string {
	return map[string]string{
		"R2_ENDPOINT": "https://r2.example", "R2_ACCESS_KEY_ID": rand.Text(), "R2_SECRET_ACCESS_KEY": rand.Text(),
		"R2_ASSETS_BUCKET": "gopheratlas-assets", "R2_CONTENT_BUCKET": "gopheratlas-content", "R2_ASSETS_PUBLIC_URL": "https://assets.gopheratlas.com/",
		"CLOUDFLARE_DEPLOY_HOOK_URL": "https://hooks.example/" + rand.Text(), "PUBLIC_SITE_URL": "https://staging.example/",
	}
}
func TestPublicationConfigurationAllOrNothing(t *testing.T) {
	empty := func(string) string { return "" }
	p, err := publicationConfig(empty, false)
	if err != nil || p.Configured() {
		t.Fatal("unconfigured development")
	}
	if _, err = publicationConfig(empty, true); err == nil {
		t.Fatal("unconfigured production")
	}
	env := externalConfig()
	get := func(k string) string { return env[k] }
	p, err = publicationConfig(get, true)
	if err != nil || !p.Configured() || p.AssetsPublicURL != "https://assets.gopheratlas.com" || p.PublicSiteURL != "https://staging.example" {
		t.Fatal("complete configuration")
	}
	for key := range env {
		v := env[key]
		env[key] = ""
		_, err := publicationConfig(get, false)
		env[key] = v
		if err == nil {
			t.Fatal("partial configuration accepted", key)
		}
		if strings.Contains(err.Error(), env["R2_SECRET_ACCESS_KEY"]) {
			t.Fatal("secret in error")
		}
	}
	for key, value := range map[string]string{"R2_ENDPOINT": "http://r2.example", "R2_ASSETS_PUBLIC_URL": "https://uncontrolled.example", "PUBLIC_SITE_URL": "https://user:pass@staging.example", "R2_CONTENT_BUCKET": "../bad", "CLOUDFLARE_DEPLOY_HOOK_URL": "https://hooks.example/#fragment"} {
		old := env[key]
		env[key] = value
		if _, err := publicationConfig(get, true); err == nil {
			t.Fatal("invalid publication config accepted", key)
		}
		env[key] = old
	}
}
