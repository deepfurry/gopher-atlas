import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
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
pnpm('build');
for (const path of [
  'apps/web/dist/index.html',
  'apps/web/dist/about/index.html',
  'apps/web/dist/contribute/index.html',
  'apps/web/dist/rss.xml',
  'apps/web/dist/sitemap-index.xml',
  'apps/web/dist/sitemap-0.xml',
  'apps/web/dist/pagefind/pagefind.js',
  'apps/admin/dist/index.html',
]) {
  if (!existsSync(path)) throw new Error(`Missing build artifact: ${path}`);
}
const rss = readFileSync('apps/web/dist/rss.xml', 'utf8');
if (!rss.includes('<rss') || !rss.includes('GopherAtlas'))
  throw new Error('Invalid bootstrap RSS');
console.log(
  'All P0-0 checks passed. No production services or credentials used.',
);
