import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  existsSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, expect, it } from 'vitest';
import publicSitemap from '../apps/web/integrations/public-sitemap.mjs';
import { validateSnapshot } from '../scripts/snapshot.mjs';
import { prepare } from '../scripts/prepare-web-content.mjs';
import { prepareDevelopmentWeb } from '../scripts/dev-web.mjs';

const dirs: string[] = [];
function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'gopheratlas-config-'));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

it('loads configuration without publication I/O for check and dev', () => {
  const snapshotFile = join(setup(), 'missing.json');
  const [input] = publicSitemap({ snapshotFile });
  expect(input.name).toBe('gopheratlas-public-sitemap-input');
  expect(Object.keys(input.hooks)).toEqual(['astro:build:start']);
  expect(existsSync(snapshotFile)).toBe(false);
  // Unlike check/dev, invoking the actual build hook must fail closed.
  expect(() => input.hooks['astro:build:start']()).toThrow();
});

it.each([1, 2, 3])(
  'accepts validated v%i prepared input only at build start',
  (version) => {
    const [input] = publicSitemap({
      snapshotFile: `tests/fixtures/content-snapshot-v${version}.json`,
    });
    expect(() => input.hooks['astro:build:start']()).not.toThrow();
  },
);

it.each(['{', '{"schemaVersion":99}', '{"schemaVersion":3,"content":[]}'])(
  'rejects malformed, unknown or incomplete prepared input instead of treating it as empty',
  (value) => {
    const snapshotFile = join(setup(), 'snapshot.json');
    writeFileSync(snapshotFile, value);
    const [input] = publicSitemap({ snapshotFile });
    expect(() => input.hooks['astro:build:start']()).toThrow(
      'snapshot_invalid',
    );
  },
);

it('requires explicit build input even when a stale generated snapshot exists', async () => {
  const output = pathToFileURL(setup() + '/');
  const file = new URL('published-snapshot.json', output);
  writeFileSync(file, 'stale input must not be reused');
  await expect(prepare({}, output)).rejects.toThrow(
    'content_input_not_configured',
  );
  await expect(
    prepare({ CONTENT_SNAPSHOT_FILE: join(setup(), 'missing.json') }, output),
  ).rejects.toThrow();
  expect(readFileSync(file, 'utf8')).toBe('stale input must not be reused');
});

it('validates the closed contract and references rather than just parsing build input', () => {
  for (const invalid of ['privateField', 'reference']) {
    const snapshot = JSON.parse(
      readFileSync('tests/fixtures/content-snapshot-v3.json', 'utf8'),
    );
    if (invalid === 'privateField') snapshot.privateField = true;
    else snapshot.routes[0].contentId = 999999;
    const snapshotFile = join(setup(), 'snapshot.json');
    writeFileSync(snapshotFile, JSON.stringify(snapshot));
    const [input] = publicSitemap({ snapshotFile });
    expect(() => input.hooks['astro:build:start']()).toThrow(
      'snapshot_invalid',
    );
  }
});

it('keeps empty local input exclusive to the explicit Development preparer', async () => {
  const dir = setup();
  const output = pathToFileURL(dir + '/');
  await prepareDevelopmentWeb(
    { APP_ENV: 'development', DATABASE_PATH: join(dir, 'local.db') },
    { output },
  );
  const snapshot = validateSnapshot(
    readFileSync(new URL('published-snapshot.json', output)),
  );
  expect(snapshot.content).toEqual([]);
  expect(snapshot.generation).toBe(0);
  expect(existsSync(new URL('published-snapshot.json', output))).toBe(true);
  await expect(prepare({}, output)).rejects.toThrow(
    'content_input_not_configured',
  );
});
