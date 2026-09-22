import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  chmodSync,
  readdirSync,
  existsSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

// Real shell/files/copy/rename/flock; only privilege, service, HTTP and builds are fakes.
// No production paths, credentials, services or network are used by these tests.
const mock = `#!/bin/bash
set -eu
cmd=$(basename "$0")
echo "$cmd $*" >>"$TEST_ROOT/events"
case "$cmd" in
 id) echo "\${MOCK_ROOT:-1000}" ;;
 sudo) [[ \${1:-} != -v ]] || exit 0; export MOCK_ROOT=0; exec "$@" ;;
 pnpm|go) exit 0 ;;
 make)
   [[ \${FAIL_BUILD:-0} != 1 ]] || exit 1
   mkdir -p "$TEST_ROOT/repo/.cache/bin"
   printf 'new-binary' >"$TEST_ROOT/repo/.cache/bin/gopheratlas-cms"
   chmod +x "$TEST_ROOT/repo/.cache/bin/gopheratlas-cms"
   ;;
 systemctl)
   case "$1" in
    show) if [[ $4 == ActiveState ]]; then cat "$TEST_ROOT/state"; else if [[ $(cat "$TEST_ROOT/state") == active ]]; then echo 123; else echo 0; fi; fi ;;
    stop) echo inactive >"$TEST_ROOT/state" ;;
    start) echo active >"$TEST_ROOT/state" ;;
    is-active) [[ $(cat "$TEST_ROOT/state") == active ]] ;;
   esac ;;
 curl) [[ \${FAIL_HEALTH:-0} != 1 ]] ;;
 sleep) exit 0 ;;
 cp)
   if [[ \${FAIL_BACKUP:-0} == 1 && \${*: -2:1} == "$TEST_ROOT/data" ]]; then exit 1; fi
   exec /bin/cp "$@" ;;
 install)
   args=()
   while (( $# )); do
     case "$1" in -o|-g) shift 2;; *) args+=("$1"); shift;; esac
   done
   exec /usr/bin/install "\${args[@]}" ;;
esac
`;

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'gopheratlas-production-'));
  roots.push(root);
  for (const dir of ['repo/scripts', 'bin', 'data', 'mock-bin'])
    mkdirSync(join(root, dir), { recursive: true });
  writeFileSync(
    join(root, 'repo/scripts/production.sh'),
    readFileSync(resolve('scripts/production.sh')),
  );
  writeFileSync(join(root, 'repo/.gitignore'), '.cache/\n');
  writeFileSync(join(root, 'bin/gopheratlas-cms'), 'old-binary');
  writeFileSync(join(root, 'data/gopheratlas.db'), 'database-before-update');
  writeFileSync(join(root, 'data/gopheratlas.db-wal'), 'committed-wal-pages');
  writeFileSync(join(root, 'state'), 'active\n');
  for (const name of [
    'id',
    'sudo',
    'pnpm',
    'go',
    'make',
    'systemctl',
    'curl',
    'sleep',
    'cp',
    'install',
  ]) {
    const file = join(root, 'mock-bin', name);
    writeFileSync(file, mock);
    chmodSync(file, 0o755);
  }
  const git = (...args: string[]) => {
    const r = spawnSync(
      'git',
      [
        '-c',
        `safe.directory=${join(root, 'repo')}`,
        '-C',
        join(root, 'repo'),
        ...args,
      ],
      { encoding: 'utf8' },
    );
    if (r.status !== 0) throw new Error(r.stderr);
  };
  git('init', '-b', 'main');
  git('add', '.');
  git(
    '-c',
    'user.name=Operations test',
    '-c',
    'user.email=operations@example.invalid',
    'commit',
    '-m',
    'test checkout',
  );
  const run = (
    action: string,
    extra: Record<string, string> = {},
    locked = false,
  ) =>
    spawnSync(
      locked ? 'flock' : 'bash',
      [
        ...(locked ? ['-x', join(root, '.maintenance.lock'), 'bash'] : []),
        join(root, 'repo/scripts/production.sh'),
        action,
      ],
      {
        env: {
          ...process.env,
          PATH: `${join(root, 'mock-bin')}:${process.env.PATH}`,
          TEST_ROOT: root,
          GOPHERATLAS_ROOT: root,
          ...extra,
        },
        encoding: 'utf8',
        timeout: 10000,
      },
    );
  const events = () =>
    existsSync(join(root, 'events'))
      ? readFileSync(join(root, 'events'), 'utf8')
      : '';
  const backups = () =>
    readdirSync(join(root, 'backups')).map((name) =>
      join(root, 'backups', name),
    );
  return { root, run, git, events, backups };
}

