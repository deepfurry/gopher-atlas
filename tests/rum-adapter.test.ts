import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readRumDay } from '../apps/web/stats/rum/client';
import { utcWindow } from '../apps/web/stats/rum/normalize';
import {
  pagesQuery,
  referrersQuery,
  settingsQuery,
  siteQuery,
} from '../apps/web/stats/rum/queries';
import type { RumConfig, RumDay } from '../apps/web/stats/rum/types';

const fixture = () =>
  JSON.parse(readFileSync('tests/fixtures/rum-daily.json', 'utf8'));
const config: RumConfig = {
  accountId: 'a'.repeat(32),
  rumSiteTag: 'b'.repeat(32),
  token: 'synthetic-private-token',
  requestHost: 'gopheratlas.com',
  groupLimit: 20,
};
const now = () => Date.parse('2026-10-18T00:00:00Z');
const date = '2026-10-16';
const stages = ['settings', 'site', 'pages', 'referrers'] as const;
function setup(data = fixture()) {
  let i = 0;
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json(data[stages[i++]]),
  );
  return { data, fetch, now };
}
function success(day: RumDay) {
  expect(day.ok).toBe(true);
  if (!day.ok) throw Error('unexpected unavailable fixture');
  return day;
}
function unavailable(day: RumDay, code: string, stage?: string) {
  expect(day).toMatchObject({
    ok: false,
    quality: { status: 'unavailable', botFilter: 'cloudflare-rum-bot-0' },
    error: { code, ...(stage ? { stage } : {}) },
    site: null,
    pages: null,
    referrers: null,
  });
  const encoded = JSON.stringify(day);
  for (const secret of [
    config.token,
    config.accountId,
    config.rumSiteTag,
    'private-upstream-detail',
  ]) {
    expect(encoded).not.toContain(secret);
  }
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('snapshots configuration so a caller update cannot mix accounts/sites during a day read', async () => {
  const current = { ...config },
    r = setup();
  r.fetch.mockImplementationOnce(async () => {
    current.accountId = 'c'.repeat(32);
    current.rumSiteTag = 'd'.repeat(32);
    current.token = 'rotated-synthetic-token';
    return Response.json(r.data.settings);
  });
  // Use the three remaining replies explicitly: overriding the first mock does
  // not advance setup's fixture cursor.
  r.fetch.mockResolvedValueOnce(Response.json(r.data.site));
  r.fetch.mockResolvedValueOnce(Response.json(r.data.pages));
  r.fetch.mockResolvedValueOnce(Response.json(r.data.referrers));
  success(await readRumDay(current, date, r));
  for (const [, init] of r.fetch.mock.calls) {
    expect(init!.headers).toMatchObject({
      Authorization: `Bearer ${config.token}`,
    });
    expect(JSON.parse(init!.body as string).variables.accountTag).toBe(
      config.accountId,
    );
  }
});

it('reads the fixed Settings + three scoped queries and preserves RUM metrics', async () => {
  const r = setup(),
    before = JSON.stringify(r.data);
  const day = success(await readRumDay(config, date, r));
  expect(day).toMatchObject({
    dateUtc: date,
    source: 'cloudflare-rum',
    requestHost: 'gopheratlas.com',
    window: {
      startInclusive: '2026-10-16T00:00:00Z',
      endExclusive: '2026-10-17T00:00:00Z',
    },
    quality: {
      status: 'complete',
      botFilter: 'cloudflare-rum-bot-0',
      sampled: false,
    },
    site: { pageLoads: 18, visits: 7, sampleInterval: 1 },
    pages: {
      coverage: { returnedGroups: 3, pageLoadsDelta: 0, visitsDelta: 0 },
    },
  });
  expect(
    day.pages.rows.map((row) => [row.path, row.pageLoads, row.visits]),
  ).toEqual([
    ['/', 10, 5],
    ['/en/', 5, 2],
    ['/notes/offline/', 3, 0],
  ]);
  expect(JSON.stringify(r.data)).toBe(before);
  expect(r.fetch).toHaveBeenCalledTimes(4);
  for (const dimension of ['site', 'pages', 'referrers'] as const) {
    expect(day[dimension].quality.botFilter).toBe('cloudflare-rum-bot-0');
    expect(day[dimension].quality.warnings).not.toContain(
      'bot_filter_unverified',
    );
  }
  const queries = [settingsQuery, siteQuery, pagesQuery, referrersQuery];
  r.fetch.mock.calls.forEach(([url, init], i) => {
    expect(url).toBe('https://api.cloudflare.com/client/v4/graphql');
    expect(init).toMatchObject({
      method: 'POST',
      redirect: 'manual',
      cache: 'no-store',
      headers: { Authorization: `Bearer ${config.token}` },
    });
    const body = JSON.parse(init!.body as string);
    expect(body.query).toBe(queries[i]);
    expect(body.variables.accountTag).toBe(config.accountId);
    expect(init).not.toHaveProperty('credentials');
    expect(init!.body).not.toContain(config.token);
    if (i > 0) {
      expect(body.variables).toMatchObject({
        siteTag: config.rumSiteTag,
        start: day.window!.startInclusive,
        end: day.window!.endExclusive,
        limit: i === 1 ? 2 : 20,
      });
      expect(body.query).toContain('requestHost: "gopheratlas.com"');
      expect(body.query).toContain('datetime_geq: $start, datetime_lt: $end');
      const filters = body.query.match(/filter:\s*\{[^}]*siteTag:[^}]*\}/g);
      expect(filters).toEqual([
        'filter: { siteTag: $siteTag, requestHost: "gopheratlas.com", datetime_geq: $start, datetime_lt: $end, bot: 0 }',
      ]);
      expect(body.query).not.toMatch(
        /botScore|requestSource|datetime_leq|cursor|mutation/,
      );
    }
  });
  for (const secret of [config.accountId, config.rumSiteTag, config.token])
    expect(JSON.stringify(day)).not.toContain(secret);
});

