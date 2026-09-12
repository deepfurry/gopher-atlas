package legacy

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"time"

	"github.com/deepfurry/gopher-atlas/internal/assets"
)

// Shared address space includes Tailnet/CGNAT, which IsPrivate does not cover.
// Transition and special-purpose ranges must not tunnel a fetch into a LAN.
var specialImageNetworks = []netip.Prefix{
	netip.MustParsePrefix("0.0.0.0/8"),
	netip.MustParsePrefix("100.64.0.0/10"),
	netip.MustParsePrefix("192.0.0.0/24"),
	netip.MustParsePrefix("192.0.2.0/24"),
	netip.MustParsePrefix("198.18.0.0/15"),
	netip.MustParsePrefix("198.51.100.0/24"),
	netip.MustParsePrefix("203.0.113.0/24"),
	netip.MustParsePrefix("240.0.0.0/4"),
	netip.MustParsePrefix("64:ff9b::/96"),
	netip.MustParsePrefix("64:ff9b:1::/48"),
	netip.MustParsePrefix("2001::/23"),
	netip.MustParsePrefix("2001:db8::/32"),
	netip.MustParsePrefix("2002::/16"),
}

func publicImageIP(ip net.IP) bool {
	address, ok := netip.AddrFromSlice(ip)
	if !ok {
		return false
	}
	address = address.Unmap()
	if !address.IsGlobalUnicast() || address.IsPrivate() || address.IsLoopback() || address.IsLinkLocalUnicast() {
		return false
	}
	for _, prefix := range specialImageNetworks {
		if prefix.Contains(address) {
			return false
		}
	}
	return true
}

// DownloadImage has no credentials, no redirects and no private-network access.
// Resolve and dial the same public address to avoid a DNS check/use race.
func DownloadImage(ctx context.Context, address string) ([]byte, error) {
	u, err := url.Parse(address)
	if err != nil || u.Scheme != "https" || u.User != nil || u.Hostname() == "" || (u.Port() != "" && u.Port() != "443") {
		return nil, errors.New("legacy_image_url_invalid")
	}
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = nil
	transport.DialContext = func(ctx context.Context, network, addr string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(addr)
		if err != nil {
			return nil, err
		}
		ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
		if err != nil {
			return nil, errors.New("legacy_image_dns_failed")
		}
		for _, ip := range ips {
			if !publicImageIP(ip.IP) {
				return nil, errors.New("legacy_image_private_address")
			}
		}
		for _, ip := range ips {
			conn, err := (&net.Dialer{Timeout: 10 * time.Second}).DialContext(ctx, network, net.JoinHostPort(ip.String(), port))
			if err == nil {
				return conn, nil
			}
		}
		return nil, errors.New("legacy_image_connection_failed")
	}
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport, Timeout: 30 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, address, nil)
	if err != nil {
		return nil, errors.New("legacy_image_request_invalid")
	}
	response, err := client.Do(req)
	if err != nil {
		return nil, errors.New("legacy_image_download_failed")
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, errors.New("legacy_image_http_failed")
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, assets.MaxFileBytes+1))
	if err != nil {
		return nil, errors.New("legacy_image_read_failed")
	}
	if _, err := assets.Inspect(data); err != nil {
		return nil, err
	}
	return data, nil
}
