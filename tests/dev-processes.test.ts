import { fork, spawnSync, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createConnection } from 'node:net';
import { afterEach, expect, it, vi } from 'vitest';

const directories: string[] = [];
const managers: ChildProcess[] = [];
afterEach(async () => {
  for (const child of managers.splice(0)) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    const exited = once(child, 'exit');
    if (process.platform === 'win32')
      spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
    else child.kill('SIGTERM');
    await exited;
  }
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function launch(outcome: string) {
  const directory = mkdtempSync(join(tmpdir(), 'gopheratlas-dev-process-'));
  directories.push(directory);
  const child = fork(
    resolve('tests/fixtures/dev-process.mjs'),
    ['manager', directory, outcome],
    {
      execArgv: [],
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      windowsHide: true,
    },
  );
  managers.push(child);
  // Drain output; fixtures never include application configuration or credentials.
  let stdout = '',
    stderr = '';
  child.stdout?.setEncoding('utf8').on('data', (chunk) => (stdout += chunk));
  child.stderr?.setEncoding('utf8').on('data', (chunk) => (stderr += chunk));
  const exited = once(child, 'close');
  const ready = once(child, 'message');
  const ports = () =>
    ['tree', 'leaf'].map(
      (role) =>
        JSON.parse(readFileSync(join(directory, `${role}.json`), 'utf8'))
          .port as number,
    );
  return {
    child,
    directory,
    exited,
    ready,
    ports,
    output: () => ({ stdout, stderr }),
  };
}

async function listening(port: number) {
  return new Promise<boolean>((done) => {
    const socket = createConnection({ port, host: '127.0.0.1' });
    socket.once('connect', () => {
      socket.destroy();
      done(true);
    });
    socket.once('error', () => {
      socket.destroy();
      done(false);
    });
  });
}

for (const code of [0, 7])
  it(`cleans remaining real child/grandchild listeners when any service exits ${code}`, async () => {
    const test = launch(String(code));
    await test.ready;
    const ports = test.ports();
    expect(await Promise.all(ports.map(listening))).toEqual([true, true]);
    writeFileSync(join(test.directory, 'exit.flag'), 'exit');
    expect((await test.exited)[0]).toBe(code);
    expect(await Promise.all(ports.map(listening))).toEqual([false, false]);
  }, 15000);

it('handles Ctrl+C through the supervisor and releases descendant listeners', async () => {
  const test = launch('0');
  await test.ready;
  const ports = test.ports();
  // Windows Node's child.kill is forced termination, not a console Ctrl+C event.
  // Deliver the same SIGINT event to the isolated manager without killing Vitest.
  test.child.send('interrupt');
  expect((await test.exited)[0]).toBe(130);
  expect(await Promise.all(ports.map(listening))).toEqual([false, false]);
}, 15000);

it.skipIf(process.platform === 'win32')(
  'handles a real POSIX SIGTERM and force-cleans a stubborn grandchild',
  async () => {
    const test = launch('0');
    await test.ready;
    const ports = test.ports();
    test.child.kill('SIGTERM');
    expect((await test.exited)[0]).toBe(143);
    expect(await Promise.all(ports.map(listening))).toEqual([false, false]);
  },
  15000,
);

it('reports a process spawn failure without hanging', async () => {
  const test = launch('spawn-error');
  expect((await test.exited)[0]).toBe(1);
}, 15000);

it('preserves child stdout/stderr and the exit code without closing supervisor output', async () => {
  const test = launch('output');
  expect((await test.exited)[0]).toBe(7);
  const { stdout, stderr } = test.output();
  expect(stdout).toContain('synthetic stdout\n'.repeat(8192));
  expect(stderr).toContain('synthetic stderr\n'.repeat(8192));
  expect(stderr).toContain('synthetic startup failure');
  expect(stdout).toContain('supervisor output still open');
  expect(stderr).toContain('supervisor errors still open');
}, 15000);

it('restarts only Public while CMS/Admin listeners and process identities stay alive', async () => {
  const test = launch('restart');
  await test.ready;
  const read = (role: string) =>
    JSON.parse(readFileSync(join(test.directory, `${role}.json`), 'utf8'));
  const before = ['cms', 'admin', 'public'].map(read);
  writeFileSync(join(test.directory, 'restart.flag'), 'restart');
  await vi.waitFor(() => {
    expect(existsSync(join(test.directory, 'restarted.flag'))).toBe(true);
    expect(read('public').pid).not.toBe(before[2].pid);
  });
  const after = ['cms', 'admin', 'public'].map(read);
  expect(after.slice(0, 2)).toEqual(before.slice(0, 2));
  expect(await Promise.all(after.map((row) => listening(row.port)))).toEqual([
    true,
    true,
    true,
  ]);
  expect(await listening(before[2].port)).toBe(false);
  test.child.send('interrupt');
  expect((await test.exited)[0]).toBe(130);
  expect(await Promise.all(after.map((row) => listening(row.port)))).toEqual([
    false,
    false,
    false,
  ]);
}, 15000);
