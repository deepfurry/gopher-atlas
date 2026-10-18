import { contentStatistics } from '../apps/web/src/lib/stats/content.ts';
import {
  publicPages,
  collectionText,
} from '../apps/web/src/lib/publication/routes.ts';
import type { Publication } from '../apps/web/src/lib/publication/indexes.ts';
import { chromePaths, words } from '../apps/web/src/lib/i18n.ts';
import {
  validateManifest,
  type StatsManifest,
} from '../apps/web/stats/manifest.ts';

/** Only published route names/titles/counts; never body, assets or private config. */
export function buildStatsManifest(
  p: Publication,
  hash: string,
): StatsManifest {
  const stats = contentStatistics(p);
  if (!stats.available) throw Error('stats_manifest_unavailable');
  const routes = new Map<string, StatsManifest['routes'][number]>();
  const add = (path: string, canonicalPath: string, title: string) => {
    const previous = routes.get(path);
    if (previous && previous.canonicalPath !== canonicalPath)
      throw Error('stats_route_conflict');
    routes.set(path, { path, canonicalPath, title });
  };
  const chrome = [
    'home',
    'articles',
    'topics',
    'notes',
    'about',
    'contribute',
    'legal',
    'stats',
    'search',
  ] as const;
  chromePaths.forEach((path, i) => {
    add(path, path, words.zh[chrome[i]]);
    add(`/en${path}`, `/en${path}`, words.en[chrome[i]]);
  });
  for (const [path, title] of [
    ['/tags/', words.zh.tags],
    ['/authors/', words.zh.authors],
  ]) {
    add(path, path, title);
    add(`/en${path}`, path, title);
  }
  for (const page of publicPages(p)) {
    const title =
      page.kind === 'detail'
        ? page.content.title
        : collectionText(page, 'zh').title;
    add(page.path, page.path, title);
    if (!chromePaths.includes(page.path))
      add(`/en${page.path}`, page.path, title);
  }
  for (const route of p.snapshot.routes)
    if (route.kind === 'redirect') {
      const item = p.contentById.get(route.contentId)!;
      add(route.path, item.canonicalPath, item.title);
    }
  return validateManifest({
    schemaVersion: 1,
    generation: p.snapshot.generation,
    snapshotSha256: hash,
    counts: {
      notes: stats.counts.note,
      curatedArticles: stats.counts.curated_article,
      topics: stats.counts.topic,
      tags: stats.counts.tags,
    },
    routes: [...routes.values()].sort((a, b) => (a.path < b.path ? -1 : 1)),
  });
}