it('isolates internal referrals, unknown/direct, search and unclassified domains without changing Visits', async () => {
  const day = success(await readRumDay(config, date, setup()));
  expect(day.referrers.rows).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        source: 'gopheratlas.com',
        category: 'internal',
        visits: 0,
      }),
      expect.objectContaining({
        source: 'www.gopheratlas.com',
        category: 'internal',
        visits: 1,
      }),
      expect.objectContaining({
        source: 'direct-unknown',
        category: 'direct-unknown',
        visits: 4,
      }),
      expect.objectContaining({
        source: 'www.bing.com',
        category: 'search',
        visits: 1,
      }),
      expect.objectContaining({
        source: 'unknown.example',
        category: 'external',
        visits: 1,
      }),
      expect.objectContaining({
        source: 'unapproved.gopheratlas.com',
        category: 'external',
        visits: 0,
      }),
    ]),
  );
  expect(day.referrers.rows[0].source).toBe('direct-unknown');
  expect(day.referrers.coverage.visits).toBe(7); // Includes internal only for reconciliation.
  expect(day.site.visits).toBe(7);
});

describe('unavailable never becomes zero, and raw failure details never escape', () => {
  it.each([
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [429, 'rate_limited'],
    [500, 'http_error'],
    [302, 'http_error'],
  ])('HTTP %s', async (status, code) => {
    const r = setup();
    r.fetch.mockResolvedValue(
      new Response(`private-upstream-detail ${config.token}`, {
        status: Number(status),
      }),
    );
    unavailable(await readRumDay(config, date, r), String(code), 'settings');
    expect(r.fetch).toHaveBeenCalledTimes(1);
  });
  it('sanitizes network failures and invalid JSON without logs', async () => {
    const log = vi.spyOn(console, 'error'),
      r = setup();
    r.fetch.mockRejectedValue(
      new Error(`private-upstream-detail ${config.token}`),
    );
    unavailable(await readRumDay(config, date, r), 'network_error');
    r.fetch.mockResolvedValue(
      new Response(`private-upstream-detail ${config.rumSiteTag}`),
    );
    unavailable(await readRumDay(config, date, r), 'invalid_json');
    expect(log).not.toHaveBeenCalled();
  });
  it.each(stages)(
    'rejects HTTP-200 GraphQL errors at %s even alongside usable data',
    async (stage) => {
      const r = setup();
      r.data[stage].errors = [
        {
          message: `${config.token} private-upstream-detail`,
          extensions: { account: config.accountId },
        },
      ];
      unavailable(await readRumDay(config, date, r), 'graphql_error', stage);
      expect(r.fetch).toHaveBeenCalledTimes(stages.indexOf(stage) + 1);
    },
  );
  it.each([[], {}, 'error'])(
    'rejects every non-null errors value: %j',
    async (errors) => {
      const r = setup();
      r.data.site.errors = errors;
      unavailable(await readRumDay(config, date, r), 'graphql_error');
    },
  );
  it.each([
    null,
    {},
    { data: null },
    { data: { viewer: {} } },
    { data: { viewer: { accounts: [] } } },
    { data: { viewer: { accounts: [{}, {}] } } },
  ])('rejects missing account/data shape: %j', async (body) => {
    const r = setup();
    r.data.site = body;
    const result = await readRumDay(config, date, r);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(['invalid_response', 'account_unavailable']).toContain(
        result.error.code,
      );
    expect(result.site).toBeNull();
  });
  it('distinguishes valid empty aggregates from missing arrays', async () => {
    const r = setup();
    for (const stage of ['site', 'pages', 'referrers'])
      r.data[stage].data.viewer.accounts[0].rumPageloadEventsAdaptiveGroups =
        [];
    const day = success(await readRumDay(config, date, r));
    expect(day.site).toMatchObject({ pageLoads: 0, visits: 0 });
    expect(day.pages.rows).toEqual([]);
    expect(day.referrers.rows).toEqual([]);
    expect(day.quality).toMatchObject({
      status: 'complete',
      sampled: 'unknown',
    });
    const missing = setup(r.data);
    delete missing.data.site.data.viewer.accounts[0]
      .rumPageloadEventsAdaptiveGroups;
    unavailable(await readRumDay(config, date, missing), 'invalid_response');
  });
  it('bounds response bytes', async () => {
    const r = setup();
    r.fetch.mockResolvedValue(new Response('x'.repeat(8 * 1024 * 1024 + 1)));
    unavailable(await readRumDay(config, date, r), 'response_too_large');
  });
  it('times out and supports cancellation, with no automatic retry', async () => {
    vi.useFakeTimers();
    const r = setup();
    r.fetch.mockImplementation(
      async (_url, init) =>
        new Promise((_resolve, reject) => {
          init!.signal!.addEventListener(
            'abort',
            () => reject(new Error(config.token)),
            { once: true },
          );
        }),
    );
    const pending = readRumDay(config, date, r);
    await vi.advanceTimersByTimeAsync(10000);
    unavailable(await pending, 'timeout');
    expect(r.fetch).toHaveBeenCalledTimes(1);
    const controller = new AbortController();
    controller.abort(config.token);
    unavailable(
      await readRumDay(config, date, { ...r, signal: controller.signal }),
      'aborted',
    );
    expect(r.fetch).toHaveBeenCalledTimes(1);
  });
});

