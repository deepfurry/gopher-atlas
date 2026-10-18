import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { parseConfigFileTextToJson } from 'typescript';
import { shareLinks } from '../apps/web/src/lib/share';
import { fetchStats, runSchedule } from '../apps/web/stats/worker/index';

const config = parseConfigFileTextToJson(
  'wrangler.jsonc',
  readFileSync('apps/web/wrangler.jsonc', 'utf8'),
).config;
it('binds the real statistics database, keeps Static Assets and both switches off without a Cron', async () => {
  expect(config.name).toBe('gopheratlas-web');
  expect(config.main).toBe('stats/worker/index.ts');
  expect(config.assets).toEqual({
    directory: './dist',
    binding: 'ASSETS',
    run_worker_first: ['/api/stats', '/api/stats/*'],
  });
  expect(config.d1_databases).toEqual([
    {
      binding: 'STATS_DB',
      database_name: 'gopheratlas-statistics',
      database_id: '33474c53-2d09-4c1b-9545-2711f5f8bc2a',
      migrations_dir: 'stats/migrations',
    },
  ]);
  expect(config.vars).toEqual({
    STATS_READ_ENABLED: 'false',
    STATS_SYNC_ENABLED: 'false',
  });
  expect(config.triggers.crons).toEqual([]);
  expect(config.account_id).toBeUndefined();
  const env = {
    ...config.vars,
    ASSETS: { fetch: async () => new Response('static') },
  };
  const fail = async () => {
    throw Error('disabled sync must not read upstream');
  };
  await runSchedule(env, Date.now(), fail);
  expect(
    (await fetchStats(new Request('https://gopheratlas.com/api/stats'), env))
      .status,
  ).toBe(503);
  expect(
    await (
      await fetchStats(new Request('https://gopheratlas.com/notes/'), env)
    ).text(),
  ).toBe('static');
});
it.each([
  '/notes/go/a/',
  '/articles/source-review/',
  '/topics/go/',
  '/en/notes/go/a/',
])('shares only the public GopherAtlas page %s with encoded titles', (path) => {
  const title = 'Go & 中文 # "<notes>"';
  const { url, links } = shareLinks(path, title);
  expect(url).toBe(`https://gopheratlas.com${path}`);
  expect(links.map((link) => new URL(link.href).origin)).toEqual([
    'https://twitter.com',
    'https://www.reddit.com',
    'https://bsky.app',
    'https://news.ycombinator.com',
  ]);
  links.forEach((link, i) => {
    const query = new URL(link.href).searchParams;
    if (i === 2) expect(query.get('text')).toBe(`${title}\n${url}`);
    else {
      expect(query.get(i === 3 ? 'u' : 'url')).toBe(url);
      expect(query.get(i === 0 ? 'text' : i === 3 ? 't' : 'title')).toBe(title);
    }
  });
});
it.each([
  'https://external.example/a/',
  '//external.example/a/',
  '/articles/a/?token=x',
  '/articles/a/#secret',
])('rejects non-public sharing input %s', (path) => {
  expect(() => shareLinks(path, 'Title')).toThrow('invalid_share_path');
});
it('ships real PNG sizes and a three-size ICO derived from the unchanged SVG', () => {
  const png = (path: string, width: number, height: number) => {
    const bytes = readFileSync(`apps/web/public/${path}`);
    expect(bytes.subarray(1, 4).toString()).toBe('PNG');
    expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([
      width,
      height,
    ]);
  };
  png('favicon-32.png', 32, 32);
  png('apple-touch-icon.png', 180, 180);
  png('images/og-default.png', 1200, 630);
  const ico = readFileSync('apps/web/public/favicon.ico');
  expect([
    ico.readUInt16LE(0),
    ico.readUInt16LE(2),
    ico.readUInt16LE(4),
  ]).toEqual([0, 1, 3]);
  [16, 32, 48].forEach((size, i) => {
    const p = 6 + i * 16,
      offset = ico.readUInt32LE(p + 12);
    expect([ico[p], ico[p + 1]]).toEqual([size, size]);
    expect(ico.subarray(offset + 1, offset + 4).toString()).toBe('PNG');
  });
});
it('provides a current RFC 9116 contact and a concise navigation-only llms file', () => {
  const security = readFileSync(
    'apps/web/public/.well-known/security.txt',
    'utf8',
  );
  expect(security).toContain('Contact: mailto:faolanthewooolf@gmail.com');
  expect(security).toContain(
    'Canonical: https://gopheratlas.com/.well-known/security.txt',
  );
  const expiry = Date.parse(security.match(/^Expires: (.+)$/m)![1]);
  expect(expiry).toBeGreaterThan(Date.now());
  expect(expiry - Date.now()).toBeLessThan(366 * 86400000);
  expect(security).not.toMatch(/Policy:|Acknowledgments:|bounty/i);
  const llms = readFileSync('apps/web/public/llms.txt', 'utf8');
  expect(llms.length).toBeLessThan(3000);
  expect(llms).not.toMatch(/llms-full|ranking|SEO/i);
});
