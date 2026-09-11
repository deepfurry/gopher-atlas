import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { prepare } from './prepare-web-content.mjs';
function pnpm(...args) {
  if (process.platform === 'win32')
    execFileSync('cmd.exe', ['/d', '/s', '/c', 'pnpm ' + args.join(' ')], {
      stdio: 'inherit',
    });
  else execFileSync('pnpm', args, { stdio: 'inherit' });
}

export function buildMarker(input, commitSha) {
  if (!/^[a-f0-9]{40,64}$/.test(commitSha))
    throw new Error('build_commit_invalid');
  return {
    schemaVersion: 1,
    generation: input.snapshot.generation,
    snapshotSha256: input.hash,
    builtAt: new Date().toISOString(),
    commitSha,
    buildId: randomUUID(),
  };
}
// Package scripts execute here from apps/web. Resolve the root explicitly.
if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  const result = await prepare();
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  pnpm('exec', 'astro', 'build');
  const out = new URL('../apps/web/dist/.well-known/', import.meta.url);
  mkdirSync(out, { recursive: true });
  writeFileSync(
    new URL('gopheratlas-build.json', out),
    JSON.stringify(buildMarker(result, commit)) + '\n',
  );
  pnpm('exec', 'pagefind', '--site', 'dist');
}
