import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, expect, it, vi } from 'vitest';
import {
  developmentAssetPolicy,
  isControlledImage,
  validateMarkdown,
} from '../packages/markdown/src/index';
import { validateSnapshot, sha256 } from '../scripts/snapshot.mjs';
import {
  localDevelopment,
  readLocalLatest,
  readLocalPrepared,
} from '../scripts/dev-storage.mjs';
import { prepareDevelopmentWeb } from '../scripts/dev-web.mjs';
import { createSnapshotWatcher } from '../scripts/dev-snapshot-watcher.mjs';
import { parsePreview } from '../apps/web/dev/preview';
import { createPublication } from '../apps/web/src/lib/publication/indexes';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});
const setup = () => {
  const dir = mkdtempSync(join(tmpdir(), 'gopheratlas-local-'));
  dirs.push(dir);
  const env = {
    DATABASE_PATH: join(dir, 'gopheratlas.db'),
    R2_ENDPOINT: 'http://127.0.0.1:1',
    CONTENT_R2_ENDPOINT: 'http://127.0.0.1:1',
    CLOUDFLARE_DEPLOY_HOOK_URL: 'http://127.0.0.1:1',
  };
  const config = localDevelopment(env);
  mkdirSync(join(config.contentRoot, 'snapshots'), { recursive: true });
  const snapshot = JSON.parse(
    readFileSync('tests/fixtures/content-snapshot-v1.json', 'utf8').replaceAll(
      'https://assets.gopheratlas.com',
      config.assetBase,
    ),
  );
  const publish = (generation: number) => {
    const value = { ...snapshot, generation };
    const data = Buffer.from(JSON.stringify(value));
    const pointer = {
      schemaVersion: 1,
      generation,
      snapshotKey: `snapshots/generation-${generation}.json`,
      sha256: sha256(data),
      exportedAt: value.exportedAt,
    };
    writeFileSync(join(config.contentRoot, pointer.snapshotKey), data);
    writeFileSync(
      join(config.contentRoot, 'latest.json'),
      JSON.stringify(pointer),
    );
    return { data, pointer };
  };
  return { dir, env, config, snapshot, publish };
};

it('starts an empty non-fixture Public and watches real local files, surviving malformed and missing input', async () => {
  const { dir, env, config, publish } = setup();
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockRejectedValue(new Error('network forbidden'));
  const output = pathToFileURL(join(dir, 'prepared') + '/');
  const web = await prepareDevelopmentWeb(env, { output });
  expect(
    JSON.parse(readFileSync(new URL('published-snapshot.json', output), 'utf8'))
      .content,
  ).toEqual([]);
  expect(web.command.env.GOPHERATLAS_DEV_ASSET_BASE).toBe(config.assetBase);
  expect(web.command.env).not.toHaveProperty('R2_ENDPOINT');
  const update = vi.fn(),
    report = vi.fn();
  const watcher = createSnapshotWatcher(config, 0, update, { report });
  await watcher.poll();
  expect(update).not.toHaveBeenCalled();
  const first = publish(1);
  await watcher.poll();
  expect(update).toHaveBeenCalledOnce();
  await watcher.poll();
  expect(update).toHaveBeenCalledOnce();
  writeFileSync(join(config.contentRoot, 'latest.json'), '{broken');
  await watcher.poll();
  expect(update).toHaveBeenCalledOnce();
  publish(2);
  await watcher.poll();
  expect(update).toHaveBeenCalledTimes(2);
  expect(
    readFileSync(join(config.contentRoot, first.pointer.snapshotKey)),
  ).toEqual(first.data);
  // A new watcher and reader resume the same persistent state.
  expect(
    (await readLocalPrepared(localDevelopment(env))).snapshot.generation,
  ).toBe(2);
  await createSnapshotWatcher(config, 2, update, { report }).poll();
  expect(update).toHaveBeenCalledTimes(2);
  expect(fetch).not.toHaveBeenCalled();
  await expect(
    prepareDevelopmentWeb(
      { ...env, CONTENT_SNAPSHOT_FILE: 'fixture.json' },
      { output },
    ),
  ).rejects.toThrow('test-only');
});

it('validates local hash, immutable key, graph and exact asset origin; Production remains strict', async () => {
  const { config, publish } = setup();
  const { data, pointer } = publish(1);
  expect(() => validateSnapshot(data)).toThrow('snapshot_invalid');
  expect(() =>
    validateSnapshot(data, { assetPolicy: config.assetPolicy }),
  ).not.toThrow();
  writeFileSync(
    join(config.contentRoot, pointer.snapshotKey),
    Buffer.from('{}'),
  );
  await expect(readLocalPrepared(config)).rejects.toThrow();
  writeFileSync(
    join(config.contentRoot, 'latest.json'),
    JSON.stringify({ ...pointer, snapshotKey: '../../private' }),
  );
  await expect(readLocalLatest(config)).rejects.toThrow();
  publish(2);
  const wrong = developmentAssetPolicy('http://127.0.0.1:46218/__dev/assets');
  await expect(
    readLocalPrepared({ ...config, assetPolicy: wrong }),
  ).rejects.toThrow();
});

it('allows only configured local images in Markdown and the actual Draft preview projection', () => {
  const { config, snapshot } = setup();
  const imageURL = snapshot.assets[0].url;
  const text = `## Local note\n\n![Local image](${imageURL})`;
  expect(validateMarkdown(text, config.assetPolicy)).toEqual([]);
  expect(validateMarkdown(text)).not.toEqual([]);
  for (const bad of [
    imageURL.replace(':46217', ':46218'),
    imageURL + '?track=1',
    imageURL.replace('127.0.0.1', 'evil.example'),
    'https://external.invalid/x.png',
  ])
    expect(isControlledImage(bad, config.assetPolicy)).toBe(false);
  expect(
    validateMarkdown('<script>x</script>', config.assetPolicy).length,
  ).toBeGreaterThan(0);
  const item = structuredClone(
    snapshot.content.find((i: { type: string }) => i.type === 'note'),
  );
  item.bodyMarkdown = text;
  item.coverAssetId = snapshot.assets[0].id;
  const value = {
    item,
    author: snapshot.authors.find(
      (a: { id: number }) => a.id === item.authorId,
    ),
    cover: snapshot.assets[0],
    tags: snapshot.tags.filter((t: { id: number }) =>
      item.tagIds.includes(t.id),
    ),
    targets: [],
  };
  const base = createPublication(snapshot),
    before = JSON.stringify(base.snapshot);
  expect(parsePreview(value, base, config.assetPolicy).item.bodyMarkdown).toBe(
    text,
  );
  expect(() => parsePreview(value, base)).toThrow();
  expect(JSON.stringify(base.snapshot)).toBe(before);
});
