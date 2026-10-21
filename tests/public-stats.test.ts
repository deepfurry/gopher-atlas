import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { validateSnapshot } from '../scripts/snapshot.mjs';
import {
  contentStatistics,
  growthPlot,
  growthCalendar,
} from '../apps/web/src/lib/stats/content';
import { createPublication } from '../apps/web/src/lib/publication/indexes';
import { publicPages } from '../apps/web/src/lib/publication/routes';
import { chromePaths, localized } from '../apps/web/src/lib/i18n';
import type { SnapshotV2 } from '../apps/web/src/lib/publication/types';

const fixture = (): SnapshotV2 =>
  JSON.parse(readFileSync('tests/fixtures/content-snapshot-v2.json', 'utf8'));
const checked = (snapshot: unknown) =>
  createPublication(validateSnapshot(Buffer.from(JSON.stringify(snapshot))));
function select(ids: number[]) {
  const s = fixture();
  s.content = s.content.filter((item) => ids.includes(item.id));
  s.routes = s.routes.filter((route) => ids.includes(route.contentId));
  s.authors = s.authors.filter((author) =>
    s.content.some((item) => item.authorId === author.id),
  );
  s.tags = s.tags.filter((tag) =>
    s.content.some((item) => item.tagIds.includes(tag.id)),
  );
  s.assets = s.assets.filter((asset) =>
    s.content.some((item) => item.coverAssetId === asset.id),
  );
  s.groups = s.groups.filter((group) =>
    s.content.some(
      (item) => item.type === 'note' && item.payload.groupSlug === group.slug,
    ),
  );
  return s;
}

it.each([1, 2])(
  'counts validated v%s identities once, excluding Posts from growth and keeping tags separate',
  (version) => {
    const p = checked(
      JSON.parse(
        readFileSync(
          `tests/fixtures/content-snapshot-v${version}.json`,
          'utf8',
        ),
      ),
    );
    const before = JSON.stringify(p.snapshot),
      stats = contentStatistics(p);
    expect(stats.available).toBe(true);
    if (!stats.available) throw Error('missing fixture');
    expect(stats.counts).toEqual({
      note: version === 1 ? 2 : 3,
      curated_article: 1,
      topic: 1,
      tags: version === 1 ? 2 : 3,
    });
    expect(stats.series.all.total).toBe(version === 1 ? 4 : 5);
    expect(stats.series.all.points).toEqual([
      { date: '2026-09-11', total: version === 1 ? 4 : 5 },
    ]);
    const routes = publicPages(p);
    expect(
      routes.flatMap((page) => [page.path, localized(page.path, 'en')]).length,
    ).toBeGreaterThan(p.contentById.size);
    expect(contentStatistics(p)).toEqual(stats);
    expect(JSON.stringify(p.snapshot)).toBe(before);
  },
);

it('distinguishes a verified empty snapshot from the generation-zero Development placeholder', () => {
  const empty = select([]),
    stats = contentStatistics(checked(empty));
  expect(stats).toMatchObject({
    available: true,
    counts: { note: 0, curated_article: 0, topic: 0, tags: 0 },
  });
  if (!stats.available) throw Error('missing fixture');
  expect(stats.series.all).toEqual({
    total: 0,
    firstDate: null,
    lastDate: null,
    points: [],
  });
  expect(growthPlot(stats.series.all)).toBeNull();
  empty.generation = 0;
  empty.exportedAt = new Date(0).toISOString();
  expect(contentStatistics(checked(empty))).toEqual({ available: false });
  Reflect.deleteProperty(empty, 'content');
  expect(() => checked(empty)).toThrow('snapshot_invalid');
});

it('handles a single content type and one-day plot without inventing an earlier zero or later date', () => {
  const stats = contentStatistics(checked(select([2])));
  if (!stats.available) throw Error('missing fixture');
  expect(stats.series.note.total).toBe(1);
  expect(stats.series.curated_article.points).toEqual([]);
  expect(stats.series.topic.points).toEqual([]);
  expect(growthPlot(stats.series.all)).toMatchObject({
    path: 'M 50 0',
    end: { x: 50, y: 0 },
  });
  expect(stats.series.all.firstDate).toBe(stats.series.all.lastDate);
  const posts = contentStatistics(checked(select([1])));
  expect(posts).toMatchObject({
    available: true,
    counts: { note: 0, curated_article: 0, topic: 0, tags: 2 },
    series: { all: { total: 0, points: [] } },
  });
});

it('sorts first publications by UTC day, retains independent language IDs and ignores updates', () => {
  const s = select([2, 5, 7]);
  s.content[0].firstPublishedAt = Date.parse('2026-09-10T00:30:00+08:00'); // Sep 9 UTC
  s.content[1].firstPublishedAt = Date.parse('2026-09-09T23:59:59Z');
  s.content[1].language = 'en';
  s.content[2].firstPublishedAt = Date.parse('2026-09-11T00:00:00Z');
  s.content.reverse();
  const stats = contentStatistics(checked(s));
  if (!stats.available) throw Error('missing fixture');
  expect(stats.series.all).toEqual({
    total: 3,
    firstDate: '2026-09-09',
    lastDate: '2026-09-11',
    points: [
      { date: '2026-09-09', total: 2 },
      { date: '2026-09-11', total: 3 },
    ],
  });
  const plot = growthPlot(stats.series.all)!;
  expect(plot.path).toMatch(/^M 1 .+ H 99 V 0$/);
  const calendar = growthCalendar(stats.series.all);
  expect(calendar.count).toBe(3);
  expect(calendar.point(0)).toMatchObject({
    date: '2026-09-09',
    total: 2,
    added: 2,
  });
  expect(calendar.point(1)).toMatchObject({
    date: '2026-09-10',
    total: 2,
    added: 0,
  });
  expect(calendar.point(2)).toMatchObject({
    date: '2026-09-11',
    total: 3,
    added: 1,
  });
  s.content.forEach((item) => (item.lastPublishedAt += 86400000));
  expect(contentStatistics(checked(s))).toEqual(stats);
});

it('requires valid first publication fields and rejects out-of-range Date values without fabricating zero', () => {
  for (const bad of [-1, 1.5, '2026-09-11', null]) {
    const s = fixture();
    Reflect.set(s.content[1], 'firstPublishedAt', bad);
    expect(() => checked(s)).toThrow('snapshot_invalid');
  }
  for (const invalidDate of [Number.MAX_SAFE_INTEGER, 253402300800000]) {
    const s = fixture();
    s.content[1].firstPublishedAt = s.content[1].lastPublishedAt = invalidDate;
    expect(() => contentStatistics(checked(s))).toThrow('public_date_invalid');
  }
  const duplicated = fixture();
  duplicated.content.push({ ...duplicated.content[1] });
  expect(() => checked(duplicated)).toThrow('snapshot_invalid');
});

it.each(['/stats/', '/en/stats/'])(
  'reserves %s against canonical and historical routes',
  (path) => {
    const p = checked(fixture());
    p.snapshot.routes.push({ path, kind: 'redirect', contentId: 1 });
    expect(() => publicPages(p)).toThrow('public_page_conflict');
    const canonical = checked(fixture());
    canonical.snapshot.content[0].canonicalPath = path;
    // Schema validation already refuses incompatible canonical families; the page
    // allocator independently refuses any source-owned collision as well.
    expect(() => publicPages(canonical)).toThrow('public_page_conflict');
    expect(chromePaths).toContain('/stats/');
  },
);
