// Package config reads runtime configuration without loading local .env files.
package config

import (
	"fmt"
	"net"
	"strconv"
)

type Config struct {
	ListenAddr string
}

// Load is deliberately loopback-only while P0-0 has no authentication.
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
	return Config{ListenAddr: addr}, nil
}
