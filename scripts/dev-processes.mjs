import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// Resolve pinned workspace CLIs without cmd/npm/pnpm wrapper process chains.
export function packageCLI(directory, name) {
  const require = createRequire(resolve(directory, 'package.json'));
  const manifest = require.resolve(`${name}/package.json`);
  const { bin } = JSON.parse(readFileSync(manifest, 'utf8'));
  return resolve(dirname(manifest), typeof bin === 'string' ? bin : bin[name]);
}

function groupExists(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function stopChildren(children, graceMs) {
  if (process.platform === 'win32') {
    await Promise.all(
      children
        .filter(
          (child) =>
            child.pid && child.exitCode === null && child.signalCode === null,
        )
        .map(
          (child) =>
            new Promise((done) => {
              // Node cannot send POSIX signals to Windows process trees. PID comes only
              // from our own spawn; /T includes Vite/Astro/Go descendants, never by name.
              const kill = spawn(
                'taskkill.exe',
                ['/PID', String(child.pid), '/T', '/F'],
                { stdio: 'ignore', windowsHide: true },
              );
              kill.once('error', done);
              kill.once('exit', done);
            }),
        ),
    );
    return;
  }
  const pids = children.flatMap((child) => (child.pid ? [child.pid] : []));
  for (const pid of pids) {
    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      /* Already exited. */
    }
  }
  const until = Date.now() + graceMs;
  while (pids.some(groupExists) && Date.now() < until)
    await new Promise((done) => setTimeout(done, 25));
  for (const pid of pids) {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      /* Already exited. */
    }
  }
}

// Any exit (including success), spawn failure, or Ctrl+C stops the whole group.
export async function supervise(
  commands,
  { graceMs = 5000, stdio = 'inherit' } = {},
) {
  const children = [];
  let stopping = false;
  let finish;
  const result = new Promise((done) => {
    finish = done;
  });
  const stop = (code) => {
    if (stopping) return;
    stopping = true;
    void stopChildren(children, graceMs).then(() => finish(code));
  };
  const interrupt = () => stop(130);
  const terminate = () => stop(143);
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', terminate);
  try {
    for (const { name, command, args = [], cwd, env } of commands) {
      if (stopping) break;
      const child = spawn(command, args, {
        cwd,
        env,
        stdio,
        windowsHide: true,
        // Own groups also keep Windows Ctrl+C focused on this supervisor while
        // it stops each hidden child tree, rather than racing every console child.
        detached: true,
      });
      children.push(child);
      child.once('error', () => {
        console.error(
          `${name} could not start; stopping development services.`,
        );
        stop(1);
      });
      child.once('exit', (code, signal) => {
        if (!stopping) console.log(`${name} exited (${code ?? signal}).`);
        stop(code ?? (signal === 'SIGINT' ? 130 : 1));
      });
    }
    if (!commands.length) stop(0);
    return await result;
  } catch {
    stop(1);
    return await result;
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', terminate);
  }
}
