#!/usr/bin/env bash
# Linux/systemd operator commands. Never source cms.env or repository .env.
set -euo pipefail

fail() { echo "ERROR: $*" >&2; exit 1; }
[[ $(uname -s) == Linux ]] || fail 'Production maintenance requires Linux/systemd.'
SCRIPT=$(realpath -- "${BASH_SOURCE[0]}")
REPO=$(dirname -- "$(dirname -- "$SCRIPT")")
ROOT=$(realpath -e -- "${GOPHERATLAS_ROOT:-/srv/gopheratlas}")
SERVICE=gopheratlas-cms.service
[[ $ROOT != / && $REPO == "$ROOT/repo" ]] || fail 'Run from the deployed ROOT/repo checkout.'
ACTION=${1:-}

checkout() {
  # sudo may inspect the operator-owned checkout; trust only this exact path.
  git -c safe.directory="$REPO" -C "$REPO" "$@"
}
clean_main() {
  [[ $(checkout branch --show-current) == main ]] || fail 'Production updates require main.'
  [[ -z $(checkout status --porcelain) ]] || fail 'Repository working tree must be clean.'
}

case "$ACTION" in
  update)
    [[ $(id -u) != 0 ]] || fail 'Run make prod-update as the repository owner, without sudo.'
    clean_main
    COMMIT=$(checkout rev-parse HEAD)
    cd "$REPO"
    # Keep concurrent updates from writing the same build artifacts.
    mkdir -p .cache
    exec 8>.cache/production-build.lock
    flock -n 8 || fail 'Another production build is running.'
    sudo -v
    pnpm install --frozen-lockfile
    go mod download
    make build-cms
    clean_main
    [[ $(checkout rev-parse HEAD) == "$COMMIT" ]] || fail 'Checkout changed during build.'
    sudo env GOPHERATLAS_ROOT="$ROOT" bash "$SCRIPT" _update "$COMMIT"
    exit
    ;;
  backup)
    sudo env GOPHERATLAS_ROOT="$ROOT" bash "$SCRIPT" _backup
    exit
    ;;
  _update|_backup)
    [[ $(id -u) == 0 ]] || fail 'Internal maintenance requires sudo.'
    ;;
  *) fail 'Usage: make prod-update | make prod-backup' ;;
esac

for command in systemctl curl flock install cp mv mktemp sha256sum stat; do
  command -v "$command" >/dev/null || fail "Missing command: $command"
done
for directory in data bin; do
  [[ $(realpath -e -- "$ROOT/$directory") == "$ROOT/$directory" ]] || fail "$directory must be a real directory inside ROOT."
done
[[ -f $ROOT/data/gopheratlas.db && ! -L $ROOT/data/gopheratlas.db ]] || fail 'Existing database missing or symlinked.'
BIN="$ROOT/bin/gopheratlas-cms"
[[ -f $BIN && ! -L $BIN ]] || fail 'Existing CMS binary missing or symlinked.'
exec 9>"$ROOT/.maintenance.lock"
flock -n 9 || fail 'Another production maintenance operation is running.'
STATE=$(systemctl show "$SERVICE" -p ActiveState --value)
[[ $STATE == active || $STATE == inactive || $STATE == failed ]] || fail 'Service is transitioning; retry after it settles.'
WAS_ACTIVE=0
[[ $STATE != active ]] || WAS_ACTIVE=1
STOPPED=0
REPLACED=0
STAGED=''
BACKUP=''

cleanup() {
  local result=$?
  trap - EXIT
  [[ -z $STAGED ]] || rm -f -- "$STAGED"
  if (( result != 0 && STOPPED )); then
    if (( REPLACED == 0 && WAS_ACTIVE )); then
      echo 'Maintenance failed before replacement; restarting the original CMS.' >&2
      systemctl start "$SERVICE" || echo 'Original CMS restart failed; inspect systemd.' >&2
    elif (( REPLACED )); then
      systemctl stop "$SERVICE" || true
      echo "Installation/startup did not complete; service stopped. Backup: $BACKUP" >&2
      echo 'Inspect the failure before recovery; no database rollback was attempted.' >&2
    fi
  fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if [[ $ACTION == _update ]]; then
  clean_main
  [[ $(checkout rev-parse HEAD) == "${2:-}" ]] || fail 'Checkout changed before installation.'
  NEW="$REPO/.cache/bin/gopheratlas-cms"
  [[ -x $NEW && ! -L $NEW ]] || fail 'Build the embedded CMS first.'
  STAGED=$(mktemp "$ROOT/bin/.gopheratlas-cms.XXXXXX")
  install -o "$(stat -c %u "$BIN")" -g "$(stat -c %g "$BIN")" -m 0750 "$NEW" "$STAGED"
fi

[[ ! -L $ROOT/backups ]] || fail 'Backup directory must not be a symlink.'
install -d -o root -g root -m 0700 "$ROOT/backups"
BACKUP=$(mktemp -d "$ROOT/backups/$(date -u +%Y%m%dT%H%M%SZ).XXXXXX")
cp -a -- "$BIN" "$BACKUP/gopheratlas-cms"
STOPPED=1
systemctl stop "$SERVICE"
[[ $(systemctl show "$SERVICE" -p MainPID --value) == 0 ]] || fail 'CMS did not stop.'
STATE=$(systemctl show "$SERVICE" -p ActiveState --value)
[[ $STATE == inactive || $STATE == failed ]] || fail 'CMS is not stopped.'
# With the sole writer stopped, preserve the DB and any surviving WAL/SHM together.
cp -a -- "$ROOT/data" "$BACKUP/data"
(
  cd "$BACKUP"
  sha256sum gopheratlas-cms data/gopheratlas.db* >SHA256SUMS
  sha256sum -c SHA256SUMS >/dev/null
  printf 'operation=%s\ncheckout_commit=%s\nprevious_service_state=%s\n' \
    "${ACTION#_}" "$(checkout rev-parse HEAD)" "$WAS_ACTIVE" >metadata.txt
  touch COMPLETE
)
echo "Backup completed: $BACKUP"

if [[ $ACTION == _update ]]; then
  # Same-directory rename: readers see one complete binary, never a partial copy.
  REPLACED=1
  mv -fT -- "$STAGED" "$BIN"
  STAGED=''
fi
if [[ $ACTION == _update ]] || (( WAS_ACTIVE )); then
  systemctl start "$SERVICE"
  READY=0
  for attempt in {1..30}; do
    if curl -fsS --max-time 2 http://127.0.0.1:46217/readyz >/dev/null 2>&1; then
      READY=1
      break
    fi
    sleep 1
  done
  (( READY )) || fail 'Readiness check failed.'
  curl -fsS --max-time 5 http://127.0.0.1:46217/healthz
  echo
  systemctl is-active --quiet "$SERVICE" || fail 'CMS is not active.'
fi
STOPPED=0
if [[ $ACTION == _update ]]; then
  echo "CMS updated to ${2}; health and readiness passed."
else
  echo 'Backup complete; original service state preserved.'
fi
