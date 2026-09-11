import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { expect, it } from 'vitest';
const source = (path: string) =>
  readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
it('preserves migrations 1/2 and adds only the P0-4 schema-3 migration', () => {
  expect(
    readdirSync('db/migrations')
      .filter((name) => name.endsWith('.sql'))
      .sort(),
  ).toEqual([
    '00001_identity.sql',
    '00002_editorial.sql',
    '00003_publication.sql',
  ]);
  for (const [name, hash] of Object.entries({
    '00001_identity.sql':
      '5e50419901720610849d7e341904083d9ccdc9e0051dcb3ee46d785c73042235',
    '00002_editorial.sql':
      '81c407db1a2ae0dc23ae86c2d6773e9898bc6547994659152a3eb0671964f4d8',
  }))
    expect(
      createHash('sha256')
        .update(source(`db/migrations/${name}`))
        .digest('hex'),
    ).toBe(hash);
  expect(source('internal/database/database.go')).toContain(
    'const SchemaVersion = 3',
  );
});
it('reserves browser persistence for theme/sidebar and retains reduced-motion/focus rules', () => {
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? files(`${dir}/${entry.name}`)
        : [`${dir}/${entry.name}`],
    );
  for (const file of files('apps/admin/src').filter(
    (p) => /\.tsx?$/.test(p) && !p.includes('.test.'),
  )) {
    const key = file.endsWith('/app/theme.tsx')
      ? 'gopheratlas-theme'
      : file.endsWith('/app/sidebar-preference.ts')
        ? 'gopheratlas-sidebar'
        : null;
    const code = source(file);
    expect(code).not.toMatch(/\b(?:sessionStorage|indexedDB)\b/);
    if (!key) expect(code).not.toMatch(/\blocalStorage\b/);
    else {
      const calls = [
        ...code.matchAll(/localStorage\.(getItem|setItem)\(\s*'([^']+)'/g),
      ];
      expect(calls.map((call) => call[2])).toEqual([key, key]);
      expect(code.match(/\blocalStorage\b/g)).toHaveLength(2);
    }
  }
  expect(source('apps/admin/src/styles.css')).toContain(
    "@import './styles/base.css'",
  );
  const css = source('apps/admin/src/styles/base.css');
  expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  expect(css).toContain('transition: none !important');
  expect(css).toContain('animation: none !important');
  expect(css).toContain(':focus-visible');
});