it.each(['2026-02-30', '2026-13-01', '2026-10-16T00:00:00Z', '', '9999-12-31'])(
  'rejects invalid date %s before any request',
  async (dateUtc) => {
    const r = setup();
    unavailable(await readRumDay(config, dateUtc, r), 'invalid_date', 'input');
    expect(r.fetch).not.toHaveBeenCalled();
  },
);
it('uses UTC half-open days across months/leap days, and excludes today/future', async () => {
  expect(utcWindow('2024-02-29', now()).endExclusive).toBe(
    '2024-03-01T00:00:00Z',
  );
  expect(utcWindow('2025-12-31', now()).endExclusive).toBe(
    '2026-01-01T00:00:00Z',
  );
  expect(() =>
    utcWindow('2026-10-17', Date.parse('2026-10-18T00:30:00+08:00')),
  ).toThrow('incomplete_day');
  expect(utcWindow('2026-10-17', now()).endExclusive).toBe(
    '2026-10-18T00:00:00Z',
  );
  for (const dateUtc of ['2026-10-18', '2026-10-19']) {
    const r = setup();
    unavailable(await readRumDay(config, dateUtc, r), 'incomplete_day');
    expect(r.fetch).not.toHaveBeenCalled();
  }
});

it.each([
  ['enabled', false, 'dataset_disabled'],
  ['maxDuration', 86399, 'query_limit'],
  ['notOlderThan', 172799, 'outside_retention'],
  ['maxPageSize', 19, 'query_limit'],
  ['maxNumberOfFields', 5, 'query_limit'],
  ['maxPageSize', 1.5, 'invalid_response'],
  ['maxDuration', null, 'invalid_response'],
  ['availableFields', [], 'fields_unavailable'],
])(
  'enforces current Settings %s instead of historical account limits',
  async (field, value, code) => {
    const r = setup();
    r.data.settings.data.viewer.accounts[0].settings.rumPageloadEventsAdaptiveGroups[
      field as string
    ] = value;
    unavailable(await readRumDay(config, date, r), String(code), 'settings');
    expect(r.fetch).toHaveBeenCalledTimes(1);
  },
);
it('accepts exact retention/day limits and re-reads settings for each invocation', async () => {
  const r = setup();
  const s =
    r.data.settings.data.viewer.accounts[0].settings
      .rumPageloadEventsAdaptiveGroups;
  s.notOlderThan = 172800;
  s.maxDuration = 86400;
  s.maxNumberOfFields = 6;
  success(await readRumDay(config, date, r));
  const next = setup(r.data);
  s.enabled = false;
  unavailable(await readRumDay(config, date, next), 'dataset_disabled');
});

