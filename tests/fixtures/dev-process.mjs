// Synthetic process trees for the cross-platform development supervisor tests.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { supervise } from '../../scripts/dev-processes.mjs';
import { setTimeout as delay } from 'node:timers/promises';

const [mode, directory, outcome] = process.argv.slice(2);
const fixture = fileURLToPath(import.meta.url);
if (mode === 'manager') {
  process.on('message', () => process.emit('SIGINT'));
  const command = (role) => ({
    name: role,
    command: process.execPath,
    args: [fixture, role, directory, outcome],
  });
  const timer = setInterval(() => {
    if (
      (outcome === 'restart'
        ? ['cms.json', 'admin.json', 'public.json']
        : ['tree.json', 'leaf.json', 'exit.json']
      ).every((file) => existsSync(join(directory, file)))
    ) {
      clearInterval(timer);
      process.send?.('ready');
    }
  }, 20);
  const commands =
    outcome === 'spawn-error'
      ? [{ name: 'missing', command: join(directory, 'no-such-executable') }]
      : outcome === 'restart'
        ? [command('cms'), command('admin'), command('public')]
        : outcome === 'output'
          ? [command('output')]
          : [command('tree'), command('exit')];
  process.exitCode = await supervise(commands, {
    graceMs: 150,
    onStart:
      outcome === 'restart'
        ? async ({ restart, signal }) => {
            while (
              !signal.aborted &&
              !existsSync(join(directory, 'restart.flag'))
            ) {
              try {
                await delay(20, undefined, { signal });
              } catch {
                return;
              }
            }
            if (signal.aborted) return;
            await restart('public');
            writeFileSync(join(directory, 'restarted.flag'), 'done');
          }
        : undefined,
  });
  if (outcome === 'output') {
    console.log('supervisor output still open');
    console.error('supervisor errors still open');
  }
  clearInterval(timer);
  process.disconnect?.();
} else if (mode === 'output') {
  // Exceed pipe buffering and end naturally so the supervisor must drain both
  // streams without losing the trailing diagnostic or closing its own streams.
  process.stdout.write('synthetic stdout\n'.repeat(8192));
  process.stderr.write('synthetic stderr\n'.repeat(8192));
  console.error('synthetic startup failure');
  process.exitCode = 7;
} else if (mode === 'exit') {
  writeFileSync(join(directory, 'exit.json'), '{}');
  setInterval(() => {
    if (existsSync(join(directory, 'exit.flag'))) process.exit(Number(outcome));
  }, 20);
} else {
  if (mode === 'tree')
    spawn(process.execPath, [fixture, 'leaf', directory], {
      stdio: 'inherit',
      windowsHide: true,
    });
  if (mode === 'leaf') process.on('SIGTERM', () => {}); // Exercise bounded POSIX force cleanup.
  const server = createServer();
  server.listen(0, '127.0.0.1', () =>
    writeFileSync(
      join(directory, `${mode}.json`),
      JSON.stringify({ pid: process.pid, port: server.address().port }),
    ),
  );
}
