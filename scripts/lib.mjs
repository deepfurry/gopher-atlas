import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, rmSync, realpathSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';

export const goEnv = {
  ...process.env,
  GOTOOLCHAIN: `go${readFileSync('.go-version', 'utf8').trim()}`,
};
export function run(command, args = [], options = {}) {
  console.log(`> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} failed (${result.status ?? result.signal})`);
}
export function pnpm(...args) {
  if (process.platform === 'win32') {
    // All callers use repository-owned command arguments; reject shell metacharacters.
    if (args.some((arg) => !/^[\w./:@=+-]+$/u.test(arg)))
      throw new Error('Unsafe pnpm argument');
    run('cmd.exe', ['/d', '/s', '/c', `pnpm ${args.join(' ')}`]);
  } else run('pnpm', args);
}
export function go(...args) {
  run('go', args, { env: goEnv });
}
export function tool(name, ...args) {
  const tools = JSON.parse(readFileSync('scripts/tools.json', 'utf8'));
  if (!tools[name]) throw new Error(`Unknown tool ${name}`);
  const tags =
    name === 'goose'
      ? [
          '-tags=no_clickhouse,no_libsql,no_mssql,no_mysql,no_postgres,no_vertica,no_ydb',
        ]
      : [];
  // goose otherwise loads a .env from the working directory by default.
  const envFlags = name === 'goose' ? ['-env', 'none'] : [];
  go('run', ...tags, tools[name], ...envFlags, ...args);
}
export function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (
      [
        'node_modules',
        'dist',
        '.git',
        '.astro',
        '.generated',
        '.tools',
        '.cache',
        '.wrangler',
      ].includes(entry.name)
    )
      return [];
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path.replaceAll('\\', '/')];
  });
}

export function removeTemp(directory) {
  const target = realpathSync(directory);
  if (
    dirname(target) !== realpathSync(tmpdir()) ||
    !basename(target).startsWith('gopheratlas-')
  )
    throw new Error('Refusing cleanup outside task temporary directory');
  rmSync(target, { recursive: true, force: true });
}