it.each([-1, null, '18', Infinity, Number.MAX_SAFE_INTEGER + 1])(
  'rejects illegal count %j',
  async (value) => {
    const r = setup();
    r.data.site.data.viewer.accounts[0].rumPageloadEventsAdaptiveGroups[0].count =
      value;
    unavailable(await readRumDay(config, date, r), 'invalid_response', 'site');
  },
);
it.each(['count', 'sum', 'avg', 'dimensions'])(
  'rejects missing required %s, not just invalid groups',
  async (field) => {
    const r = setup();
    delete r.data.pages.data.viewer.accounts[0]
      .rumPageloadEventsAdaptiveGroups[1][field];
    unavailable(await readRumDay(config, date, r), 'invalid_response', 'pages');
  },
);
it.each(['visits', 'sampleInterval'])(
  'rejects absent metric %s',
  async (field) => {
    const r = setup(),
      row =
        r.data.site.data.viewer.accounts[0].rumPageloadEventsAdaptiveGroups[0];
    delete row[field === 'visits' ? 'sum' : 'avg'][field];
    unavailable(await readRumDay(config, date, r), 'invalid_response');
  },
);
it.each(['date', 'requestHost'])(
  'rejects wrong %s in any group',
  async (field) => {
    const r = setup();
    r.data.pages.data.viewer.accounts[0].rumPageloadEventsAdaptiveGroups[1].dimensions[
      field
    ] = 'wrong';
    unavailable(await readRumDay(config, date, r), 'invalid_response');
  },
);

it('marks sampling partial conservatively without inflating counts or inventing a combined interval', async () => {
  const r = setup();
  r.data.site.data.viewer.accounts[0].rumPageloadEventsAdaptiveGroups[0].avg.sampleInterval = 5;
  r.data.pages.data.viewer.accounts[0].rumPageloadEventsAdaptiveGroups[0].avg.sampleInterval = 10;
  const day = success(await readRumDay(config, date, r));
  expect(day.site.pageLoads).toBe(18);
  expect(day.site.visits).toBe(7);
  expect(day.pages.rows[0].pageLoads).toBe(10);
  expect(day.quality).toMatchObject({
    status: 'partial',
    sampled: true,
    sampleIntervalRange: [1, 10],
  });
  expect(day.pages.quality.warnings).toContain(
    'sampled_group_coverage_unverified',
  );
  expect(day.referrers.quality.status).toBe('partial');
});
it('keeps null sampling unknown; invalid sampling fails; fractional estimates are not rounded', async () => {
  const r = setup();
  r.data.pages.data.viewer.accounts[0].rumPageloadEventsAdaptiveGroups[0].avg.sampleInterval =
    null;
  const day = success(await readRumDay(config, date, r));
  expect(day.pages.quality).toMatchObject({
    status: 'partial',
    sampled: 'unknown',
  });
  const bad = setup();
  bad.data.site.data.viewer.accounts[0].rumPageloadEventsAdaptiveGroups[0].avg.sampleInterval = 0;
  unavailable(await readRumDay(config, date, bad), 'invalid_response');
  const fractional = setup();
  fractional.data.site.data.viewer.accounts[0].rumPageloadEventsAdaptiveGroups[0].count = 18.25;
  expect(
    success(await readRumDay(config, date, fractional)).site.pageLoads,
  ).toBe(18.25);
});
it('marks exact group limit partial even when counts happen to reconcile', async () => {
  const r = setup();
  const day = success(await readRumDay({ ...config, groupLimit: 6 }, date, r));
  expect(day.referrers.quality.warnings).toContain('group_limit_reached');
  expect(day.quality.status).toBe('partial');
  expect(r.fetch).toHaveBeenCalledTimes(4); // No cursor loop or guessed tail.
});
it('keeps below-limit missing/extra groups partial and never replaces site totals', async () => {
  for (const count of [0, 9, 30]) {
    const r = setup();
    r.data.pages.data.viewer.accounts[0].rumPageloadEventsAdaptiveGroups[0].count =
      count;
    const day = success(await readRumDay(config, date, r));
    expect(day.pages.quality.warnings).toContain('page_loads_mismatch');
    expect(day.pages.coverage.pageLoadsDelta).toBe(count - 10);
    expect(day.site.pageLoads).toBe(18);
  }
  const r = setup();
  r.data.referrers.data.viewer.accounts[0].rumPageloadEventsAdaptiveGroups = [];
  const day = success(await readRumDay(config, date, r));
  expect(day.referrers.quality.warnings).toEqual(
    expect.arrayContaining(['page_loads_mismatch', 'visits_mismatch']),
  );
});
it('rejects duplicate groups, excessive rows and normalization collisions rather than double-counting', async () => {
  for (const stage of ['site', 'pages', 'referrers']) {
    const r = setup();
    const rows =
      r.data[stage].data.viewer.accounts[0].rumPageloadEventsAdaptiveGroups;
    rows.push(structuredClone(rows[0]));
    unavailable(await readRumDay(config, date, r), 'invalid_response', stage);
  }
  const r = setup();
  unavailable(
    await readRumDay({ ...config, groupLimit: 2 }, date, r),
    'invalid_response',
    'pages',
  );
  const collision = setup();
  collision.data.referrers.data.viewer.accounts[0].rumPageloadEventsAdaptiveGroups[5].dimensions.refererHost =
    'GopherAtlas.com.';
  unavailable(
    await readRumDay(config, date, collision),
    'invalid_response',
    'referrers',
  );
});

