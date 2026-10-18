import { ranges } from '../../src/lib/stats/readership-contract';
import { readRumDay } from '../rum/client';
import { loadManifest, type Assets } from '../manifest';
import { archiveDay, observeContent, recordFailure } from './archive';
import { readership } from './api';
import type { Database } from './db';

export interface StatsEnv {
  ASSETS: Assets;
  STATS_DB?: Database;
  STATS_READ_ENABLED?: string;
  STATS_SYNC_ENABLED?: string;
  RUM_ACCOUNT_ID?: string;
  RUM_SITE_TAG?: string;
  RUM_ANALYTICS_TOKEN?: string;
  RUM_GROUP_LIMIT?: string;
}
const json = (body: unknown, status = 200, extra = {}) =>
  Response.json(body, {
    status,
    headers: {
      'Cache-Control':
        status === 200 ? 'public, max-age=300, s-maxage=900' : 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extra,
    },
  });

export async function fetchStats(
  request: Request,
  env: StatsEnv,
  now = Date.now(),
): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname !== '/api/stats' && !url.pathname.startsWith('/api/stats/'))
    return env.ASSETS.fetch(request);
  if (url.pathname !== '/api/stats') return json({ error: 'not_found' }, 404);
  if (request.method !== 'GET')
    return json({ error: 'method_not_allowed' }, 405, { Allow: 'GET' });
  const range = url.searchParams.get('range') ?? '30d';
  if (
    !ranges.includes(range as (typeof ranges)[number]) ||
    [...url.searchParams.keys()].some((k) => k !== 'range') ||
    url.searchParams.getAll('range').length > 1
  )
    return json({ error: 'invalid_range' }, 400);
  if (env.STATS_READ_ENABLED !== 'true' || !env.STATS_DB)
    return json({ error: 'stats_unavailable' }, 503);
  try {
    return json(
      await readership(
        env.STATS_DB,
        await loadManifest(env.ASSETS),
        range as (typeof ranges)[number],
        now,
      ),
    );
  } catch {
    return json({ error: 'stats_unavailable' }, 503);
  }
}

/** Stable event time, two completed days, serial requests, no backfill endpoint. */
export async function runSchedule(
  env: StatsEnv,
  scheduledTime: number,
  reader = readRumDay,
) {
  if (env.STATS_SYNC_ENABLED !== 'true') return;
  if (!env.STATS_DB) throw Error('stats_sync_unavailable');
  const at = new Date(scheduledTime).toISOString();
  const midnight = Date.parse(`${at.slice(0, 10)}T00:00:00Z`);
  const days = [2, 1].map((offset) =>
    new Date(midnight - offset * 86400000).toISOString().slice(0, 10),
  );
  let manifest;
  try {
    manifest = await loadManifest(env.ASSETS);
  } catch {
    for (const day of days)
      await recordFailure(env.STATS_DB, day, at, 'manifest_unavailable');
    throw Error('stats_sync_unavailable');
  }
  await observeContent(env.STATS_DB, manifest, at);
  let failed = false;
  for (const day of days) {
    const started = Date.now();
    const rum = await reader(
      {
        accountId: env.RUM_ACCOUNT_ID ?? '',
        rumSiteTag: env.RUM_SITE_TAG ?? '',
        token: env.RUM_ANALYTICS_TOKEN ?? '',
        requestHost: 'gopheratlas.com',
        groupLimit: Number(env.RUM_GROUP_LIMIT ?? ''),
      },
      day,
    );
    const states = await archiveDay(
      env.STATS_DB,
      day,
      rum,
      manifest,
      at,
      Date.now() - started,
    );
    if (states.site === 'unavailable') failed = true;
  }
  if (failed) throw Error('stats_sync_unavailable');
}

export default {
  fetch(request: Request, env: StatsEnv) {
    return fetchStats(request, env);
  },
  scheduled(
    controller: { scheduledTime: number },
    env: StatsEnv,
    ctx: { waitUntil(task: Promise<unknown>): void },
  ) {
    ctx.waitUntil(
      runSchedule(env, controller.scheduledTime).catch(() => {
        throw Error('stats_sync_unavailable');
      }),
    );
  },
};
