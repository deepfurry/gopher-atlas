import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import {
  hasEnglish,
  isEditorial,
  editorialView,
} from '../apps/web/src/lib/publication/editorial.ts';
import { taxonomyText } from '../apps/web/src/lib/publication/taxonomy.ts';
import { copyrightYears } from '../apps/web/src/lib/copyright.ts';
import { shareLinks } from '../apps/web/src/lib/share.ts';
import { buildStatsManifest } from './stats-manifest.ts';
import { validateSnapshot, sha256 } from './snapshot.mjs';
import {
  createPublication,
  seo,
} from '../apps/web/src/lib/publication/indexes.ts';
import {
  publicPages,
  redirects,
  collectionText,
} from '../apps/web/src/lib/publication/routes.ts';
import {
  chromePaths,
  words,
  localized,
  localeOf,
} from '../apps/web/src/lib/i18n.ts';

// Deliberately fixture-only: this gate never loads .env, contacts R2 or starts CMS.
const version = process.argv[2] ?? '1';
assert(['1', '2', '3'].includes(version), 'Expected fixture version 1, 2 or 3');
const input = readFileSync(`tests/fixtures/content-snapshot-v${version}.json`);
const snapshot = validateSnapshot(input),
  p = createPublication(snapshot);
const out = 'apps/web/dist';
const read = (path) => readFileSync(`${out}/${path}`, 'utf8');
assert.deepEqual(
  JSON.parse(read('.well-known/gopheratlas-stats.json')),
  buildStatsManifest(p, sha256(input)),
);
const pageDocument = (path) =>
  new JSDOM(read(path === '/' ? 'index.html' : `${path.slice(1)}index.html`))
    .window.document;
for (const file of [
  'favicon.svg',
  'favicon-32.png',
  'favicon.ico',
  'apple-touch-icon.png',
  'images/og-default.png',
  '.well-known/security.txt',
  'llms.txt',
])
  assert.deepEqual(
    readFileSync(`${out}/${file}`),
    readFileSync(`apps/web/public/${file}`),
  );
