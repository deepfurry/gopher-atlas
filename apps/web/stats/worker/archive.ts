import type { RumDay } from '../rum/types';
import { utcWindow } from '../rum/normalize';
import { validateManifest, type StatsManifest } from '../manifest';
import {
  rumBotFilter,
  type CoverageState,
  type SourceKey,
} from '../../src/lib/stats/readership-contract';
import type { Database, Statement } from './db';

type States = Record<'site' | 'pages' | 'referrers', CoverageState>;
const unavailable: States = {
  site: 'unavailable',
  pages: 'unavailable',
  referrers: 'unavailable',
};
const prune =
  'DELETE FROM sync_runs WHERE id NOT IN (SELECT id FROM sync_runs ORDER BY id DESC LIMIT 100)';

function stateStatement(
  db: Database,
  day: string,
  dimension: keyof States,
  state: CoverageState,
  at: string,
  saved: boolean,
) {
  return db
    .prepare(
      `INSERT INTO daily_dimensions VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(day_utc,dimension) DO UPDATE SET last_attempt_at=excluded.last_attempt_at,
    last_success_at=COALESCE(excluded.last_success_at,daily_dimensions.last_success_at),last_result=excluded.last_result
    WHERE excluded.last_attempt_at >= daily_dimensions.last_attempt_at`,
    )
    .bind(day, dimension, at, saved ? at : null, state);
}
function audit(
  db: Database,
  day: string,
  at: string,
  states: States,
  error: string | null,
  duration: number,
) {
  const result = error
    ? 'failed'
    : Object.values(states).every((s) => s === 'complete')
      ? 'success'
      : 'partial';
  return db
    .prepare(
      `INSERT INTO sync_runs (run_at,day_utc,result,site_state,pages_state,referrers_state,error_code,duration_ms,rerun,contract_version)
    SELECT ?,?,?,?,?,?,?,?,EXISTS(SELECT 1 FROM daily_dimensions WHERE day_utc=?),1`,
    )
    .bind(
      at,
      day,
      result,
      states.site,
      states.pages,
      states.referrers,
      error,
      Math.max(0, Math.floor(duration)),
      day,
    );
}

export async function recordFailure(
  db: Database,
  day: string,
  at: string,
  code:
    | 'upstream_unavailable'
    | 'storage_unavailable'
    | 'manifest_unavailable'
    | 'invalid_input',
  duration = 0,
) {
  await db.batch([
    audit(db, day, at, unavailable, code, duration),
    ...(['site', 'pages', 'referrers'] as const).map((dim) =>
      stateStatement(db, day, dim, 'unavailable', at, false),
    ),
    db.prepare(prune),
  ]);
}

