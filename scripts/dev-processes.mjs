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

// Unexpected exits stop the group. Explicit restarts replace only their named child.
export async function supervise(
  commands,
  { graceMs = 5000, stdio = 'inherit', onStart } = {},
) {
  const children = [];
  const running = new Map();
  const intentional = new WeakSet();
  const controller = new AbortController();
  let stopping = false;
  let finish;
  const result = new Promise((done) => {
    finish = done;
  });
  const stop = (code) => {
    if (stopping) return;
    stopping = true;
    controller.abort();
    void stopChildren(children, graceMs).then(() => finish(code));
  };
  const interrupt = () => stop(130);
  const terminate = () => stop(143);
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', terminate);
  try {
    const launch = ({ name, command, args = [], cwd, env }) => {
      // Detached Windows children cannot safely inherit console/ConPTY handles.
      // Keep Ctrl+C on the supervisor and relay output over ordinary pipes;
      // otherwise Astro can exit before its startup error reaches the terminal.
      const relay = process.platform === 'win32' && stdio === 'inherit';
      const child = spawn(command, args, {
        cwd,
        env,
        stdio: relay ? ['ignore', 'pipe', 'pipe'] : stdio,
        windowsHide: true,
        // Own groups also keep Windows Ctrl+C focused on this supervisor while
        // it stops each hidden child tree, rather than racing every console child.
        detached: true,
      });
      if (relay) {
        child.stdout.pipe(process.stdout, { end: false });
        child.stderr.pipe(process.stderr, { end: false });
      }
      children.push(child);
      const closed = new Promise((done) => child.once('close', done));
      running.set(name, { child, closed });
      child.once('error', () => {
        console.error(
          `${name} could not start; stopping development services.`,
        );
        stop(1);
      });
      child.once('exit', (code, signal) => {
        if (intentional.has(child)) return;
        if (!stopping) console.log(`${name} exited (${code ?? signal}).`);
        stop(code ?? (signal === 'SIGINT' ? 130 : 1));
      });
    };
    for (const command of commands) {
      if (stopping) break;
      launch(command);
    }
    const restart = async (name, beforeStart = () => {}) => {
      if (stopping) return;
      const command = commands.find((item) => item.name === name);
      const previous = running.get(name);
      if (!command || !previous) throw new Error('Unknown development process');
      intentional.add(previous.child);
      await stopChildren([previous.child], graceMs);
      await previous.closed;
      const index = children.indexOf(previous.child);
      if (index !== -1) children.splice(index, 1);
      if (stopping) return;
      await beforeStart();
      if (!stopping) launch(command);
    };
    if (onStart && !stopping) {
      Promise.resolve(onStart({ restart, signal: controller.signal })).catch(
        () => {
          console.error('Development watcher stopped unexpectedly.');
          stop(1);
        },
      );
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
