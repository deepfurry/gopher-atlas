import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { validateSnapshot, sha256 } from './snapshot.mjs';
import {
  createPublication,
  seo,
} from '../apps/web/src/lib/publication/indexes.ts';
import {
  publicPages,
  redirects,
} from '../apps/web/src/lib/publication/routes.ts';
import {
  chromePaths,
  words,
  localized,
  localeOf,
} from '../apps/web/src/lib/i18n.ts';

// Deliberately fixture-only: this gate never loads .env, contacts R2 or starts CMS.
const input = readFileSync('tests/fixtures/content-snapshot-v1.json');
const snapshot = validateSnapshot(input),
  p = createPublication(snapshot);
const out = 'apps/web/dist';
const read = (path) => readFileSync(`${out}/${path}`, 'utf8');
const pageDocument = (path) =>
  new JSDOM(read(path === '/' ? 'index.html' : `${path.slice(1)}index.html`))
    .window.document;
const pages = publicPages(p);
const allPaths = [
  '/',
  '/about/',
  '/contribute/',
  '/search/',
  '/notes/',
  '/tags/',
  '/authors/',
  ...chromePaths.map((path) => `/en${path}`),
  ...pages.map((page) => page.path),
];
const canonicalPaths = [...allPaths];
const aliases = [
  ...pages.map((page) => page.path),
  '/authors/',
  '/tags/',
].filter((path) => !chromePaths.includes(path));
allPaths.push(...aliases.map((path) => '/en' + path));
for (const path of allPaths) {
  const doc = pageDocument(path);
  assert.equal(
    doc.querySelector('link[rel=canonical]')?.getAttribute('href'),
    `https://gopheratlas.com${canonicalPaths.includes(path) ? path : path.slice(3)}`,
  );
  assert.equal(doc.querySelectorAll('h1').length, 1, `One H1: ${path}`);
  assert(doc.querySelector('a.skip-link[href="#main"]'));
  assert(!doc.querySelector('script[src*="api-client"], iframe, astro-island'));
  assert.equal(
    doc.querySelector('[data-language-link]')?.getAttribute('href'),
    localized(path, localeOf(path) === 'zh' ? 'en' : 'zh'),
  );
  assert(!doc.querySelector('footer').textContent.includes('CC-BY-NC'));
  assert(doc.querySelector('footer').textContent.includes('DeepFurry'));
  assert(!doc.querySelector('footer a[href*="github.com"]'));
  for (const link of doc.querySelectorAll('a[href^="/"]')) {
    const target = link.getAttribute('href').split(/[?#]/)[0];
    assert(
      allPaths.includes(target) || target === '/rss.xml',
      `Broken generated link in ${path}: ${target}`,
    );
  }
}
for (const path of ['/notes/', '/en/notes/']) {
  const doc = pageDocument(path);
  for (const group of p.groups) {
    const heading = doc.querySelector(
      `.note-group h2 a[href="${localized(`/notes/${group.slug}/`, localeOf(path))}"]`,
    );
    assert.equal(heading?.textContent, group.name, `Note group label: ${path}`);
    assert(heading.closest('article').textContent.includes(group.description));
  }
}
for (const item of snapshot.content) {
  const doc = pageDocument(item.canonicalPath),
    metadata = seo(item);
  assert.equal(doc.documentElement.lang, item.language);
  assert.equal(doc.querySelector('h1').textContent.trim(), item.title);
  assert.equal(doc.title, `${metadata.title} · GopherAtlas`);
  assert.equal(
    doc.querySelector('meta[name=description]')?.content,
    metadata.description,
  );
  assert.equal(
    doc.querySelector('meta[property="og:url"]')?.content,
    `https://gopheratlas.com${item.canonicalPath}`,
  );
  assert.equal(
    doc.querySelector('meta[property="og:title"]')?.content,
    metadata.title,
  );
  assert.equal(
    !!doc.querySelector('main[data-pagefind-body]'),
    item.type !== 'post',
  );
  assert(doc.querySelector('.content-detail .markdown')?.textContent.trim());
  if (item.type !== 'topic')
    assert(
      doc
        .querySelector('.publication-meta [rel=author]')
        ?.textContent.includes(p.authorById.get(item.authorId).displayName),
    );
  for (const image of doc.querySelectorAll('.markdown img, .cover-image'))
    assert.equal(new URL(image.src).origin, 'https://assets.gopheratlas.com');
  if (item.coverAssetId !== null) {
    const cover = p.assetById.get(item.coverAssetId);
    assert.equal(
      doc.querySelector('.cover-image')?.getAttribute('src'),
      cover.url,
    );
    assert.equal(
      doc.querySelector('meta[property="og:image"]')?.content,
      cover.url,
    );
  }
  if (item.type === 'note')
    assert(doc.querySelector('.note-navigation a[href="/notes/"]'));
  if (item.type === 'curated_article') {
    assert(
      doc.querySelector(`.source-meta a[href="${item.payload.sourceUrl}"]`),
    );
    for (const value of [
      item.payload.sourceAuthor,
      item.payload.sourceName,
      words.zh[item.payload.difficulty],
      item.payload.rating,
    ].filter(Boolean))
      assert(doc.querySelector('.source-meta').textContent.includes(value));
  }
  if (item.type === 'topic')
    assert.deepEqual(
      [...doc.querySelectorAll('.topic-entries .article-card h2 a')].map((a) =>
        a.getAttribute('href'),
      ),
      p.topicTargets
        .get(item.id)
        .map((entry) => entry.content.payload.sourceUrl),
    );
}
assert.deepEqual(
  [...pageDocument('/notes/go/').querySelectorAll('.content-list h2 a')].map(
    (a) => a.textContent,
  ),
  p.notesByGroup.get('go').content.map((c) => c.title),
);
assert(read('posts/fixture-post/index.html').includes('astro-code'));
assert(read('posts/fixture-post/index.html').includes('<table>'));
assert(!pageDocument('/posts/').querySelector('main[data-pagefind-body]'));
const redirectFile = read('_redirects');
assert.equal(redirectFile, redirects(snapshot));
const sitemap = new JSDOM(read('sitemap-0.xml'), { contentType: 'text/xml' })
  .window.document;
assert(!sitemap.querySelector('parsererror'));
const locations = [...sitemap.querySelectorAll('url > loc')].map(
  (n) => n.textContent,
);
for (const path of canonicalPaths)
  assert(
    locations.includes(`https://gopheratlas.com${path}`),
    `Missing sitemap URL: ${path}`,
  );
for (const path of aliases) {
  assert(
    !locations.includes(`https://gopheratlas.com/en${path}`),
    `Duplicate alias in sitemap: ${path}`,
  );
  const base = pageDocument(path),
    alias = pageDocument('/en' + path);
  assert.equal(alias.documentElement.dataset.locale, 'en');
  assert(
    !alias.querySelector('main[data-pagefind-body]'),
    `Alias duplicated in Pagefind: ${path}`,
  );
  if (path !== '/authors/' && path !== '/tags/')
    assert.equal(
      alias.querySelector('h1').textContent.trim(),
      base.querySelector('h1').textContent.trim(),
    );
  const body = base.querySelector('.reading-body > .markdown');
  if (body)
    assert.equal(
      alias.querySelector('.reading-body > .markdown').innerHTML,
      body.innerHTML,
      `Alias changed authored Markdown: ${path}`,
    );
}
for (const route of snapshot.routes.filter(
  (route) => route.kind === 'redirect',
)) {
  assert(!locations.includes(`https://gopheratlas.com${route.path}`));
  assert(!existsSync(resolve(out, '.' + route.path, 'index.html')));
}
assert(!locations.some((url) => /404|well-known|pagefind/.test(url)));
const rss = new JSDOM(read('rss.xml'), { contentType: 'text/xml' }).window
  .document;
assert(!rss.querySelector('parsererror'));
assert.deepEqual(
  [...rss.querySelectorAll('item > link')].map((n) => n.textContent),
  p.feed.map((item) => `https://gopheratlas.com${item.canonicalPath}`),
);
assert.deepEqual(
  [...rss.querySelectorAll('item > title')].map((n) => n.textContent),
  p.feed.map((item) => item.title),
);
const marker = JSON.parse(read('.well-known/gopheratlas-build.json'));
assert.deepEqual(
  Object.keys(marker).sort(),
  [
    'schemaVersion',
    'generation',
    'snapshotSha256',
    'builtAt',
    'commitSha',
    'buildId',
  ].sort(),
);
assert.equal(marker.generation, snapshot.generation);
assert.equal(marker.snapshotSha256, sha256(input));
assert.equal(marker.schemaVersion, 1);
assert(Number.isFinite(Date.parse(marker.builtAt)));
assert.match(marker.commitSha, /^[a-f0-9]{40,64}$/);
assert(existsSync(`${out}/pagefind/pagefind.js`));
const index = JSON.parse(read('pagefind/pagefind-entry.json'));
assert.equal(
  index.languages.zh.page_count,
  snapshot.content.filter((item) => item.type !== 'post').length + 4,
);
assert(
  read('robots.txt').includes(
    'Sitemap: https://gopheratlas.com/sitemap-index.xml',
  ),
);
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? walk(`${dir}/${entry.name}`)
      : [`${dir}/${entry.name}`],
  );
for (const path of walk(out)) {
  assert(!path.split('/').at(-1).startsWith('.env'));
  const bytes = readFileSync(path);
  for (const marker of [
    'PRIVATE_DRAFT_ONLY',
    'PRIVATE_REVIEW_ONLY',
    'PRIVATE_CMS_ORIGIN',
    'CONTENT_R2_SECRET_ACCESS_KEY',
    'GITHUB_OAUTH_CLIENT_SECRET',
    'CLOUDFLARE_DEPLOY_HOOK_URL',
    '"githubUserId"',
    '"pendingReviewRevisionId"',
  ])
    assert(
      !bytes.includes(Buffer.from(marker)),
      'Private data in Public output',
    );
}
console.log(
  `Public fixture artifacts passed: ${snapshot.content.length} details, ${canonicalPaths.length} canonical pages + ${aliases.length} chrome aliases, redirects/RSS/sitemap/Pagefind/marker and privacy.`,
);