/** One day is one transaction. Incomplete dimensions preserve earlier rows. */
export async function archiveDay(
  db: Database,
  dayUtc: string,
  rum: RumDay,
  manifest: StatsManifest,
  at: string,
  duration = 0,
): Promise<States> {
  const window = utcWindow(dayUtc, Date.parse(at));
  validateManifest(manifest);
  if (!rum.ok) {
    await recordFailure(db, dayUtc, at, 'upstream_unavailable', duration);
    return { ...unavailable };
  }
  if (
    rum.dateUtc !== dayUtc ||
    rum.window?.startInclusive !== window.startInclusive ||
    rum.window?.endExclusive !== window.endExclusive ||
    rum.site.quality.status === 'unavailable' ||
    [
      rum.quality,
      rum.site.quality,
      rum.pages.quality,
      rum.referrers.quality,
    ].some((quality) => quality.botFilter !== rumBotFilter)
  ) {
    await recordFailure(db, dayUtc, at, 'invalid_input', duration);
    return { ...unavailable };
  }
  const states: States = {
    site: rum.site.quality.status,
    pages: rum.pages.quality.status,
    referrers: rum.referrers.quality.status,
  };
  const routes = new Map(manifest.routes.map((r) => [r.path, r.canonicalPath]));
  const pages = new Map<string, number>();
  for (const row of rum.pages.rows) {
    const path = routes.get(row.path);
    if (!path) {
      states.pages = 'partial';
      continue;
    }
    pages.set(path, (pages.get(path) ?? 0) + row.pageLoads);
  }
  const sources = new Map<SourceKey, number>();
  for (const row of rum.referrers.rows) {
    if (['gopheratlas.com', 'www.gopheratlas.com'].includes(row.source))
      continue;
    const key: SourceKey =
      row.source === 'direct-unknown'
        ? 'direct-unknown'
        : ['bing.com', 'www.bing.com'].includes(row.source)
          ? 'search'
          : 'external-other';
    sources.set(key, (sources.get(key) ?? 0) + row.visits);
  }
  // Do not let a caller's summary mask contradictory coverage evidence.
  for (const dim of ['pages', 'referrers'] as const) {
    const group = rum[dim];
    if (
      group.coverage.returnedGroups >= group.coverage.limit ||
      group.coverage.pageLoadsDelta !== 0 ||
      group.coverage.visitsDelta !== 0 ||
      (group.rows.length > 0 &&
        (group.quality.sampled !== false || rum.site.quality.sampled !== false))
    )
      states[dim] = 'partial';
  }
  const quality =
    rum.site.quality.status === 'partial'
      ? 'partial'
      : rum.site.quality.sampled === true
        ? 'sampled-estimate'
        : rum.site.quality.sampled === false
          ? 'observed'
          : 'partial';
  if (quality === 'partial') states.site = 'partial';
  const statements: Statement[] = [
    audit(db, dayUtc, at, states, null, duration),
    db
      .prepare(
        `INSERT INTO daily_site_traffic VALUES (?,?,?,?,?,?,?,?,?)
      ON CONFLICT(day_utc) DO UPDATE SET page_loads=excluded.page_loads,visits=excluded.visits,
      sample_min=excluded.sample_min,sample_max=excluded.sample_max,quality_state=excluded.quality_state,
      archive_at=excluded.archive_at,source_window=excluded.source_window WHERE excluded.archive_at >= daily_site_traffic.archive_at`,
      )
      .bind(
        dayUtc,
        rum.site.pageLoads,
        rum.site.visits,
        rum.site.quality.sampleIntervalRange?.[0] ?? null,
        rum.site.quality.sampleIntervalRange?.[1] ?? null,
        rumBotFilter,
        quality,
        at,
        `${window.startInclusive}/${window.endExclusive}`,
      ),
  ];
  // Table/column names are compile-time literals; all data is bound. json_each
  // keeps a large day's replacement within a small fixed number of statements.
  if (states.pages === 'complete') {
    const guard = `NOT EXISTS(SELECT 1 FROM daily_dimensions WHERE day_utc=? AND dimension='pages' AND last_attempt_at>?)`;
    statements.push(
      db
        .prepare(`DELETE FROM daily_page_traffic WHERE day_utc=? AND ${guard}`)
        .bind(dayUtc, dayUtc, at),
      db
        .prepare(
          `INSERT INTO daily_page_traffic SELECT ?,json_extract(value,'$.path'),json_extract(value,'$.count'),'observed',? FROM json_each(?) WHERE ${guard}`,
        )
        .bind(
          dayUtc,
          at,
          JSON.stringify([...pages].map(([path, count]) => ({ path, count }))),
          dayUtc,
          at,
        ),
    );
  }
  if (states.referrers === 'complete') {
    const guard = `NOT EXISTS(SELECT 1 FROM daily_dimensions WHERE day_utc=? AND dimension='referrers' AND last_attempt_at>?)`;
    statements.push(
      db
        .prepare(`DELETE FROM daily_referrers WHERE day_utc=? AND ${guard}`)
        .bind(dayUtc, dayUtc, at),
      db
        .prepare(
          `INSERT INTO daily_referrers SELECT ?,json_extract(value,'$.source'),json_extract(value,'$.count'),'observed',? FROM json_each(?) WHERE ${guard}`,
        )
        .bind(
          dayUtc,
          at,
          JSON.stringify(
            [...sources].map(([source, count]) => ({ source, count })),
          ),
          dayUtc,
          at,
        ),
    );
  }
  for (const dim of ['site', 'pages', 'referrers'] as const)
    statements.push(
      stateStatement(
        db,
        dayUtc,
        dim,
        states[dim],
        at,
        dim === 'site' || states[dim] === 'complete',
      ),
    );
  statements.push(db.prepare(prune));
  try {
    await db.batch(statements);
  } catch {
    await recordFailure(db, dayUtc, at, 'storage_unavailable', duration);
    throw Error('stats_storage_unavailable');
  }
  return states;
}

export async function observeContent(
  db: Database,
  manifest: StatsManifest,
  at: string,
) {
  validateManifest(manifest);
  const c = manifest.counts;
  // Observe today's deployed inventory once; never backfill previous traffic days.
  await db
    .prepare(
      `INSERT INTO daily_content_counts VALUES (?,?,?,?,?,?,?) ON CONFLICT(day_utc) DO UPDATE SET
    notes=excluded.notes,curated_articles=excluded.curated_articles,topics=excluded.topics,tags=excluded.tags,
    snapshot_generation=excluded.snapshot_generation,observed_at=excluded.observed_at WHERE excluded.observed_at>=daily_content_counts.observed_at`,
    )
    .bind(
      at.slice(0, 10),
      c.notes,
      c.curatedArticles,
      c.topics,
      c.tags,
      manifest.generation,
      at,
    )
    .run();
}
