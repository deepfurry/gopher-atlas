import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { validateSnapshot, sha256 } from './snapshot.mjs';
import { createPublication } from '../apps/web/src/lib/publication/indexes.ts';
import { publicPages } from '../apps/web/src/lib/publication/routes.ts';

// Explicit local files only. No dotenv, CMS or network, and no content logged.
const [planFile, snapshotFile] = process.argv.slice(2);
assert(
  planFile && snapshotFile,
  'Usage: node scripts/check-legacy-public.mjs <plan.json> <snapshot.json>',
);
const plan = JSON.parse(readFileSync(planFile, 'utf8')),
  bytes = readFileSync(snapshotFile),
  snapshot = validateSnapshot(bytes),
  publication = createPublication(snapshot);
assert.equal(plan.errors.length, 0);
const document = (path) => {
  assert(
    /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)*$/.test(path),
    'Invalid planned path',
  );
  return new JSDOM(
    readFileSync(resolve('apps/web/dist', '.' + path, 'index.html'), 'utf8'),
  ).window.document;
};
for (const page of publicPages(publication)) {
  const doc = document(page.path);
  assert.equal(doc.querySelectorAll('h1').length, 1);
  assert.equal(
    doc.querySelector('link[rel=canonical]')?.getAttribute('href'),
    'https://gopheratlas.com' + page.path,
  );
}
for (const route of plan.routes) document(route.path);
for (const path of ['/notes/', '/en/notes/']) {
  const doc = document(path);
  for (const group of publication.groups) {
    const heading = doc.querySelector(
      `.note-group h2 a[href="/notes/${group.slug}/"]`,
    );
    assert.equal(heading?.textContent, group.name);
    assert(heading.closest('article').textContent.includes(group.description));
  }
}
for (const item of plan.items) {
  const path = plan.routes.find((route) => route.file === item.file).path;
  const content = snapshot.content.find(
    (content) => content.canonicalPath === path,
  );
  assert(content);
  assert.equal(content.title, item.title);
  assert.equal(content.summary, item.summary);
  if (item.firstPublishedAt != null) {
    assert.equal(content.firstPublishedAt, item.firstPublishedAt);
    assert.equal(content.lastPublishedAt, item.lastPublishedAt);
  }
  const doc = document(path);
  if (item.type === 'curated_article') {
    assert.equal(
      doc.querySelector('h1 a')?.getAttribute('href'),
      item.payload.sourceUrl,
    );
    assert(
      doc
        .querySelector('.source-meta')
        ?.textContent.includes(item.payload.sourceAuthor),
    );
  }
  if (item.type === 'topic') {
    assert.equal(
      content.payload.recommendedCount,
      item.payload.recommendedCount,
    );
    assert.deepEqual(
      content.topicEntries.map((entry) => {
        const target = publication.contentById.get(entry.targetContentId);
        return `${target.type}:${target.slug}`;
      }),
      item.targetKeys,
    );
    assert.equal(
      doc.querySelectorAll('.topic-entries .article-card').length,
      item.targetKeys.length,
    );
  }
  if (item.type === 'note') {
    assert(
      doc
        .querySelector('.publication-meta')
        ?.textContent.includes(
          publication.authorById.get(content.authorId).displayName,
        ),
    );
    assert(doc.querySelectorAll('.code-block').length > 0);
    for (const image of doc.querySelectorAll('.markdown img'))
      assert.match(
        image.getAttribute('src'),
        /^https:\/\/assets\.gopheratlas\.com\/media\/sha256\/[a-f0-9]{2}\/[a-f0-9]{64}\.(png|jpg|webp|gif)$/,
      );
    for (const old of plan.images) assert(!content.bodyMarkdown.includes(old));
  }
}
const marker = JSON.parse(
  readFileSync('apps/web/dist/.well-known/gopheratlas-build.json', 'utf8'),
);
assert.equal(marker.generation, snapshot.generation);
assert.equal(marker.snapshotSha256, sha256(bytes));
assert.equal(
  JSON.parse(readFileSync('apps/web/dist/pagefind/pagefind-entry.json', 'utf8'))
    .languages.zh.page_count,
  snapshot.content.filter((c) => c.type !== 'post').length + 4,
);
console.log(
  `Legacy public artifacts passed: ${plan.items.length} contents, ${plan.routes.filter((r) => r.preserved).length} preserved paths, exact dates/Topic order/source links/images, Pagefind and generation marker.`,
);
