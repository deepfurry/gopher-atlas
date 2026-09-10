# 0002 — Tailscale-only private CMS

Date: 2026-09-10. Status: Accepted.

The CMS contains drafts, identity, sessions and operational telemetry. It runs as
a loopback-bound process behind Tailscale-only HTTPS at `blog.go-furry.com`. Public
security groups must not expose its port. A high configurable port avoids common
service collisions but is not a security boundary. No public Cloudflare proxy is
required. Private DNS and optional DNS-01 certificates belong to operations.

GitHub OAuth redirects the user's browser; GitHub does not need an inbound CMS
connection. Future authentication, fixed roles, session/CSRF and endpoint guards
remain mandatory even on the Tailnet. Monitor must be guarded before it runs.

A publicly exposed CMS adds unnecessary attack surface for a private editorial
team. Network-only authorization is also insufficient. We choose both private
reachability and server-enforced identity/policy.

P0-0 enforces loopback IP addresses and ports 1024–65535, defaults to
`127.0.0.1:46217`, exposes liveness only, and does not load `.env` automatically.
P0-1 must test the complete authenticated runtime and embedded UI before deployment.
