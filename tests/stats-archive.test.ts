import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from 'vitest';
import { archiveDay, observeContent } from '../apps/web/stats/worker/archive';
import { fetchStats, runSchedule } from '../apps/web/stats/worker/index';
import { readership } from '../apps/web/stats/worker/api';
import { loadManifest, validateManifest } from '../apps/web/stats/manifest';
import { validateReadership } from '../apps/web/src/lib/stats/readership';
import type { Database } from '../apps/web/stats/worker/db';
import type { RumConfig } from '../apps/web/stats/rum/types';
import { manifest, assets, rum, migrate, now, at } from './helpers/stats';

let db: Database, dispose: () => Promise<void>;
const m = manifest();
beforeAll(async () => {
  vi.stubEnv('WRANGLER_SEND_METRICS', 'false');
  vi.stubEnv('CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV', 'false');
  mkdirSync('.cache/stats-c1', { recursive: true });
  const folder = mkdtempSync('.cache/stats-c1/db-');
  const config = resolve(folder, 'wrangler.json');
  writeFileSync(
    config,
    JSON.stringify({
      name: 'stats-test',
      compatibility_date: '2026-09-10',
      send_metrics: false,
      d1_databases: [
        {
          binding: 'STATS_DB',
          database_name: 'local-test',
          database_id: 'local-test',
          remote: false,
        },
      ],
    }),
  );
  writeFileSync(resolve(folder, '.dev.vars'), '');
  const { getPlatformProxy } = await import('wrangler');
  const proxy = await getPlatformProxy<{ STATS_DB: Database }>({
    configPath: config,
    persist: false,
    remoteBindings: false,
  });
  db = proxy.env.STATS_DB;
  dispose = proxy.dispose;
  await migrate(db);
}, 60000);
beforeEach(async () => {
  for (const table of [
    'daily_site_traffic',
    'daily_page_traffic',
    'daily_referrers',
    'daily_dimensions',
    'daily_content_counts',
    'sync_runs',
  ])
    await db.prepare(`DELETE FROM ${table}`).run();
});
afterAll(async () => {
  await dispose?.();
  vi.unstubAllEnvs();
});
afterEach(() => vi.restoreAllMocks());
const rows = async (table: string) =>
  (await db.prepare(`SELECT * FROM ${table}`).all()).results;
const get = (path = '/api/stats?range=7d', method = 'GET') =>
  fetchStats(
    new Request(`http://local${path}`, { method }),
    { ASSETS: assets(m), STATS_DB: db, STATS_READ_ENABLED: 'true' },
    now,
  );

