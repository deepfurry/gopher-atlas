import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { files, go, pnpm, run, tool, goEnv } from './lib.mjs';

run('node', ['scripts/check-boundaries.mjs']);
const goFiles = files('.').filter((file) => file.endsWith('.go'));
const unformatted = execFileSync('go', ['run', 'cmd/gofmt', '-l', ...goFiles], {
  encoding: 'utf8',
  env: goEnv,
});
if (unformatted.trim()) throw new Error(unformatted);
go('vet', './...');
tool('staticcheck', './...');
go('test', './...');
go('build', './...');
pnpm('lint');
pnpm('typecheck');
pnpm('test');
pnpm('exec', 'redocly', 'lint', 'contracts/openapi.yaml');
run('node', ['scripts/generate.mjs', '--check']);
run('node', ['scripts/check-sql.mjs']);
const canary = 'synthetic-' + randomBytes(24).toString('hex');
for (const key of [
  'R2_SECRET_ACCESS_KEY',
  'R2_ACCESS_KEY_ID',
  'CONTENT_R2_SECRET_ACCESS_KEY',
  'CONTENT_R2_ACCESS_KEY_ID',
  'GITHUB_OAUTH_CLIENT_SECRET',
  'CLOUDFLARE_DEPLOY_HOOK_URL',
  'CMS_BASE_URL',
  'GITHUB_OAUTH_REDIRECT_URI',
  'GOPHERATLAS_DEV_ASSET_BASE',
])
  process.env[key] = canary;
process.env.CONTENT_SNAPSHOT_FILE = resolve(
  'tests/fixtures/content-snapshot-v1.json',
);
pnpm('build');
run('node', ['scripts/check-public-build.mjs']);
for (const root of [
  'apps/web/dist',
  'apps/admin/dist',
  'internal/adminui/dist',
]) {
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(dir + '/' + e.name) : [dir + '/' + e.name],
    );
  for (const path of walk(root)) {
    if (
      path.split('/').at(-1).startsWith('.env') ||
      readFileSync(path).includes(Buffer.from(canary))
    )
      throw new Error('Synthetic secret-output scan failed');
    for (const marker of [
      '/__dev/blog-preview/',
      'showSavedBlogPreview',
      'GOPHERATLAS_DEV_ADMIN_ORIGIN',
    ])
      if (readFileSync(path).includes(Buffer.from(marker)))
        throw new Error('Development preview leaked into Production output');
  }
}
console.log('Synthetic secret-output scan passed.');
mkdirSync('.cache/bin', { recursive: true });
go('test', '-tags=adminembed', './internal/adminui', './internal/app');
go(
  'build',
  '-tags=adminembed',
  '-o',
  `.cache/bin/gopheratlas-cms${process.platform === 'win32' ? '.exe' : ''}`,
  './cmd/gopheratlas-cms',
);
for (const path of [
  'apps/web/dist/index.html',
  'apps/web/dist/.well-known/gopheratlas-build.json',
  'apps/web/dist/about/index.html',
  'apps/web/dist/contribute/index.html',
  'apps/web/dist/rss.xml',
  'apps/web/dist/sitemap-index.xml',
  'apps/web/dist/sitemap-0.xml',
  'apps/web/dist/pagefind/pagefind.js',
  'apps/admin/dist/index.html',
  'internal/adminui/dist/index.html',
]) {
  if (!existsSync(path)) throw new Error(`Missing build artifact: ${path}`);
}
const rss = readFileSync('apps/web/dist/rss.xml', 'utf8');
if (!rss.includes('<rss') || !rss.includes('GopherAtlas'))
  throw new Error('Invalid publication RSS');
console.log(
  'All P0-5.5 checks passed. No production services or credentials used.',
);
