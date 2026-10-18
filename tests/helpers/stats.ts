import { readFileSync } from 'node:fs';
import { validateSnapshot } from '../../scripts/snapshot.mjs';
import { createPublication } from '../../apps/web/src/lib/publication/indexes';
import { buildStatsManifest } from '../../scripts/stats-manifest';
import { readRumDay } from '../../apps/web/stats/rum/client';
import {
  manifestPath,
  type StatsManifest,
} from '../../apps/web/stats/manifest';
import type { Database } from '../../apps/web/stats/worker/db';
export const now = Date.parse('2026-10-19T03:00:00Z');
export const at = new Date(now).toISOString();
export function manifest() {
  return buildStatsManifest(
    createPublication(
      validateSnapshot(
        Buffer.from(readFileSync('tests/fixtures/content-snapshot-v2.json')),
      ),
    ),
    'c'.repeat(64),
  );
}
export function assets(m: StatsManifest) {
  return {
    fetch: async (r: Request) =>
      new URL(r.url).pathname === manifestPath
        ? Response.json(m)
        : new URL(r.url).pathname === '/.well-known/gopheratlas-build.json'
          ? Response.json({
              generation: m.generation,
              snapshotSha256: m.snapshotSha256,
            })
          : new Response('static-response', { status: 404 }),
  };
}
export async function rum(day = '2026-10-18', m = manifest()) {
  const f = JSON.parse(readFileSync('tests/fixtures/rum-daily.json', 'utf8'));
  for (const key of ['site', 'pages', 'referrers'])
    for (const row of f[key].data.viewer.accounts[0]
      .rumPageloadEventsAdaptiveGroups)
      row.dimensions.date = day;
  f.pages.data.viewer.accounts[0].rumPageloadEventsAdaptiveGroups[2].dimensions.requestPath =
    m.routes.find(
      (r) =>
        r.path.startsWith('/notes/') &&
        r.path === r.canonicalPath &&
        r.path !== '/notes/',
    )!.path;
  const replies = ['settings', 'site', 'pages', 'referrers'];
  let i = 0;
  const result = await readRumDay(
    {
      accountId: 'a'.repeat(32),
      rumSiteTag: 'b'.repeat(32),
      token: 'synthetic-private-token',
      requestHost: 'gopheratlas.com',
      groupLimit: 20,
    },
    day,
    {
      now: () => Date.parse(`${day}T00:00:00Z`) + 86400000,
      fetch: async () => Response.json(f[replies[i++]]),
    },
  );
  if (!result.ok) throw Error('fixture_invalid');
  return result;
}
export async function migrate(db: Database) {
  const sql = readFileSync(
    'apps/web/stats/migrations/0001_stats.sql',
    'utf8',
  ).replace(/--[^\n]*/g, '');
  await db.batch(
    sql
      .split(';')
      .filter((s) => s.trim())
      .map((s) => db.prepare(s)),
  );
}
