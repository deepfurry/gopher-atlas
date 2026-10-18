import {
  rumBotFilter,
  type Readership,
  type StatsRange,
  type Coverage,
} from '../../src/lib/stats/readership-contract';
import type { StatsManifest } from '../manifest';
import type { Database } from './db';

interface Site {
  day_utc: string;
  page_loads: number;
  visits: number;
  quality_state: 'observed' | 'sampled-estimate' | 'partial';
  archive_at: string;
  bot_filter: typeof rumBotFilter;
}
interface State {
  day_utc: string;
  dimension: 'site' | 'pages' | 'referrers';
  last_result: string;
  last_success_at: string | null;
}
interface Page {
  day_utc: string;
  canonical_public_path: string;
  page_loads: number;
}
interface Referral {
  day_utc: string;
  source_key: 'direct-unknown' | 'search' | 'external-other';
  visits: number;
}
const date = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export async function readership(
  db: Database,
  manifest: StatsManifest,
  range: StatsRange,
  now: number,
): Promise<Readership> {
  const today = Date.parse(`${date(now)}T00:00:00Z`),
    length = Number(range.slice(0, -1));
  const start = date(today - length * 86400000),
    end = date(today - 86400000);
  const result = await db.batch([
    db
      .prepare(
        'SELECT day_utc,page_loads,visits,quality_state,archive_at,bot_filter FROM daily_site_traffic WHERE day_utc BETWEEN ? AND ? ORDER BY day_utc',
      )
      .bind(start, end),
    db
      .prepare(
        'SELECT day_utc,dimension,last_result,last_success_at FROM daily_dimensions WHERE day_utc BETWEEN ? AND ? ORDER BY day_utc',
      )
      .bind(start, end),
    db
      .prepare(
        'SELECT day_utc,canonical_public_path,page_loads FROM daily_page_traffic WHERE day_utc BETWEEN ? AND ?',
      )
      .bind(start, end),
    db
      .prepare(
        'SELECT day_utc,source_key,visits FROM daily_referrers WHERE day_utc BETWEEN ? AND ?',
      )
      .bind(start, end),
    db.prepare('SELECT min(day_utc) AS started FROM daily_site_traffic'),
  ]);
  const sites = result[0].results as unknown as Site[],
    states = result[1].results as unknown as State[];
  const pages = result[2].results as unknown as Page[],
    refs = result[3].results as unknown as Referral[];
  // Never relabel archived C1/unfiltered rows as the new filtered scope.
  if (sites.some((site) => site.bot_filter !== rumBotFilter))
    throw Error('stats_filter_mismatch');
  const siteByDay = new Map(sites.map((s) => [s.day_utc, s]));
  const current = new Map(
    manifest.routes
      .filter((r) => r.path === r.canonicalPath)
      .map((r) => [r.path, r.title]),
  );
  const coveredStart = sites[0]?.day_utc;
  // Leading unavailable history is disclosed. A missing day within the observed
  // interval (or yesterday) prevents presenting a seemingly complete ranking.
  const contiguous =
    !!coveredStart &&
    sites.length ===
      (Date.parse(end) - Date.parse(coveredStart)) / 86400000 + 1;
  const coverage = (dim: State['dimension']): Coverage => {
    const good = states.filter(
      (s) =>
        s.dimension === dim &&
        s.last_result === 'complete' &&
        siteByDay.has(s.day_utc),
    );
    const count = dim === 'site' ? sites.length : good.length;
    return {
      available: dim === 'site' && count > 0,
      status:
        count === 0
          ? 'unavailable'
          : count === length && good.length === length
            ? 'complete'
            : 'partial',
      days: count,
      startedAt: (result[4].results[0]?.started as string | null) ?? null,
      lastCompleteDay: good.at(-1)?.day_utc ?? null,
      lastSyncedAt:
        (dim === 'site'
          ? sites.map((s) => s.archive_at)
          : good.map((s) => s.last_success_at!)
        )
          .sort()
          .at(-1) ?? null,
    };
  };
  const c = {
    site: coverage('site'),
    pages: coverage('pages'),
    referrers: coverage('referrers'),
  };
  let pagesReady = contiguous && c.pages.days === sites.length;
  const refsReady = contiguous && c.referrers.days === sites.length;
  if (pages.some((p) => !current.has(p.canonical_public_path))) {
    pagesReady = false;
    c.pages.status = 'partial';
  }
  c.pages.available = pagesReady;
  c.referrers.available = refsReady;
  const totals = sites.length
    ? sites.reduce(
        (sum, s) => ({
          pageLoads: sum.pageLoads + s.page_loads,
          visits: sum.visits + s.visits,
        }),
        { pageLoads: 0, visits: 0 },
      )
    : null;
  const pageTotals = new Map<string, number>(),
    sourceTotals = new Map<Referral['source_key'], number>();
  if (pagesReady)
    for (const p of pages)
      pageTotals.set(
        p.canonical_public_path,
        (pageTotals.get(p.canonical_public_path) ?? 0) + p.page_loads,
      );
  if (refsReady)
    for (const r of refs)
      sourceTotals.set(
        r.source_key,
        (sourceTotals.get(r.source_key) ?? 0) + r.visits,
      );
  return {
    schemaVersion: 1,
    range,
    timezone: 'UTC',
    start,
    end,
    quality: {
      source: 'Cloudflare Web Analytics RUM',
      botFilter: rumBotFilter,
      visitsAreUniqueUsers: false,
      estimated: sites.some((s) => s.quality_state !== 'observed'),
    },
    coverage: c,
    totals,
    daily: Array.from({ length }, (_, i) => {
      const day = date(today - (length - i) * 86400000),
        row = siteByDay.get(day);
      return {
        date: day,
        pageLoads: row?.page_loads ?? null,
        visits: row?.visits ?? null,
        quality: row?.quality_state ?? null,
      };
    }),
    popularPages: [...pageTotals]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 10)
      .map(([path, pageLoads]) => ({
        path,
        title: current.get(path)!,
        pageLoads,
        share: totals?.pageLoads ? pageLoads / totals.pageLoads : 0,
      })),
    referrers: [...sourceTotals]
      .sort((a, b) => b[1] - a[1])
      .map(([source, visits]) => ({ source, visits })),
  };
}
