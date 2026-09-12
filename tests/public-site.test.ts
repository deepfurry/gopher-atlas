import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';
import { validateSnapshot } from '../scripts/snapshot.mjs';
import {
  createPublication,
  dateLabel,
  seo,
} from '../apps/web/src/lib/publication/indexes';
import {
  collectionPages,
  publicPages,
  redirects,
  staticRedirectLimit,
} from '../apps/web/src/lib/publication/routes';
import { renderMarkdown } from '../apps/web/src/lib/publication/markdown';
import type { Content, Snapshot } from '../apps/web/src/lib/publication/types';

const fixture = (): Snapshot =>
  validateSnapshot(readFileSync('tests/fixtures/content-snapshot-v1.json'));
it('fails the actual Web build without explicit input, even when generated files already exist', () => {
  const env = { ...process.env };
  for (const key of Object.keys(env))
    if (key.startsWith('CONTENT_')) delete env[key];
  const result = spawnSync(process.execPath, ['../../scripts/build-web.mjs'], {
    cwd: 'apps/web',
    env,
    encoding: 'utf8',
    timeout: 10000,
  });
  expect(result.error).toBeUndefined();
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('content_input_not_configured');
  expect(result.stdout).not.toContain('Generating static routes');
});
it('indexes all public relations and uses deterministic featured/recent and note/topic order', () => {
  const snapshot = fixture(),
    p = createPublication(snapshot);
  expect(p.contentByType.get('post')?.map((c) => c.id)).toEqual([1, 6]);
  expect(p.notesByGroup.get('go')?.content.map((c) => c.id)).toEqual([5, 2]);
  expect(p.topicTargets.get(4)?.map((t) => [t.position, t.content.id])).toEqual(
    [[1, 3]],
  );
  expect(p.contentByTag.get(2)?.map((c) => c.id)).toEqual([1, 6]);
  expect(p.contentByAuthor.get(2)?.map((c) => c.id)).toEqual([6, 5, 2]);
  expect(p.feed.map((c) => c.id)).toEqual([5, 3, 2]);
  const shuffled = structuredClone(snapshot);
  for (const key of ['content', 'authors', 'assets', 'tags', 'routes'] as const)
    shuffled[key].reverse();
  shuffled.content.find((c) => c.type === 'topic')!.topicEntries.reverse();
  const other = createPublication(shuffled);
  const identities = (publication: ReturnType<typeof createPublication>) =>
    publicPages(publication).map((page) => [
      page.path,
      page.kind === 'detail' ? page.content.id : page.content.map((c) => c.id),
    ]);
  expect(identities(other)).toEqual(identities(p));
  expect(other.topicTargets.get(4)).toEqual(p.topicTargets.get(4));
  expect(redirects(shuffled)).toBe(redirects(snapshot));
});
it('builds exact canonical paths, derived directories and bounded static pages', () => {
  const s = fixture(),
    p = createPublication(s),
    pages = publicPages(p);
  expect(
    pages
      .filter((page) => page.kind === 'detail')
      .map((page) => page.path)
      .sort(),
  ).toEqual(s.content.map((c) => c.canonicalPath).sort());
  for (const path of [
    '/posts/',
    '/articles/',
    '/topics/',
    '/notes/go/',
    '/tags/concurrency/',
    '/authors/fixture-author/',
  ])
    expect(pages.some((page) => page.path === path)).toBe(true);
  const rows = Array.from({ length: 49 }, (_, id) => ({
    ...s.content[0],
    id: id + 1,
  })) as Content[];
  const paged = collectionPages('/posts/', 'Posts', '', rows);
  expect(paged.map((page) => [page.path, page.content.length])).toEqual([
    ['/posts/', 24],
    ['/posts/page/2/', 24],
    ['/posts/page/3/', 1],
  ]);
  expect(paged[1].previous).toBe('/posts/');
  expect(paged[1].next).toBe('/posts/page/3/');
  expect(collectionPages('/posts/', 'Posts', '', []).length).toBe(1);
});
it('fails closed on broken references, duplicate slugs, routes and conflicting note group labels', () => {
  const mutations: ((s: Snapshot) => void)[] = [
    (s) => {
      s.content[0].authorId = 999;
    },
    (s) => {
      s.content[0].coverAssetId = 999;
    },
    (s) => {
      s.content[0].tagIds = [999];
    },
    (s) => {
      s.content[3].topicEntries[0].targetContentId = 999;
    },
    (s) => {
      s.content[3].topicEntries[0].targetContentId = 4;
    },
    (s) => {
      s.content[3].topicEntries.push({ ...s.content[3].topicEntries[0] });
    },
    (s) => {
      s.authors[1].slug = s.authors[0].slug;
    },
    (s) => {
      s.tags[1].slug = s.tags[0].slug;
    },
    (s) => {
      s.routes.pop();
      s.routes[0].contentId = 999;
    },
    (s) => {
      s.routes = s.routes.filter((r) => r.contentId !== 1);
    },
    (s) => {
      s.content[4] = {
        ...s.content[4],
        type: 'note',
        payload: {
          group: 'Conflicting name',
          groupSlug: 'go',
          groupDescription: '',
          groupOrder: 0,
          order: 0,
        },
      };
    },
  ];
  for (const mutate of mutations) {
    const s = fixture();
    mutate(s);
    expect(() => createPublication(s)).toThrow();
  }
});
it('reserves every English chrome route against historical redirects', () => {
  const s = fixture();
  s.routes.push({ path: '/en/articles/', kind: 'redirect', contentId: 1 });
  expect(() => publicPages(createPublication(s))).toThrow(
    'public_page_conflict',
  );
});
it('writes direct permanent redirects, rejects conflicting/missing/chained/self targets and platform overflow', () => {
  const s = fixture();
  expect(redirects(s)).toBe(
    '/posts/old-fixture/ /posts/fixture-post/ 301\n/posts/previous-fixture/ /posts/fixture-post/ 301\n',
  );
  const mutations: ((s: Snapshot) => void)[] = [
    (s) => {
      s.routes.push({ ...s.routes[0], kind: 'redirect' });
    },
    (s) => {
      s.routes[s.routes.length - 1].contentId = 999;
    },
    (s) => {
      s.content[0].canonicalPath = '/posts/old-fixture/';
    },
    (s) => {
      s.routes[0].kind = 'redirect';
    },
    (s) => {
      s.routes[s.routes.length - 1].path = '/posts/fixture-post/';
    },
    (s) => {
      s.routes[s.routes.length - 1].path = '/bad\n/';
    },
  ];
  for (const mutate of mutations) {
    const bad = fixture();
    mutate(bad);
    expect(() => redirects(bad)).toThrow();
  }
  s.routes = s.routes.filter((r) => r.kind === 'canonical');
  s.routes.push(
    ...Array.from({ length: staticRedirectLimit }, (_, i) => ({
      path: `/posts/history-${i}/`,
      kind: 'redirect' as const,
      contentId: 1,
    })),
  );
  expect(redirects(s).trim().split('\n')).toHaveLength(2000);
  s.routes.push({ path: '/posts/overflow/', kind: 'redirect', contentId: 1 });
  expect(() => redirects(s)).toThrow('public_redirect_limit');
  s.routes = fixture().routes;
  s.routes.at(-1)!.path = '/' + 'a'.repeat(999) + '/';
  expect(() => redirects(s)).toThrow('public_redirect_line_limit');
});
it('rejects collisions between canonical and derived/static page paths', () => {
  const s = fixture();
  s.content[0].canonicalPath = '/tags/go/';
  s.routes[0].path = '/tags/go/';
  expect(() => publicPages(createPublication(s))).toThrow(
    'public_page_conflict',
  );
});
it('uses SEO overrides/fallback and UTC dates without private metadata', () => {
  const s = fixture();
  expect(seo(s.content[0])).toEqual({
    title: s.content[0].title,
    description: s.content[0].summary,
  });
  expect(seo(s.content[2])).toEqual({
    title: s.content[2].seoTitle,
    description: s.content[2].seoDescription,
  });
  expect(dateLabel(1789084800000)).toBe('2026-09-11');
  expect(() => dateLabel(Number.MAX_SAFE_INTEGER)).toThrow(
    'public_date_invalid',
  );
});
it('renders shared GFM and Shiki without fetching images or accepting executable Markdown', async () => {
  const html = (await renderMarkdown(fixture().content[0].bodyMarkdown)).code;
  expect(html).toContain('<table>');
  expect(html).toContain('astro-code');
  expect(html).toContain('type="checkbox"');
  expect(html).not.toContain('<h1');
  const image = (
    await renderMarkdown(
      '![含义明确的图](https://assets.gopheratlas.com/example.png)',
    )
  ).code;
  expect(image).toContain('src="https://assets.gopheratlas.com/example.png"');
  expect(image).toContain('alt="含义明确的图"');
  expect(image).not.toContain('__ASTRO_IMAGE_');
  for (const body of [
    '# H1',
    '<img src=x onerror=alert(1)>',
    '---\nx: y\n---\nbody',
    '[bad](javascript:alert)',
    '![external](https://example.com/a.png)',
    '![](https://assets.gopheratlas.com/a.png)',
  ])
    await expect(renderMarkdown(body)).rejects.toThrow(
      'public_markdown_invalid',
    );
});
