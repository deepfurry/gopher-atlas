import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'node:net';
import { afterAll, beforeAll, expect, it, vi, describe } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import { parseConfigFileTextToJson } from 'typescript';
import type { Database } from '../apps/web/stats/worker/db';
import { archiveDay, observeContent } from '../apps/web/stats/worker/archive';
import { validateManifest } from '../apps/web/stats/manifest';
import { validateReadership } from '../apps/web/src/lib/stats/readership';
import { rum } from './helpers/stats';

// Run once after the explicit synthetic Snapshot build. Normal unit tests do not
// implicitly build, run a server or use whatever production dist happens to exist.
describe.skipIf(process.env.STATS_LOCAL_INTEGRATION !== '1')(
  'real Wrangler Static Assets + local D1',
  () => {
    let child: ChildProcess,
      origin: string,
      logs = '';
    const folder = resolve('.cache/stats-c1/integration'),
      configPath = resolve(folder, 'wrangler.json'),
      persistTo = resolve(folder, 'state');
    const cli = resolve('node_modules/wrangler/bin/wrangler.js');
    const env: NodeJS.ProcessEnv = {};
    for (const key of [
      'PATH',
      'Path',
      'SystemRoot',
      'SYSTEMROOT',
      'WINDIR',
      'TEMP',
      'TMP',
      'HOME',
      'USERPROFILE',
      'LOCALAPPDATA',
      'APPDATA',
    ])
      if (process.env[key]) env[key] = process.env[key];
    Object.assign(env, {
      CI: 'true',
      WRANGLER_SEND_METRICS: 'false',
      CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false',
    });
    beforeAll(async () => {
      vi.stubEnv('WRANGLER_SEND_METRICS', 'false');
      vi.stubEnv('CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV', 'false');
      const manifest = validateManifest(
        JSON.parse(
          readFileSync(
            'apps/web/dist/.well-known/gopheratlas-stats.json',
            'utf8',
          ),
        ),
      );
      const expected = JSON.parse(
        readFileSync('tests/fixtures/content-snapshot-v2.json', 'utf8'),
      );
      if (
        manifest.generation !== expected.generation ||
        manifest.counts.tags !== expected.tags.length
      )
        throw Error('synthetic_build_required');
      mkdirSync(folder, { recursive: true });
      // Reuse the exact local config's route/binding policy, only resolve file paths.
      const base = parseConfigFileTextToJson(
        'wrangler.local.jsonc',
        readFileSync('apps/web/stats/wrangler.local.jsonc', 'utf8'),
      ).config;
      base.main = resolve('apps/web/stats/worker/index.ts');
      base.assets.directory = resolve('apps/web/dist');
      base.d1_databases[0].migrations_dir = resolve(
        'apps/web/stats/migrations',
      );
      writeFileSync(configPath, JSON.stringify(base));
      writeFileSync(resolve(folder, '.dev.vars'), '');
      const args = [
        'd1',
        'migrations',
        'apply',
        'STATS_DB',
        '--local',
        '--config',
        configPath,
        '--persist-to',
        persistTo,
      ];
      // Wrangler's migration ledger makes the second invocation a no-op.
      execFileSync(process.execPath, [cli, ...args], { env, stdio: 'pipe' });
      execFileSync(process.execPath, [cli, ...args], { env, stdio: 'pipe' });
      const proxy = await getPlatformProxy<{ STATS_DB: Database }>({
        configPath,
        persist: { path: resolve(persistTo, 'v3') },
        remoteBindings: false,
      });
      try {
        const db = proxy.env.STATS_DB;
        for (const table of [
          'daily_site_traffic',
          'daily_page_traffic',
          'daily_referrers',
          'daily_dimensions',
          'daily_content_counts',
          'sync_runs',
        ])
          await db.prepare(`DELETE FROM ${table}`).run();
        const at = new Date().toISOString(),
          today = Date.parse(`${at.slice(0, 10)}T00:00:00Z`);
        for (const offset of [3, 2, 1]) {
          const day = new Date(today - offset * 86400000)
            .toISOString()
            .slice(0, 10);
          await archiveDay(db, day, await rum(day, manifest), manifest, at);
        }
        await observeContent(db, manifest, at);
      } finally {
        await proxy.dispose();
      }
      const port = await new Promise<number>((resolvePort) => {
        const server = createServer();
        server.listen(0, '127.0.0.1', () => {
          const p = (server.address() as { port: number }).port;
          server.close(() => resolvePort(p));
        });
      });
      origin = `http://127.0.0.1:${port}`;
      writeFileSync(
        resolve(folder, 'preview.json'),
        JSON.stringify({ configPath, persistTo, port }),
      );
      child = spawn(
        process.execPath,
        [
          cli,
          'dev',
          '--local',
          '--config',
          configPath,
          '--persist-to',
          persistTo,
          '--port',
          String(port),
          '--ip',
          '127.0.0.1',
        ],
        { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
      );
      child.stdout!.on('data', (b) => {
        logs += String(b);
      });
      child.stderr!.on('data', (b) => {
        logs += String(b);
      });
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) {
        try {
          if ((await fetch(`${origin}/api/stats`)).status === 200) return;
        } catch {
          /* bounded loopback readiness */
        }
        if (child.exitCode !== null) throw Error(`local_worker_exit: ${logs}`);
        await new Promise((r) => setTimeout(r, 200));
      }
      throw Error(`local_worker_timeout: ${logs}`);
    }, 60000);
    afterAll(async () => {
      if (child?.pid && child.exitCode === null) {
        if (process.platform === 'win32')
          execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
            stdio: 'ignore',
            windowsHide: true,
          });
        else child.kill('SIGTERM');
      }
      vi.unstubAllEnvs();
    });
    it('serves real D1 API data without touching GraphQL, rejects write/unknown routes and preserves cache headers', async () => {
      const response = await fetch(`${origin}/api/stats?range=7d`),
        body = await response.json();
      expect(response.status).toBe(200);
      validateReadership(body, '7d');
      expect(body.totals).toEqual({ pageLoads: 54, visits: 21 });
      expect(body.coverage.site.days).toBe(3);
      expect(body.popularPages.length).toBeGreaterThan(0);
      expect(response.headers.get('cache-control')).toContain('s-maxage=900');
      expect(
        (await fetch(`${origin}/api/stats`, { method: 'POST' })).status,
      ).toBe(405);
      expect(
        (await fetch(`${origin}/api/stats/sync`, { method: 'POST' })).status,
      ).toBe(404);
      expect((await fetch(`${origin}/api/stats?range=all`)).status).toBe(400);
      expect(JSON.stringify(body)).not.toMatch(
        /synthetic-private-token|unknown\.example|accountId|rumSiteTag|sync_runs/,
      );
    });
    it('keeps home, bilingual statistics, feed, sitemap, search assets, marker, 404 and permanent redirects static', async () => {
      for (const path of [
        '/',
        '/stats/',
        '/en/stats/',
        '/rss.xml',
        '/sitemap-index.xml',
        '/pagefind/pagefind.js',
        '/.well-known/gopheratlas-build.json',
      ]) {
        const response = await fetch(`${origin}${path}`);
        expect(response.status, path).toBe(200);
        expect(response.headers.get('cache-control'), path).not.toContain(
          's-maxage=900',
        );
      }
      const missing = await fetch(`${origin}/nonexistent-offline-test/`);
      expect(missing.status).toBe(404);
      expect(await missing.text()).not.toContain('stats_unavailable');
      const line = readFileSync('apps/web/dist/_redirects', 'utf8')
        .trim()
        .split('\n')[0]
        .trim()
        .split(/\s+/);
      const redirected = await fetch(`${origin}${line[0]}`, {
        redirect: 'manual',
      });
      expect(redirected.status).toBe(301);
      expect(
        new URL(redirected.headers.get('location')!, origin).pathname,
      ).toBe(line[1]);
    });
  },
);
