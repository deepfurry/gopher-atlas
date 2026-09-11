import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  loadSnapshot,
  sha256,
  validateLatest,
  validateSnapshot,
} from '../scripts/snapshot.mjs';
import { buildMarker } from '../scripts/build-web.mjs';

const data = readFileSync('tests/fixtures/content-snapshot-v1.json');
const snapshot = JSON.parse(data.toString());
const latest = {
  schemaVersion: 1,
  generation: snapshot.generation,
  snapshotKey: 'snapshots/generation-1.json',
  sha256: sha256(data),
  exportedAt: snapshot.exportedAt,
};
const bytes = (value: unknown) => Buffer.from(JSON.stringify(value));
const remote = () => ({
  CONTENT_R2_ENDPOINT: 'https://r2.invalid',
  CONTENT_R2_BUCKET: 'gopheratlas-content',
  CONTENT_R2_ACCESS_KEY_ID: randomBytes(16).toString('hex'),
  CONTENT_R2_SECRET_ACCESS_KEY: randomBytes(16).toString('hex'),
});

it('preserves the identity service biography limit in public builds', () => {
  const copy = structuredClone(snapshot);
  copy.authors[0].bioMarkdown = 'a'.repeat(10000);
  expect(validateSnapshot(bytes(copy)).authors[0].bioMarkdown.length).toBe(
    10000,
  );
  copy.authors[0].bioMarkdown = '中'.repeat(3334);
  expect(() => validateSnapshot(bytes(copy))).toThrow('snapshot_invalid');
});

it('requires explicit local input, never silently falls back', async () => {
  await expect(loadSnapshot({})).rejects.toThrow(
    'content_input_not_configured',
  );
  await expect(
    loadSnapshot({ CONTENT_R2_ENDPOINT: 'https://r2.invalid' }),
  ).rejects.toThrow('content_input_not_configured');
  const got = await loadSnapshot({
    CONTENT_SNAPSHOT_FILE: 'tests/fixtures/content-snapshot-v1.json',
  });
  expect(got.hash).toBe(sha256(data));
  await expect(
    loadSnapshot({ CONTENT_SNAPSHOT_FILE: 'missing-file.json' }),
  ).rejects.toThrow();
});
it('loads private latest then immutable snapshot, verifies the bytes and generation', async () => {
  const keys: string[] = [];
  const result = await loadSnapshot(remote(), {
    get: async (key: string) => {
      keys.push(key);
      return key === 'latest.json' ? bytes(latest) : data;
    },
  });
  expect(keys).toEqual(['latest.json', 'snapshots/generation-1.json']);
  expect(result.snapshot).toEqual(snapshot);
  for (const corrupt of [
    bytes({ ...snapshot, schemaVersion: 0 }),
    Buffer.from('malformed'),
    Buffer.from(data.toString() + ' '),
  ]) {
    await expect(
      loadSnapshot(remote(), {
        get: async (key: string) =>
          key === 'latest.json' ? bytes(latest) : corrupt,
      }),
    ).rejects.toThrow('content_snapshot_load_failed');
  }
  await expect(
    loadSnapshot(remote(), {
      get: async () => {
        throw Error(remote().CONTENT_R2_SECRET_ACCESS_KEY);
      },
    }),
  ).rejects.toThrow(/^content_snapshot_load_failed$/);
});
it('rejects invalid/private snapshot properties at every public boundary', () => {
  for (const collection of ['authors', 'assets', 'tags', 'content', 'routes']) {
    const copy = structuredClone(snapshot);
    copy[collection][0].private = 'private';
    expect(() => validateSnapshot(bytes(copy))).toThrow('snapshot_invalid');
  }
  for (const mutation of [
    (s: typeof snapshot) => {
      s.content[0].bodyMarkdown =
        '![leak](https://third-party.invalid/image.png)';
    },
    (s: typeof snapshot) => {
      s.content[0].bodyMarkdown = '<script>bad</script>';
    },
    (s: typeof snapshot) => {
      s.content[0].coverAssetId = 999;
    },
    (s: typeof snapshot) => {
      s.content[3].topicEntries[0].targetContentId = 999;
    },
    (s: typeof snapshot) => {
      s.routes[0].contentId = 999;
    },
    (s: typeof snapshot) => {
      s.content[0].payload = { private: true };
    },
    (s: typeof snapshot) => {
      s.authors.push({ ...s.authors[0], id: 999 });
    },
  ]) {
    const copy = structuredClone(snapshot);
    mutation(copy);
    expect(() => validateSnapshot(bytes(copy))).toThrow('snapshot_invalid');
  }
});
it('validates latest and produces only a safe public build marker', () => {
  expect(validateLatest(bytes(latest))).toEqual(latest);
  for (const bad of [
    { ...latest, schemaVersion: 0 },
    { ...latest, generation: 2 },
    { ...latest, sha256: 'bad' },
    { ...latest, secret: 'bad' },
    { ...latest, snapshotKey: '../private' },
    { ...latest, exportedAt: 'invalid' },
  ])
    expect(() => validateLatest(bytes(bad))).toThrow();
  const marker = buildMarker({ snapshot, hash: sha256(data) }, 'a'.repeat(40));
  expect(Object.keys(marker).sort()).toEqual(
    [
      'schemaVersion',
      'generation',
      'snapshotSha256',
      'builtAt',
      'commitSha',
      'buildId',
    ].sort(),
  );
  expect(marker.generation).toBe(1);
  expect(marker.snapshotSha256).toBe(sha256(data));
  expect(() => buildMarker({ snapshot, hash: sha256(data) }, 'bad')).toThrow();
});
