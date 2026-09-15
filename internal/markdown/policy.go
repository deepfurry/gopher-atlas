package markdown

import (
	"errors"
	"net"
	"net/url"
	"regexp"
	"strings"
)

const ProductionAssetOrigin = "https://assets.gopheratlas.com"

// Policy is immutable after construction; its zero value is Production.
type Policy struct{ localBase string }

func DevelopmentPolicy(base string) (Policy, error) {
	u, err := url.Parse(base)
	if err != nil || !noControls(base) || u.Scheme != "http" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.Path != "/__dev/assets" || u.Port() == "" {
		return Policy{}, errors.New("invalid development asset origin")
	}
	ip := net.ParseIP(u.Hostname())
	if u.Hostname() != "localhost" && (ip == nil || !ip.IsLoopback()) {
		return Policy{}, errors.New("invalid development asset origin")
	}
	return Policy{localBase: base}, nil
}
func (p Policy) AssetBaseURL() string {
	if p.localBase != "" {
		return p.localBase
	}
	return ProductionAssetOrigin
}

var assetKeyPattern = regexp.MustCompile(`^media/sha256/([a-f0-9]{2})/([a-f0-9]{64})\.(png|jpg|webp|gif)$`)

func ValidAssetKey(key string) bool {
	parts := assetKeyPattern.FindStringSubmatch(key)
	return len(parts) == 4 && parts[1] == parts[2][:2]
}
func (p Policy) AssetURL(value string) bool {
	return strings.HasPrefix(value, p.AssetBaseURL()+"/") && ValidAssetKey(strings.TrimPrefix(value, p.AssetBaseURL()+"/"))
}
func (p Policy) Image(value string) bool {
	if p.localBase != "" {
		return p.AssetURL(value)
	}
	u, err := url.Parse(value)
	return WebURL(value, true) && err == nil && u.Host == "assets.gopheratlas.com"
}
