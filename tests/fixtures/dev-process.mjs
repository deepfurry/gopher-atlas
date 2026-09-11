// Synthetic process trees for the cross-platform development supervisor tests.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { supervise } from '../../scripts/dev-processes.mjs';

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
      ['tree.json', 'leaf.json', 'exit.json'].every((file) =>
        existsSync(join(directory, file)),
      )
    ) {
      clearInterval(timer);
      process.send?.('ready');
    }
  }, 20);
  const commands =
    outcome === 'spawn-error'
      ? [{ name: 'missing', command: join(directory, 'no-such-executable') }]
      : [command('tree'), command('exit')];
  process.exitCode = await supervise(commands, { graceMs: 150 });
  clearInterval(timer);
  process.disconnect?.();
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