for (const match of read('llms.txt').matchAll(/\]\((https:\/\/[^)]+)\)/g)) {
  const url = new URL(match[1]);
  assert.equal(url.origin, 'https://gopheratlas.com');
  assert(
    existsSync(
      `${out}${url.pathname}${url.pathname.endsWith('/') ? 'index.html' : ''}`,
    ),
    `llms.txt public target exists: ${url.pathname}`,
  );
}
const pages = publicPages(p);
const allPaths = [
  '/',
  '/about/',
  '/contribute/',
  '/legal/',
  '/stats/',
  '/search/',
  '/notes/',
  '/tags/',
  '/authors/',
  ...chromePaths.map((path) => `/en${path}`),
  ...pages.map((page) => page.path),
];
const canonicalPaths = [
  ...allPaths,
  ...snapshot.content
    .filter(hasEnglish)
    .map((item) => `/en${item.canonicalPath}`),
];
const aliases = [
  ...pages.map((page) => page.path),
  '/authors/',
  '/tags/',
].filter((path) => !chromePaths.includes(path));
allPaths.push(...aliases.map((path) => '/en' + path));
for (const path of allPaths) {
  const doc = pageDocument(path);
  assert(
    doc.querySelector(
      'link[rel=icon][href="/favicon.svg"][type="image/svg+xml"]',
    ),
  );
  assert(
    doc.querySelector('link[rel=icon][href="/favicon-32.png"][sizes="32x32"]'),
  );
  assert(doc.querySelector('link[rel=icon][href="/favicon.ico"]'));
  assert(
    doc.querySelector(
      'link[rel=apple-touch-icon][href="/apple-touch-icon.png"]',
    ),
  );
  const item = snapshot.content.find((item) =>
    [item.canonicalPath, `/en${item.canonicalPath}`].includes(path),
  );
  const cover = item?.coverAssetId
    ? p.assetById.get(item.coverAssetId)
    : undefined;
  const image = cover?.url ?? 'https://gopheratlas.com/images/og-default.png';
  assert.equal(doc.querySelector('meta[property="og:image"]')?.content, image);
  assert.equal(
    doc.querySelector('meta[property="og:image:width"]')?.content,
    String(cover?.width ?? 1200),
  );
  assert.equal(
    doc.querySelector('meta[property="og:image:height"]')?.content,
    String(cover?.height ?? 630),
  );
  assert.equal(
    doc.querySelector('meta[property="og:image:type"]')?.content,
    cover?.mimeType ?? 'image/png',
  );
  assert(doc.querySelector('meta[property="og:image:alt"]')?.content.trim());
  assert.equal(
    doc.querySelector('meta[property="og:locale"]')?.content,
    localeOf(path) === 'zh' ? 'zh_CN' : 'en_US',
  );
  assert.equal(
    doc.querySelector('meta[name="twitter:card"]')?.content,
    'summary_large_image',
  );
  assert.equal(doc.querySelector('meta[name="twitter:image"]')?.content, image);
  assert.equal(
    doc.querySelector('meta[name="twitter:title"]')?.content,
    doc.querySelector('meta[property="og:title"]')?.content,
  );
  assert.equal(
    doc.querySelector('meta[name="twitter:description"]')?.content,
    doc.querySelector('meta[name="description"]')?.content,
  );
  assert.equal(
    doc.querySelector('link[rel=canonical]')?.getAttribute('href'),
    `https://gopheratlas.com${canonicalPaths.includes(path) ? path : path.slice(3)}`,
  );
  assert.equal(doc.querySelectorAll('h1').length, 1, `One H1: ${path}`);
  assert(doc.querySelector('a.skip-link[href="#main"]'));
  const dock = doc.querySelector('[data-scroll-dock]');
  assert(dock?.hasAttribute('hidden') && dock.hasAttribute('inert'));
  assert.equal(dock.getAttribute('aria-label'), words[localeOf(path)].scrollUp);
  assert(dock.querySelector('svg[aria-hidden="true"] [data-scroll-progress]'));
  assert(!doc.querySelector('[data-back-top]'));
  assert(!doc.querySelector('script[src*="api-client"], iframe, astro-island'));
  assert.equal(
    doc.querySelector('[data-language-link]')?.getAttribute('href'),
    item && isEditorial(item) && path.startsWith('/en/') && !hasEnglish(item)
      ? undefined
      : localized(path, localeOf(path) === 'zh' ? 'en' : 'zh'),
  );
  assert(!doc.querySelector('footer').textContent.includes('CC-BY-NC'));
  assert.equal(
    doc.querySelector('footer p').textContent.trim(),
    `© ${copyrightYears(new Date().getFullYear())} DeepFurry & LibreCosta`,
  );
  assert(
    doc.querySelector(
      'footer a[href="https://github.com/deepfurry/gopher-atlas"]',
    ),
  );
  const legalLinks = doc.querySelectorAll(
    `footer a[href="${localized('/legal/', localeOf(path))}"]`,
  );
  assert.equal(legalLinks.length, 1, `One localized Legal entry: ${path}`);
  assert.equal(legalLinks[0].textContent, words[localeOf(path)].legal);
  const statsLinks = doc.querySelectorAll(
    `footer a[href="${localized('/stats/', localeOf(path))}"]`,
  );
  assert.equal(statsLinks.length, 1, `One localized Statistics entry: ${path}`);
  assert.equal(statsLinks[0].textContent, words[localeOf(path)].stats);
  assert(
    !doc.querySelector(
      '#primary-navigation a[href$="/stats/"]:not([data-language-link])',
    ),
  );
  for (const link of doc.querySelectorAll('a[href^="/"]')) {
    const target = link.getAttribute('href').split(/[?#]/)[0];
    assert(
      allPaths.includes(target) || target === '/rss.xml',
      `Broken generated link in ${path}: ${target}`,
    );
  }
}
for (const path of ['/stats/', '/en/stats/']) {
  const doc = pageDocument(path),
    locale = localeOf(path);
  assert.equal(doc.title, `${words[locale].statsTitle} · GopherAtlas`);
  assert.equal(doc.querySelector('h1').textContent, words[locale].statsTitle);
  assert.equal(
    doc.querySelector('meta[name=description]').content,
    words[locale].statsIntro,
  );
  assert.equal(doc.documentElement.lang, locale === 'zh' ? 'zh-CN' : 'en');
  for (const [language, target] of [
    ['zh-CN', '/stats/'],
    ['en', '/en/stats/'],
    ['x-default', '/stats/'],
  ])
    assert.equal(
      doc.querySelector(`link[rel=alternate][hreflang="${language}"]`).href,
      `https://gopheratlas.com${target}`,
    );
  for (const type of ['note', 'curated_article', 'topic', 'tags'])
    assert.equal(
      Number(doc.querySelector(`[data-stat-count="${type}"]`).textContent),
      type === 'tags'
        ? snapshot.tags.length
        : snapshot.content.filter((item) => item.type === type).length,
    );
  assert(
    doc.querySelector('[data-stats-switch]').hasAttribute('hidden'),
    'Progressive chart controls',
  );
  for (const type of ['all', 'note', 'curated_article', 'topic']) {
    const panel = doc.querySelector(`[data-stats-panel="${type}"]`);
    assert.equal(panel.hasAttribute('hidden'), type !== 'all');
    const days = new Map();
    for (const item of snapshot.content.filter(
      (item) => item.type !== 'post' && (type === 'all' || type === item.type),
    )) {
      const day = new Date(item.firstPublishedAt).toISOString().slice(0, 10);
      days.set(day, (days.get(day) ?? 0) + 1);
    }
    let total = 0;
    const expected = [...days]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, added]) => [date, String((total += added))]);
    assert.deepEqual(
      [...panel.querySelectorAll('tbody tr')].map((row) =>
        [...row.querySelectorAll('td')].map((cell) => cell.textContent.trim()),
      ),
      expected,
    );
    const svg = panel.querySelector('svg');
    assert(!svg.querySelector('title') && !svg.hasAttribute('title'));
    assert(svg.getAttribute('aria-label')?.includes(String(total)));
    assert(
      panel
        .querySelector('#' + svg.getAttribute('aria-describedby'))
        ?.textContent.trim(),
    );
    assert(panel.querySelector('details > summary'));
  }
  assert(
    doc.querySelector(
      '[data-statistics] time[datetime="' + snapshot.exportedAt + '"]',
    ),
  );
  assert(!doc.querySelector('main[data-pagefind-body], astro-island'));
  const traffic = doc.querySelector('[data-traffic-chart]');
  assert(!traffic.querySelector('title') && !traffic.hasAttribute('title'));
  for (const attribute of ['aria-labelledby', 'aria-describedby'])
    assert(doc.getElementById(traffic.getAttribute(attribute)));
  for (const dimension of ['site', 'pages', 'referrers'])
    assert(
      doc.querySelector(`[data-traffic-${dimension}]`).hasAttribute('hidden'),
      'No traffic shell is visible without API data',
    );
  assert.equal(doc.querySelectorAll('[data-traffic-pages-list] li').length, 0);
  assert.equal(doc.querySelectorAll('[data-traffic-table] tr').length, 0);
}
for (const path of ['/legal/', '/en/legal/']) {
  const doc = pageDocument(path);
  assert.equal(
    doc.querySelector('h1').textContent.trim(),
    words[localeOf(path)].legalTitle,
  );
  assert.equal(doc.querySelectorAll('.markdown h2').length, 4);
  assert.equal(doc.documentElement.lang, path === '/legal/' ? 'zh-CN' : 'en');
  assert.equal(
    doc.querySelector('link[rel=alternate][hreflang="zh-CN"]').href,
    'https://gopheratlas.com/legal/',
  );
  assert.equal(
    doc.querySelector('link[rel=alternate][hreflang=en]').href,
    'https://gopheratlas.com/en/legal/',
  );
  assert.equal(
    doc.querySelector('link[rel=alternate][hreflang=x-default]').href,
    'https://gopheratlas.com/legal/',
  );
  assert(
    doc.querySelector('.markdown a[href="https://wallhaven.cc/w/0jz7gm"]'),
  );
  assert(
    !doc.querySelector(
      'main[data-pagefind-body], [data-discussion], astro-island',
    ),
  );
}
for (const path of ['/', '/en/']) {
  const doc = pageDocument(path);
  const heroImage = doc.querySelector('.home-hero img');
  assert.equal(heroImage?.getAttribute('src'), '/images/background.avif');
  assert.equal(heroImage.draggable, false);
  assert.equal(heroImage.getAttribute('fetchpriority'), 'high');
  assert.equal(
    doc.querySelector('.home-hero h1').textContent.trim(),
    path === '/'
      ? '代码之内，自有旷野。'
      : 'Within the code, the wild remains.',
  );
  assert.equal(
    doc.querySelector('[data-hero-subtitle]').textContent.trim(),
    path === '/'
      ? '我们试着理解世界，也不愿停止想象。'
      : 'We try to understand the world, yet never stop imagining.',
  );
  assert.equal(doc.querySelectorAll('.corner-link').length, 9);
  assert.equal(
    doc.querySelectorAll('#primary-navigation .corner-link').length,
    7,
  );
  assert.equal(
    doc.querySelectorAll('[data-hero-actions] .corner-link').length,
    2,
  );
  assert(!doc.querySelector('.brand.corner-link, footer .corner-link'));
  assert(
    doc.querySelector('[data-language-link] > .corner-link > .corner-brackets'),
  );
  assert(
    doc.querySelector('[data-theme-toggle] > .corner-link > .corner-brackets'),
  );
  const github = doc.querySelector('#primary-navigation a[target="_blank"]');
  assert.equal(
    github.querySelector('.corner-link').textContent.trim(),
    'GitHub',
  );
  assert(github.querySelector(':scope > .icon'));
  assert(!github.querySelector('.corner-link .icon'));
  assert.equal(doc.querySelector('#main').getAttribute('tabindex'), '-1');
  assert.equal(
    heroImage?.getAttribute('alt'),
    "There's no place like 127.0.0.1",
  );
  assert(!doc.querySelector('.home-hero').textContent.includes('127.0.0.1'));
  assert(!doc.querySelector('.brand img'));
  assert.deepEqual(
    [...doc.querySelectorAll('[data-home-section]')].map(
      (n) => n.dataset.homeSection,
    ),
    ['notes', 'articles', 'topics'],
  );
  const notes = snapshot.content
    .filter((c) => c.type === 'note')
    .sort((a, b) => b.lastPublishedAt - a.lastPublishedAt || b.id - a.id)
    .slice(0, 4);
  assert.deepEqual(
    [...doc.querySelectorAll('[data-home-section="notes"] h3 a')].map(
      (a) => a.textContent,
    ),
    notes.map((c) => c.title),
  );
}
assert.equal(
  sha256(readFileSync(`${out}/images/background.avif`)),
  sha256(readFileSync('apps/web/public/images/background.avif')),
);
const curatedList = pageDocument('/articles/');
for (const item of snapshot.content.filter(
  (c) => c.type === 'curated_article',
)) {
  const row = curatedList.querySelector(`[data-article][data-id="${item.id}"]`);
  assert(row.querySelector(`a[href="${item.canonicalPath}"]`));
  assert(
    row.querySelector(
      `a[href="${item.payload.sourceUrl}"][rel="noopener noreferrer"]`,
    ),
  );
  assert(row.dataset.searchText.includes(item.bodyMarkdown));
  assert(!row.querySelector('.markdown'));
}
const notFound = new JSDOM(read('404.html')).window.document;
let tagFilterOrder;
for (const locale of ['zh', 'en']) {
  const tags = pageDocument(localized('/tags/', locale));
  const articles = pageDocument(localized('/articles/', locale));
  const order = [...articles.querySelectorAll('[data-tag-option] input')].map(
    (input) => input.value,
  );
  if (tagFilterOrder)
    assert.deepEqual(
      order,
      tagFilterOrder,
      'Tag filter order must not change with locale',
    );
  tagFilterOrder = order;
  for (const tag of p.tags) {
    const text = taxonomyText(tag, locale);
    const link = tags.querySelector(
      `.directory-list a[href="${localized(`/tags/${tag.slug}/`, locale)}"]`,
    );
    assert.equal(link?.textContent.trim(), text.name);
    assert(link.closest('li').textContent.includes(text.description));
    const filter = articles.querySelector(
      `[data-tag-option]:has(input[value="${tag.slug}"])`,
    );
    if (
      p.contentByTag.get(tag.id).some((item) => item.type === 'curated_article')
    ) {
      assert.equal(filter?.dataset.tagName, text.name);
      assert(filter.textContent.includes(text.name));
    }
  }
  for (const page of pages.filter(
    (page) => page.kind === 'collection' && (page.tag || page.group),
  )) {
    const doc = pageDocument(localized(page.path, locale));
    const text = collectionText(page, locale);
    assert.equal(doc.querySelector('h1').textContent.trim(), text.title);
    assert.equal(
      doc.title,
      `${text.title}${page.page > 1 ? ` / ${page.page} ${words[locale].page}` : ''} · GopherAtlas`,
    );
    assert.equal(
      doc.querySelector('meta[name=description]')?.content,
      text.description,
    );
  }
  for (const item of p.snapshot.content) {
    if (locale === 'en' && isEditorial(item) && !hasEnglish(item)) continue;
    const doc = pageDocument(localized(item.canonicalPath, locale));
    if (item.type !== 'post') {
      const shares = doc.querySelectorAll('[data-share]');
      assert.equal(shares.length, 1);
      const sharing = shareLinks(
        localized(item.canonicalPath, locale),
        editorialView(item, locale).title,
      );
      assert.deepEqual(
        [...shares[0].querySelectorAll('a')].map((link) => link.href),
        sharing.links.map((link) => link.href),
      );
      assert.equal(doc.querySelectorAll('[data-copy-link]').length, 1);
      assert.equal(
        shares[0].querySelector('button')?.dataset.copyText,
        sharing.url,
      );
      assert(shares[0].closest('header'));
      for (const link of shares[0].querySelectorAll('a')) {
        assert.equal(link.target, '_blank');
        assert.equal(link.rel, 'noopener noreferrer');
        assert(link.getAttribute('aria-label'));
      }
    }
    for (const id of item.tagIds) {
      const tag = p.tagById.get(id);
      const link = doc.querySelector(
        `.tag-list a[href="${localized(`/tags/${tag.slug}/`, locale)}"]`,
      );
      assert.equal(link?.textContent.trim(), taxonomyText(tag, locale).name);
    }
    if (item.type === 'note') {
      const group = p.notesByGroup.get(item.payload.groupSlug);
      for (const link of doc.querySelectorAll(
        `.content-detail a[href="${localized(`/notes/${group.slug}/`, locale)}"]`,
      ))
        assert.equal(link.textContent.trim(), taxonomyText(group, locale).name);
      const discussion = doc.querySelector('[data-discussion]');
      if (discussion)
        assert.equal(
          discussion.dataset.term,
          `note:${item.payload.groupSlug}/${item.slug}`,
        );
    }
  }
}
assert.equal(notFound.querySelector('h1').textContent.trim(), '404');
assert(notFound.querySelector('meta[name=robots]').content.includes('noindex'));
assert(!existsSync(`${out}/__dev/blog-preview`));
for (const path of ['/notes/', '/en/notes/']) {
  const doc = pageDocument(path);
  for (const group of p.groups) {
    const heading = doc.querySelector(
      `.note-group h2 a[href="${localized(`/notes/${group.slug}/`, localeOf(path))}"]`,
    );
    assert.equal(
      heading?.textContent,
      taxonomyText(group, localeOf(path)).name,
      `Note group label: ${path}`,
    );
    assert(
      heading
        .closest('article')
        .textContent.includes(taxonomyText(group, localeOf(path)).description),
    );
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
  if (item.type === 'topic') {
    assert.equal(
      doc.querySelectorAll('.article-card').length,
      item.topicEntries.length,
    );
    assert.equal(
      doc.querySelectorAll('[data-recommended="true"]').length,
      item.payload.recommendedCount,
    );
    assert.deepEqual(
      [...doc.querySelectorAll('.topic-entries .article-card h3 a')].map((a) =>
        a.getAttribute('href'),
      ),
      p.topicTargets
        .get(item.id)
        .map((entry) => entry.content.payload.sourceUrl),
    );
  }
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
  const base = pageDocument(path),
    alias = pageDocument('/en' + path);
  const item = snapshot.content.find((item) => item.canonicalPath === path);
  assert.equal(alias.documentElement.dataset.locale, 'en');
  if (item && isEditorial(item)) {
    if (hasEnglish(item)) {
      const view = editorialView(item, 'en');
      const englishUrl = `https://gopheratlas.com/en${path}`;
      assert.equal(alias.querySelector('link[rel=canonical]').href, englishUrl);
      assert.equal(
        alias.querySelector('meta[property="og:url"]').content,
        englishUrl,
      );
      assert.equal(
        alias.querySelector('meta[name=description]').content,
        view.seoDescription.trim() || view.summary,
      );
      assert.equal(
        alias.querySelector('meta[property="og:title"]').content,
        view.seoTitle.trim() || view.title,
      );
      assert.equal(alias.documentElement.lang, 'en');
      assert.equal(alias.querySelector('h1').textContent.trim(), view.title);
      assert(alias.querySelector('main[data-pagefind-body]'));
      assert(!alias.querySelector('meta[name=robots]'));
      assert.equal(
        alias.querySelector('link[rel=alternate][hreflang=en]').href,
        `https://gopheratlas.com/en${path}`,
      );
      assert.equal(
        base.querySelector('link[rel=alternate][hreflang=en]').href,
        `https://gopheratlas.com/en${path}`,
      );
    } else {
      assert(
        alias.querySelector('meta[name=robots]').content.includes('noindex'),
      );
      assert(!alias.querySelector('main[data-pagefind-body]'));
      assert(!alias.querySelector('link[hreflang=en]'));
      assert.equal(alias.documentElement.lang, 'en');
      assert.equal(
        alias.querySelector('h1').textContent.trim(),
        'English version unavailable',
      );
      assert(!alias.querySelector('.markdown'));
      assert.equal(alias.querySelector('main a').getAttribute('href'), path);
      assert(!locations.includes(`https://gopheratlas.com/en${path}`));
    }
    continue;
  }
  assert(!locations.includes(`https://gopheratlas.com/en${path}`));
  assert(!alias.querySelector('main[data-pagefind-body]'));
  if (
    path !== '/authors/' &&
    path !== '/tags/' &&
    !pages.some(
      (page) =>
        page.path === path &&
        page.kind === 'collection' &&
        (page.tag || page.group),
    )
  )
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
assert.equal(marker.schemaVersion, snapshot.schemaVersion);
assert(Number.isFinite(Date.parse(marker.builtAt)));
assert.match(marker.commitSha, /^[a-f0-9]{40,64}$/);
assert(existsSync(`${out}/pagefind/pagefind.js`));
const index = JSON.parse(read('pagefind/pagefind-entry.json'));
assert.equal(
  index.languages.zh.page_count,
  snapshot.content.filter((item) => item.type !== 'post').length +
    snapshot.content.filter(hasEnglish).length +
    4,
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
  if (path.endsWith('.js'))
    assert(
      !/stylex\.create|virtual:stylex|react-dom/.test(bytes.toString()),
      'Unexpected styling/hydration runtime',
    );
  for (const marker of [
    'PRIVATE_DRAFT_ONLY',
    'PRIVATE_REVIEW_ONLY',
    'PRIVATE_CMS_ORIGIN',
    'CONTENT_R2_SECRET_ACCESS_KEY',
    'GITHUB_OAUTH_CLIENT_SECRET',
    'CLOUDFLARE_DEPLOY_HOOK_URL',
    'RUM_ANALYTICS_TOKEN',
    'synthetic-private-token',
    'rumPageloadEventsAdaptiveGroups',
    '"githubUserId"',
    '"pendingReviewRevisionId"',
  ])
    assert(
      !bytes.includes(Buffer.from(marker)),
      'Private data in Public output',
    );
}
console.log(
  `Public v${version} fixture artifacts passed: ${snapshot.content.length} details, ${canonicalPaths.length} canonical pages + ${aliases.length} chrome aliases, redirects/RSS/sitemap/Pagefind/marker and privacy.`,
);