it.each([
  'https://example.com/x',
  '//example.com/x',
  '/x?token=private',
  '/x#private',
  '/%2e%2e/x',
  '/x\\y',
  '/%00x',
  '/bad%zz',
  '/%ff',
  '/%2fexample.com',
])('rejects unsafe path %s without copying it into errors', async (path) => {
  const r = setup();
  r.data.pages.data.viewer.accounts[0].rumPageloadEventsAdaptiveGroups[0].dimensions.requestPath =
    path;
  const day = await readRumDay(config, date, r);
  unavailable(day, 'invalid_response');
  expect(JSON.stringify(day)).not.toContain(path);
});
it('does not merge language, case, trailing slash or encoded paths', async () => {
  const r = setup(),
    rows = r.data.pages.data.viewer.accounts[0].rumPageloadEventsAdaptiveGroups;
  const paths = ['/EN/Thing', '/en/thing/', '/notes/%E4%BE%8B/'];
  rows.forEach(
    (row: { dimensions: { requestPath: string } }, i: number) =>
      (row.dimensions.requestPath = paths[i]),
  );
  expect(
    success(await readRumDay(config, date, r)).pages.rows.map(
      (row) => row.path,
    ),
  ).toEqual(paths);
});
it.each([
  'https://example.com/private',
  'a@example.com',
  'example.com:443',
  '127.0.0.1',
  '[::1]',
  'not a host',
  null,
])(
  'rejects full URLs/invalid referer %j instead of storing private fields',
  async (refererHost) => {
    const r = setup();
    r.data.referrers.data.viewer.accounts[0].rumPageloadEventsAdaptiveGroups[0].dimensions.refererHost =
      refererHost;
    unavailable(
      await readRumDay(config, date, r),
      'invalid_response',
      'referrers',
    );
  },
);
it.each([
  { requestHost: 'other.example' },
  { accountId: '' },
  { rumSiteTag: '' },
  { token: 'bad\nheader' },
  { groupLimit: 0 },
  { groupLimit: 1.5 },
])('rejects unsafe/missing configuration before fetch', async (override) => {
  const r = setup();
  unavailable(
    await readRumDay({ ...config, ...override } as RumConfig, date, r),
    'invalid_config',
  );
  expect(r.fetch).not.toHaveBeenCalled();
});
it('refuses browser execution before using credentials or fetch', async () => {
  vi.stubGlobal('window', {});
  const r = setup();
  unavailable(await readRumDay(config, date, r), 'server_only');
  expect(r.fetch).not.toHaveBeenCalled();
});
