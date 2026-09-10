# Deployment boundary (not implemented in P0-0)

No deployment target or production credentials are needed for `make check`.
P0-1 adds an authenticated CMS and embedded Admin; production installation and
cutover remain later work. Do not deploy the unauthenticated bootstrap shell.

Planned CMS: dedicated unprivileged `gopheratlas` systemd user, binary under
`/opt/gopheratlas/bin`, database under `/var/lib/gopheratlas`, secret environment
under `/etc/gopheratlas`, rotating logs under `/var/log/gopheratlas`. Bind loopback;
proxy HTTPS only on Tailscale. No Docker, public listener or public CI runner.

Installation order will be backup → explicit goose migration → binary install →
restart → readiness → private Admin verification. Consider NoNewPrivileges,
PrivateTmp, ProtectSystem=strict, ProtectHome and tightly scoped ReadWritePaths.
Test these settings against the implemented runtime before publishing unit files.