it('creates independent constrained local D1 tables and refuses accidental duplicate schema execution', async () => {
  await expect(migrate(db)).rejects.toThrow();
  await expect(
    db
      .prepare(
        "INSERT INTO daily_referrers VALUES ('2026-10-18','private.example',1,'observed',?)",
      )
      .bind(at)
      .run(),
  ).rejects.toThrow();
  await expect(
    db
      .prepare(
        "INSERT INTO daily_referrers VALUES ('2026-10-18','search',-1,'observed',?)",
      )
      .bind(at)
      .run(),
  ).rejects.toThrow();
});
it('replaces a day idempotently, preserves decimals, aliases and safe sources, and records reruns', async () => {
  const r = await rum();
  r.site.pageLoads = 18.25;
  r.pages.rows[0].pageLoads = 10.25;
  await archiveDay(db, '2026-10-18', r, m, at);
  await archiveDay(db, '2026-10-18', r, m, at);
  expect(await rows('daily_site_traffic')).toHaveLength(1);
  expect((await rows('daily_site_traffic'))[0].page_loads).toBe(18.25);
  expect((await rows('daily_site_traffic'))[0].bot_filter).toBe(
    'cloudflare-rum-bot-0',
  );
  const response = await (await get()).json();
  expect(response.quality.botFilter).toBe('cloudflare-rum-bot-0');
  validateReadership(response, '7d');
  await expect(
    db.prepare("UPDATE daily_site_traffic SET bot_filter='unverified'").run(),
  ).rejects.toThrow();
  expect(await rows('daily_page_traffic')).toHaveLength(3);
  expect((await rows('sync_runs')).map((r) => r.rerun)).toEqual([0, 1]);
  const encoded = JSON.stringify(await rows('daily_referrers'));
  expect(encoded).not.toMatch(
    /gopheratlas\.com|unknown\.example|www.bing|synthetic/,
  );
  expect(
    (await rows('daily_referrers')).map((r) => r.source_key).sort(),
  ).toEqual(['direct-unknown', 'external-other', 'search']);
});
it.each(['day', 'site', 'pages', 'referrers'] as const)(
  'refuses to archive mixed or old %s filter scope',
  async (dimension) => {
    const r = await rum();
    await archiveDay(db, '2026-10-18', r, m, at);
    const before = await rows('daily_site_traffic');
    Object.assign(dimension === 'day' ? r.quality : r[dimension].quality, {
      botFilter: 'unverified',
    });
    r.site.pageLoads = 99;
    expect(
      await archiveDay(db, '2026-10-18', r, m, '2026-10-19T04:00:00.000Z'),
    ).toEqual({
      site: 'unavailable',
      pages: 'unavailable',
      referrers: 'unavailable',
    });
    expect(await rows('daily_site_traffic')).toEqual(before);
    expect((await rows('sync_runs')).at(-1)?.error_code).toBe('invalid_input');
  },
);
it('does not relabel old archived rows through the REST API', async () => {
  await archiveDay(db, '2026-10-18', await rum(), m, at);
  // Wrap the real D1 proxy: its remote methods cannot be replaced by a spy.
  const legacy: Database = {
    prepare: db.prepare.bind(db),
    exec: db.exec.bind(db),
    async batch<T>(statements: Parameters<Database['batch']>[0]) {
      const result = await db.batch<T>(statements);
      Object.assign(result[0].results[0] as Record<string, unknown>, {
        bot_filter: 'unverified',
      });
      return result;
    },
  };
  const response = await fetchStats(
    new Request('http://local/api/stats?range=7d'),
    {
      ASSETS: assets(m),
      STATS_DB: legacy,
      STATS_READ_ENABLED: 'true',
    },
    now,
  );
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: 'stats_unavailable' });
});
it('saves sampled Site despite partial rankings, retaining old complete rows with downgraded availability', async () => {
  const r = await rum();
  await archiveDay(db, '2026-10-18', r, m, at);
  const old = await rows('daily_page_traffic');
  r.site.pageLoads = 20.5;
  r.site.quality.sampled = true;
  r.site.quality.sampleIntervalRange = [5, 5];
  r.quality.status = 'partial';
  r.pages.quality.status = 'partial';
  r.referrers.quality.status = 'partial';
  await archiveDay(db, '2026-10-18', r, m, '2026-10-19T04:00:00.000Z');
  expect(await rows('daily_page_traffic')).toEqual(old);
  const response = await readership(db, m, '7d', now);
  expect(response.totals?.pageLoads).toBe(20.5);
  expect(response.daily.at(-1)?.quality).toBe('sampled-estimate');
  expect(response.coverage.site.available).toBe(true);
  expect(response.coverage.pages.available).toBe(false);
  expect(response.popularPages).toEqual([]);
  expect(response.referrers).toEqual([]);
});
it('preserves explicit partial Site quality even when sampling is absent', async () => {
  const r = await rum();
  r.site.quality.status = 'partial';
  r.site.quality.sampled = false;
  await archiveDay(db, '2026-10-18', r, m, at);
  const response = await readership(db, m, '7d', now);
  expect(response.totals?.pageLoads).toBe(r.site.pageLoads);
  expect(response.daily.at(-1)?.quality).toBe('partial');
  expect(response.coverage.site).toMatchObject({
    available: true,
    status: 'partial',
  });
  expect((await rows('daily_site_traffic'))[0].quality_state).toBe('partial');
});
it('isolates independent Page and Referer quality; unknown paths are never persisted', async () => {
  const r = await rum();
  r.pages.rows[0].path = '/_private/personal-token/';
  await archiveDay(db, '2026-10-18', r, m, at);
  expect(await rows('daily_page_traffic')).toEqual([]);
  const output = await readership(db, m, '7d', now);
  expect(output.coverage.pages.available).toBe(false);
  expect(output.coverage.referrers.available).toBe(true);
  expect(JSON.stringify([output, ...(await rows('sync_runs'))])).not.toContain(
    'personal-token',
  );
  const other = await rum();
  other.referrers.quality.status = 'partial';
  await archiveDay(db, '2026-10-18', other, m, '2026-10-19T05:00:00.000Z');
  const result = await readership(db, m, '7d', now);
  expect(result.popularPages).toHaveLength(3);
  expect(result.referrers).toEqual([]);
});
it('only merges actual published redirects and locale aliases, and stops exposing withdrawn paths', async () => {
  const alias = m.routes.find(
    (r) => r.path !== r.canonicalPath && !r.path.startsWith('/en/'),
  )!;
  const r = await rum();
  r.pages.rows[0].path = alias.path;
  r.pages.rows[1].path = alias.canonicalPath;
  await archiveDay(db, '2026-10-18', r, m, at);
  expect(
    (await rows('daily_page_traffic')).find(
      (p) => p.canonical_public_path === alias.canonicalPath,
    )?.page_loads,
  ).toBeGreaterThanOrEqual(15);
  const reduced = structuredClone(m);
  reduced.routes = reduced.routes.filter(
    (p) => p.canonicalPath !== alias.canonicalPath,
  );
  expect((await readership(db, reduced, '7d', now)).popularPages).toEqual([]);
});
it('rolls back site and rankings together if replacement fails midway, with safe failure audit', async () => {
  const r = await rum();
  await archiveDay(db, '2026-10-18', r, m, at);
  const before = {
    site: await rows('daily_site_traffic'),
    pages: await rows('daily_page_traffic'),
  };
  await db
    .prepare(
      "CREATE TRIGGER fixture_failure BEFORE INSERT ON daily_referrers BEGIN SELECT RAISE(ABORT, 'synthetic-private-storage-error'); END",
    )
    .run();
  try {
    r.site.pageLoads = 99;
    await expect(
      archiveDay(db, '2026-10-18', r, m, '2026-10-19T04:00:00.000Z'),
    ).rejects.toThrow('stats_storage_unavailable');
  } finally {
    await db.prepare('DROP TRIGGER fixture_failure').run();
  }
  expect(await rows('daily_site_traffic')).toEqual(before.site);
  expect(await rows('daily_page_traffic')).toEqual(before.pages);
  expect(JSON.stringify(await rows('sync_runs'))).not.toContain(
    'private-storage',
  );
  expect((await rows('sync_runs')).at(-1)?.error_code).toBe(
    'storage_unavailable',
  );
});
it('upstream errors and older concurrent completions cannot erase valid data', async () => {
  const r = await rum();
  await archiveDay(db, '2026-10-18', r, m, at);
  const saved = await rows('daily_site_traffic');
  r.site.pageLoads = 1;
  await archiveDay(db, '2026-10-18', r, m, '2026-10-19T02:00:00.000Z');
  expect(await rows('daily_site_traffic')).toEqual(saved);
  await archiveDay(
    db,
    '2026-10-18',
    {
      ...r,
      ok: false,
      error: { code: 'graphql_error', stage: 'pages' },
      site: null,
      pages: null,
      referrers: null,
    },
    m,
    '2026-10-19T05:00:00.000Z',
  );
  expect(await rows('daily_site_traffic')).toEqual(saved);
});
it('keeps genuine zero distinct from missing days and does not bridge internal gaps', async () => {
  const r = await rum();
  r.site.pageLoads = r.site.visits = 0;
  r.pages.rows = [];
  r.referrers.rows = [];
  await archiveDay(db, '2026-10-18', r, m, at);
  await archiveDay(db, '2026-10-16', await rum('2026-10-16'), m, at);
  const response = await readership(db, m, '7d', now);
  validateReadership(response, '7d');
  expect(response.daily.at(-1)?.pageLoads).toBe(0);
  expect(response.daily.at(-1)?.visits).toBe(0);
  expect(response.daily.at(-2)?.pageLoads).toBeNull();
  expect(response.daily.at(-2)?.visits).toBeNull();
  expect(response.quality.botFilter).toBe('cloudflare-rum-bot-0');
  expect(response.popularPages).toEqual([]);
  expect(response.coverage.site).toMatchObject({
    available: true,
    status: 'partial',
    days: 2,
  });
});
it('enforces REST method/range boundaries and returns no internal diagnostics or credentials', async () => {
  expect((await get()).headers.get('Cache-Control')).toContain('max-age=300');
  const empty = await (await get()).json();
  expect(empty.totals).toBeNull();
  expect(empty.coverage.site.available).toBe(false);
  expect(
    empty.daily.every(
      (row: { pageLoads: unknown; visits: unknown }) =>
        row.pageLoads === null && row.visits === null,
    ),
  ).toBe(true);
  for (const range of ['7d', '30d', '90d']) {
    const res = await get(`/api/stats?range=${range}`);
    expect(res.status).toBe(200);
    expect((await res.json()).daily).toHaveLength(Number(range.slice(0, -1)));
  }
  expect((await (await get('/api/stats')).json()).range).toBe('30d');
  for (const query of [
    '?range=1d',
    '?range=7d&range=90d',
    '?sql=DELETE',
    '?range=',
  ])
    expect((await get(`/api/stats${query}`)).status).toBe(400);
  for (const method of ['POST', 'PUT', 'DELETE', 'HEAD'])
    expect((await get('/api/stats', method)).status).toBe(405);
  expect((await get('/api/stats/sync', 'POST')).status).toBe(404);
  expect(await (await get('/ordinary-static/')).text()).toBe('static-response');
  const off = await fetchStats(
    new Request('http://local/api/stats'),
    { ASSETS: assets(m) },
    now,
  );
  expect(off.status).toBe(503);
  const bad = await fetchStats(
    new Request('http://local/api/stats'),
    {
      ASSETS: assets(m),
      STATS_READ_ENABLED: 'true',
      STATS_DB: {
        ...db,
        batch: async () => {
          throw Error('private-provider-token');
        },
      },
    },
    now,
  );
  expect(await bad.text()).toBe('{"error":"stats_unavailable"}');
});
it('uses a stable two-day schedule and only observes content on the execution day, with sync disabled by default', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const reader = vi.fn(async (_config, day: string) => rum(day));
  const env = { ASSETS: assets(m), STATS_DB: db, STATS_SYNC_ENABLED: 'true' };
  await runSchedule({ ...env, STATS_SYNC_ENABLED: undefined }, now, reader);
  expect(reader).not.toHaveBeenCalled();
  await runSchedule(env, now, reader);
  expect(reader.mock.calls.map((c) => c[1])).toEqual([
    '2026-10-17',
    '2026-10-18',
  ]);
  expect((await rows('daily_content_counts')).map((r) => r.day_utc)).toEqual([
    '2026-10-19',
  ]);
  await observeContent(db, m, at);
  expect(await rows('daily_content_counts')).toHaveLength(1);
  expect(warn).not.toHaveBeenCalled();
});
it.each([
  ['input', 'invalid_config'],
  ['settings', 'forbidden'],
  ['site', 'graphql_error'],
  ['pages', 'invalid_response'],
  ['referrers', 'network_error'],
] as const)(
  'logs only date, stage and fixed code on %s failure',
  async (stage, code) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const env = {
      ASSETS: assets(m),
      STATS_DB: db,
      STATS_SYNC_ENABLED: 'true',
      RUM_ACCOUNT_ID: 'a'.repeat(32),
      RUM_SITE_TAG: 'b'.repeat(32),
      RUM_ANALYTICS_TOKEN: 'synthetic-private-token',
      RUM_GROUP_LIMIT: '12345',
    };
    const reader = vi.fn(async (config: RumConfig, day: string) => ({
      ...(await rum(day)),
      ok: false as const,
      error: { stage, code, message: 'synthetic-raw-graphql-error' },
      // Extra runtime fields must never leak through logging the result or error.
      config,
      headers: { Authorization: `Bearer ${config.token}` },
      response: { errors: [{ message: 'synthetic-raw-graphql-error' }] },
      site: null,
      pages: null,
      referrers: null,
    }));
    await expect(runSchedule(env, now, reader)).rejects.toThrow(
      'stats_sync_unavailable',
    );
    expect(warn.mock.calls).toEqual([
      [{ day: '2026-10-17', stage, code }],
      [{ day: '2026-10-18', stage, code }],
    ]);
    const logged = JSON.stringify(warn.mock.calls);
    for (const value of [
      env.STATS_SYNC_ENABLED,
      env.RUM_ACCOUNT_ID,
      env.RUM_SITE_TAG,
      env.RUM_ANALYTICS_TOKEN,
      env.RUM_GROUP_LIMIT,
      'Authorization',
      'Bearer',
      'synthetic-raw-graphql-error',
    ])
      expect(logged).not.toContain(value);
    expect(await rows('daily_site_traffic')).toEqual([]);
    expect(
      (await rows('sync_runs')).map(({ day_utc, result, error_code }) => ({
        day_utc,
        result,
        error_code,
      })),
    ).toEqual(
      ['2026-10-17', '2026-10-18'].map((day_utc) => ({
        day_utc,
        result: 'failed',
        error_code: 'upstream_unavailable',
      })),
    );
  },
);
it('exports only validated public routes/counts and verifies the deployed marker', async () => {
  expect(await loadManifest(assets(m))).toEqual(m);
  expect(JSON.stringify(m)).not.toMatch(
    /bodyMarkdown|assets\.gopheratlas|authorId|RUM_ANALYTICS_TOKEN/,
  );
  const invalid = structuredClone(m);
  invalid.routes.push({
    path: '/_private/',
    canonicalPath: '/',
    title: 'Private',
  });
  expect(() => validateManifest(invalid)).toThrow();
  const mismatched = {
    fetch: async (r: Request) =>
      r.url.endsWith('gopheratlas-build.json')
        ? Response.json({ generation: 0 })
        : Response.json(m),
  };
  await expect(loadManifest(mismatched)).rejects.toThrow(
    'stats_manifest_mismatch',
  );
  // Production binding and disabled-by-default policy are checked in site-release.test.ts.
});
