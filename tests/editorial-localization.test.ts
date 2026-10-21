import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  validateSnapshot,
  validateLatest,
  sha256,
} from '../scripts/snapshot.mjs';
import { createPublication } from '../apps/web/src/lib/publication/indexes';
import {
  hasEnglish,
  editorialView,
  contentPath,
} from '../apps/web/src/lib/publication/editorial';
import { contentStatistics } from '../apps/web/src/lib/stats/content';
import { redirects } from '../apps/web/src/lib/publication/routes';

const fixture = () =>
  JSON.parse(readFileSync('tests/fixtures/content-snapshot-v3.json', 'utf8'));
const bytes = (s: unknown) => Buffer.from(JSON.stringify(s));
it('preserves original redirects and derives bounded English history for editorial routes', () => {
  const raw = fixture();
  const c = raw.content.find(
    (c: { type: string }) => c.type === 'curated_article',
  );
  raw.routes.push({
    path: '/articles/old-curated/',
    kind: 'redirect',
    contentId: c.id,
  });
  expect(redirects(raw)).toContain(
    `/articles/old-curated/ ${c.canonicalPath} 301\n/en/articles/old-curated/ /en${c.canonicalPath} 301\n`,
  );
  raw.routes = raw.routes.filter(
    (r: { kind: string }) => r.kind === 'canonical',
  );
  raw.routes.push(
    ...Array.from({ length: 1001 }, (_, i) => ({
      path: `/articles/old-${i}/`,
      kind: 'redirect',
      contentId: c.id,
    })),
  );
  expect(() => redirects(raw)).toThrow('public_redirect_limit');
});
it('reads v1/v2 unchanged and normalizes v3 without multiplying identities or mutating source', () => {
  for (const version of [1, 2, 3])
    expect(
      validateSnapshot(
        readFileSync(`tests/fixtures/content-snapshot-v${version}.json`),
      ).schemaVersion,
    ).toBe(version);
  const raw = fixture(),
    before = JSON.stringify(raw),
    p = createPublication(validateSnapshot(bytes(raw)));
  const c = p.snapshot.content.find((c) => c.type === 'curated_article')!;
  expect(hasEnglish(c)).toBe(true);
  expect(editorialView(c, 'en').language).toBe('en');
  expect(contentPath(c, 'en')).toBe('/en' + c.canonicalPath);
  const topic = p.snapshot.content.find(
    (c) => c.type === 'topic' && !hasEnglish(c),
  )!;
  expect(contentPath(topic, 'en')).toBe(topic.canonicalPath);
  expect(p.snapshot.content.map((c) => c.id)).toEqual(
    raw.content.map((c: { id: number }) => c.id),
  );
  const stats = contentStatistics(p);
  expect(stats.available).toBe(true);
  if (stats.available)
    expect(stats.series.all.total).toBe(
      raw.content.filter((c: { type: string }) => c.type !== 'post').length,
    );
  expect(JSON.stringify(raw)).toBe(before);
  expect(sha256(bytes(raw))).toBe(sha256(bytes(fixture())));
  expect(
    validateLatest(
      bytes({
        schemaVersion: 3,
        generation: raw.generation,
        snapshotKey: `snapshots/generation-${raw.generation}.json`,
        sha256: sha256(bytes(raw)),
        exportedAt: raw.exportedAt,
      }),
    ).schemaVersion,
  ).toBe(3);
});
it.each(['title', 'summary', 'bodyMarkdown'])(
  'rejects empty or whitespace published English %s',
  (field) => {
    for (const value of ['', ' ']) {
      const s = fixture();
      s.content.find(
        (c: { type: string }) => c.type === 'curated_article',
      ).editorialEn[field] = value;
      expect(() => validateSnapshot(bytes(s))).toThrow('snapshot_invalid');
    }
  },
);
it.each([
  'unsafe',
  'oversize',
  'disabled',
  'unknown',
  'wrong-type',
  'wrong-link',
  'topic-tags',
])('fails closed on %s', (reason) => {
  const s = fixture(),
    c = s.content.find((c: { type: string }) => c.type === 'curated_article'),
    e = c.editorialEn;
  if (reason === 'unsafe') e.bodyMarkdown = '<script>private</script>';
  if (reason === 'oversize') e.bodyMarkdown = 'a'.repeat(524289);
  if (reason === 'disabled') e.enabled = false;
  if (reason === 'unknown') e.private = 'secret';
  if (reason === 'wrong-type')
    s.content.find((c: { type: string }) => c.type === 'note').editorialEn = e;
  if (reason === 'wrong-link')
    e.labels.relatedLinks = [
      { url: 'https://example.com/unshared', label: 'Wrong' },
    ];
  if (reason === 'topic-tags')
    s.content.find((c: { type: string }) => c.type === 'topic').tagIds = [
      s.tags[0].id,
    ];
  expect(() => validateSnapshot(bytes(s))).toThrow('snapshot_invalid');
});