describe.skipIf(process.platform !== 'linux')(
  'Production operator scripts (isolated Linux host)',
  () => {
    it('rejects overlapping maintenance before stopping the service', () => {
      const s = setup(),
        r = s.run('backup', {}, true);
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('Another production maintenance');
      expect(s.events()).not.toContain('systemctl stop');
    });
    it('builds before stopping, preserves WAL and old binary, replaces atomically and verifies health', () => {
      const s = setup(),
        r = s.run('update');
      expect(r.status, r.stderr).toBe(0);
      expect(s.events().indexOf('make build-cms')).toBeLessThan(
        s.events().indexOf('systemctl stop'),
      );
      expect(readFileSync(join(s.root, 'bin/gopheratlas-cms'), 'utf8')).toBe(
        'new-binary',
      );
      const backup = s.backups()[0];
      expect(statSync(backup).mode & 0o777).toBe(0o700);
      expect(
        readFileSync(join(backup, 'data/gopheratlas.db-wal'), 'utf8'),
      ).toBe('committed-wal-pages');
      expect(readFileSync(join(backup, 'gopheratlas-cms'), 'utf8')).toBe(
        'old-binary',
      );
      expect(existsSync(join(backup, 'COMPLETE'))).toBe(true);
      expect(readFileSync(join(s.root, 'state'), 'utf8').trim()).toBe('active');
      expect(s.events()).not.toMatch(/db-up|git pull|cms\.env/);
    });
    it('does not stop production when the build fails', () => {
      const s = setup();
      expect(s.run('update', { FAIL_BUILD: '1' }).status).not.toBe(0);
      expect(s.events()).not.toContain('systemctl stop');
      expect(readFileSync(join(s.root, 'bin/gopheratlas-cms'), 'utf8')).toBe(
        'old-binary',
      );
    });
    it('resumes the original service on backup failure without replacing its binary', () => {
      const s = setup();
      expect(s.run('update', { FAIL_BACKUP: '1' }).status).not.toBe(0);
      expect(readFileSync(join(s.root, 'state'), 'utf8').trim()).toBe('active');
      expect(readFileSync(join(s.root, 'bin/gopheratlas-cms'), 'utf8')).toBe(
        'old-binary',
      );
      expect(existsSync(join(s.backups()[0], 'COMPLETE'))).toBe(false);
    });
    it('stops an unhealthy new binary and preserves backup and current DB without automatic rollback', () => {
      const s = setup(),
        r = s.run('update', { FAIL_HEALTH: '1' });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('no database rollback');
      expect(readFileSync(join(s.root, 'state'), 'utf8').trim()).toBe(
        'inactive',
      );
      expect(readFileSync(join(s.root, 'bin/gopheratlas-cms'), 'utf8')).toBe(
        'new-binary',
      );
      expect(readFileSync(join(s.root, 'data/gopheratlas.db'), 'utf8')).toBe(
        'database-before-update',
      );
      expect(existsSync(join(s.backups()[0], 'COMPLETE'))).toBe(true);
    });
    it.each(['active', 'inactive'])(
      'backs up separately and preserves %s service state and previous backups',
      (state) => {
        const s = setup();
        writeFileSync(join(s.root, 'state'), state + '\n');
        expect(s.run('backup').status).toBe(0);
        expect(s.run('backup').status).toBe(0);
        expect(s.backups()).toHaveLength(2);
        expect(readFileSync(join(s.root, 'state'), 'utf8').trim()).toBe(state);
        expect(s.events()).not.toContain('make build-cms');
      },
    );
    it('rejects wrong branches and dirty checkouts before builds or service changes', () => {
      const s = setup();
      s.git('switch', '-c', 'dev');
      expect(s.run('update').stderr).toContain('require main');
      s.git('switch', 'main');
      writeFileSync(join(s.root, 'repo/local-file'), 'keep me');
      expect(s.run('update').stderr).toContain('must be clean');
      expect(s.events()).not.toMatch(/make build-cms|systemctl stop/);
    });
  },
);
