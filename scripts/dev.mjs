import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { developmentEnv, publicToolEnv, repositoryRoot } from './dev-env.mjs';
import { packageCLI, supervise } from './dev-processes.mjs';
import { prepareDevelopmentWeb, preparationMessage } from './dev-web.mjs';

async function dev() {
  const root = repositoryRoot;
  const env = developmentEnv();
  if ((env.APP_ENV || 'development') !== 'development') {
    console.error('make dev requires APP_ENV=development.');
    return 1;
  }
  mkdirSync(resolve(root, '.cache/bin'), { recursive: true });
  const binary = resolve(
    root,
    `.cache/bin/gopheratlas-cms-dev${process.platform === 'win32' ? '.exe' : ''}`,
  );
  // Compile the same unembedded CMS used by go run, then supervise it directly.
  // This avoids an orphaned go-run executable when its wrapper exits on Windows.
  const build = await supervise([
    {
      name: 'CMS compile',
      command: 'go',
      args: ['build', '-o', binary, './cmd/gopheratlas-cms'],
      cwd: root,
      env: {
        ...process.env,
        GOTOOLCHAIN: `go${readFileSync(resolve(root, '.go-version'), 'utf8').trim()}`,
      },
    },
  ]);
  if (build !== 0) return build;
  let web;
  try {
    web = await prepareDevelopmentWeb();
  } catch (error) {
    console.error(preparationMessage(error));
    return 1;
  }
  const admin = resolve(root, 'apps/admin');
  console.log(
    'Development: CMS 127.0.0.1:46217 (or CMS_LISTEN_ADDR), Admin http://127.0.0.1:5173, Public http://127.0.0.1:4321. Ctrl+C stops all.',
  );
  return supervise([
    { name: 'CMS', command: binary, cwd: root, env },
    {
      name: 'Admin',
      command: process.execPath,
      args: [packageCLI(admin, 'vite'), '--host', '127.0.0.1'],
      cwd: admin,
      env: {
        ...publicToolEnv(),
        CMS_LISTEN_ADDR: env.CMS_LISTEN_ADDR || '127.0.0.1:46217',
      },
    },
    web,
  ]);
}
try {
  process.exitCode = await dev();
} catch {
  console.error(
    'Development startup failed; check local configuration and installed tools.',
  );
  process.exitCode = 1;
}
