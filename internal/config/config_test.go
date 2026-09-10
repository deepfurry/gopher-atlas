package config

import "testing"

func TestListenBoundary(t *testing.T) {
	for _, tc := range []struct {
		addr string
		ok   bool
	}{
		{"", true}, {"127.0.0.1:46217", true}, {"[::1]:46218", true},
		{"0.0.0.0:46217", false}, {":46217", false}, {"192.168.1.1:46217", false},
		{"example.com:46217", false}, {"127.0.0.1:80", false}, {"127.0.0.1:70000", false},
		{"127.0.0.1:0", false}, {"127.0.0.1:invalid", false}, {"invalid", false},
	} {
		t.Run(tc.addr, func(t *testing.T) {
			cfg, err := Load(func(string) string { return tc.addr })
			if (err == nil) != tc.ok {
				t.Fatalf("Load error = %v, want valid = %v", err, tc.ok)
			}
			if tc.addr == "" && cfg.ListenAddr != "127.0.0.1:46217" {
				t.Fatalf("unsafe default: %q", cfg.ListenAddr)
			}
		})
	}
}
