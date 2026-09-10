import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { files } from './lib.mjs';

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
assert(
  !tracked.some(
    (path) =>
      /(^|\/)\.env(?:\.|$)/u.test(path) && !path.endsWith('.env.example'),
  ),
  'Local environment file tracked',
);
assert(
  !tracked.some((path) => /(^|\/)(package-lock\.json|yarn\.lock)$/u.test(path)),
  'Only pnpm-lock.yaml may be committed',
);
for (const path of ['package-lock.json', 'yarn.lock'])
  assert(!existsSync(path), `Remove unsupported lockfile: ${path}`);
for (const line of readFileSync('.env.example', 'utf8').split('\n')) {
  if (
    /^(?:GITHUB_OAUTH_CLIENT_(?:ID|SECRET)|BOOTSTRAP_ADMIN_GITHUB_ID|R2_ENDPOINT|R2_ACCESS_KEY_ID|R2_SECRET_ACCESS_KEY|CLOUDFLARE_DEPLOY_HOOK_URL)=/u.test(
      line,
    )
  )
    assert(
      line.split('=').slice(1).join('=').trim() === '',
      'Credential placeholders must be empty',
    );
}
for (const path of [
  'apps/web/package.json',
  'apps/admin/package.json',
  'packages/markdown/package.json',
  'packages/api-client/package.json',
]) {
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  const dependencies = {
    ...manifest.dependencies,
    ...manifest.devDependencies,
  };
  for (const [name, version] of Object.entries(dependencies)) {
    if (name.startsWith('@gopheratlas/')) assert.equal(version, 'workspace:*');
    assert(
      !/^(?:@radix-ui\/|radix-ui$|react-aria|@react-aria\/|turbo$|nx$)/u.test(
        name,
      ),
      `Forbidden dependency: ${name}`,
    );
  }
  if (path.startsWith('apps/web'))
    assert(
      !Object.keys(dependencies).some((name) =>
        /shadcn|base-ui|api-client/u.test(name),
      ),
      'Public cannot depend on Admin components/client',
    );
}
for (const path of [...files('apps/web/src'), ...files('packages')].filter(
  (path) => /\.(?:ts|tsx|astro|mjs)$/u.test(path),
)) {
  const source = readFileSync(path, 'utf8');
  if (path.startsWith('apps/web/'))
    assert(
      !/from\s+['"][^'"]*(?:api-client|apps\/admin|shadcn|@base-ui)/u.test(
        source,
      ),
      `Public boundary violation: ${path}`,
    );
  if (path.startsWith('packages/'))
    assert(
      !/from\s+['"][^'"]*apps\//u.test(source),
      `Shared package imports application: ${path}`,
    );
}
assert.equal(
  files('.').filter((path) => path.endsWith('go.mod')).length,
  1,
  'One root Go module required',
);
console.log('Repository dependency and environment boundaries passed.');
