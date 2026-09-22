import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import {
  createLegacyPlan,
  legacySlug,
  rewriteImages,
} from '../scripts/legacy/plan.mjs';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function source() {
  const root = mkdtempSync(join(tmpdir(), 'atlas-legacy-'));
  roots.push(root);
  for (const dir of ['data', 'content/topics', 'content/notes/group'])
    mkdirSync(join(root, 'src', dir), { recursive: true });
  const article = {
    id: 'one',
    title: 'Original',
    url: 'https://example.com/one',
    author: 'External writer',
    source: 'Journal',
    category: 'Go New Features',
    tags: ['Go & Runtime'],
    rating: 'A+',
    difficulty: 'intermediate',
    language: 'en',
    publishedAt: '2025-01-01',
    addedAt: '2026-01-02',
    summary: 'Summary',
    reason: 'Curation only',
    featured: true,
  };
  writeFileSync(
    join(root, 'src/data/articles.json'),
    JSON.stringify([article, { ...article, id: 'two', title: 'Second' }]),
  );
  writeFileSync(
    join(root, 'src/content/topics/go.md'),
    '---\ntitle: Go\nslug: go-new-features\nsummary: Introduction\nreadingOrder: [two, two]\n---\n## Guide',
  );
  writeFileSync(
    join(root, 'src/content/notes/group/exact-file.md'),
    '---\ntitle: A note\ndescription: Summary\nauthor: Writer\ncreatedAt: 2024-01-02\nupdatedAt: 2024-02-03\ngroup: Group\ngroupDescription: A learning group\ngroupOrder: 2\norder: 3\n---\n## Body\n![Diagram](https://images.example.com/old.png)',
  );
  return root;
}
const options = { ownerId: 1, authors: { Writer: 2 } };
test('source-only plan preserves metadata, routes, dates, topic order and explicit authors without writes', () => {
  const root = source(),
    before = readFileSync(join(root, 'src/data/articles.json'));
  const plan = createLegacyPlan(root, options);
  expect(plan.errors).toEqual([]);
  expect(plan.stats).toMatchObject({
    curatedArticles: 2,
    topics: 1,
    notes: 1,
    tags: 1,
    images: 1,
    recommendedEntries: 1,
  });
  expect(plan.items[0]).toMatchObject({
    slug: 'one',
    bylineUserId: 1,
    bodyMarkdown: 'Curation only',
    firstPublishedAt: Date.parse('2026-01-02Z'),
    payload: { sourceAuthor: 'External writer' },
  });
  expect(plan.items[2]).toMatchObject({
    targetKeys: ['curated_article:two', 'curated_article:one'],
    payload: { recommendedCount: 1 },
  });
  expect(plan.items[3]).toMatchObject({
    slug: 'exact-file',
    bylineUserId: 2,
    payload: { groupOrder: 2, groupDescription: 'A learning group' },
  });
  expect(plan.routes.map((r: { path: string }) => r.path)).toContain(
    '/notes/group/exact-file/',
  );
  expect(readFileSync(join(root, 'src/data/articles.json'))).toEqual(before);
  expect(createLegacyPlan(root, options)).toEqual(plan);
});
test('slug rules distinguish explicit note slugs from filename fallback and report tag collisions', () => {
  const root = source();
  expect(legacySlug('  Go & Runtime  ')).toBe('go-runtime');
  const file = join(root, 'src/content/notes/group/exact-file.md');
  writeFileSync(
    file,
    readFileSync(file, 'utf8').replace('order: 3', 'order: 3\nslug: A & Name'),
  );
  expect(createLegacyPlan(root, options).items.at(-1).slug).toBe('a-name');
  const articles = JSON.parse(
    readFileSync(join(root, 'src/data/articles.json'), 'utf8'),
  );
  articles[1].tags = ['Go Runtime'];
  writeFileSync(join(root, 'src/data/articles.json'), JSON.stringify(articles));
  expect(
    createLegacyPlan(root, options).errors.some((e: { reason: string }) =>
      e.reason.includes('tag_slug_collision'),
    ),
  ).toBe(true);
});
test('unknown author, conflicting group metadata and unsafe Markdown name the offending source', () => {
  const root = source(),
    file = join(root, 'src/content/notes/group/exact-file.md');
  expect(createLegacyPlan(root, { ownerId: 1 }).errors).toContainEqual(
    expect.objectContaining({
      field: 'author',
      reason: 'author_mapping_required:Writer',
    }),
  );
  writeFileSync(
    join(root, 'src/content/notes/group/other.md'),
    readFileSync(file, 'utf8').replace('groupOrder: 2', 'groupOrder: 4') +
      '\n<script>bad</script>',
  );
  const issues = createLegacyPlan(root, options).errors;
  expect(issues).toContainEqual(
    expect.objectContaining({
      file: 'src/content/notes/group/other.md',
      reason: expect.stringContaining('group_metadata_conflict'),
    }),
  );
  expect(issues).toContainEqual(
    expect.objectContaining({ reason: 'raw_html' }),
  );
});
test('image replacement respects parsed images, reference definitions, alt and code fences', () => {
  const url = 'https://images.example.com/a.png',
    next = 'https://assets.gopheratlas.com/a.png';
  const body = `![说明](${url})\n![第二张][diagram]\n\n[diagram]: ${url}\n\n\`\`\`md\n![code](${url})\n\`\`\``;
  expect(rewriteImages(body, new Map([[url, next]]))).toBe(
    `![说明](${next})\n![第二张][diagram]\n\n[diagram]: ${next}\n\n\`\`\`md\n![code](${url})\n\`\`\``,
  );
});
