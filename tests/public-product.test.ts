// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  filterArticles,
  parseFilters,
  mountExplorer,
  mountSelect,
  type ArticleIndex,
} from '../apps/web/src/lib/explorer';
import { alternateChrome, chromePaths, words } from '../apps/web/src/lib/i18n';
import {
  discussionEnabled,
  discussionTerm,
  mountDiscussion,
} from '../apps/web/src/lib/discussion';
import { renderMarkdown } from '../apps/web/src/lib/publication/markdown';
import { createPublication } from '../apps/web/src/lib/publication/indexes';
import type { Snapshot } from '../apps/web/src/lib/publication/types';
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});
const row = (id: number, extra: Partial<ArticleIndex> = {}): ArticleIndex => ({
  id,
  title: `Article ${id}`,
  text: `article ${id} gc author`,
  topics: ['go'],
  tags: ['gc', 'memory'],
  language: 'zh',
  rating: 'A+',
  difficulty: 'intermediate',
  recommended: false,
  featured: false,
  added: id,
  sourceDate: '2026-04-01',
  ...extra,
});
it('preserves old shared category/tag/rating URLs and featured-before-mustRead sorting', () => {
  const filters = parseFilters(
    new URLSearchParams(
      'category=Benchmarking+%26+Comparisons&tags=Go+1.25,GC&rating=A%2B,S&sort=recently-added',
    ),
    {
      topics: new Map([
        ['Benchmarking & Comparisons', 'benchmarking-and-comparisons'],
      ]),
      tags: new Map([
        ['Go 1.25', 'go-1-25'],
        ['GC', 'gc'],
      ]),
    },
  );
  expect(filters.topic).toBe('benchmarking-and-comparisons');
  expect(filters.tags).toEqual(['go-1-25', 'gc']);
  expect(filters.ratings).toEqual(['A+', 'S']);
  expect(filters.sort).toBe('added');
  expect(
    filterArticles(
      [row(1, { recommended: true }), row(2, { featured: true })],
      { ...parseFilters(new URLSearchParams()), sort: 'recommended' },
    ).map((r) => r.id),
  ).toEqual([2, 1]);
});
it('filters AND tags and inverse Topics, sorts source dates and recommendation, and parses repeatable URL fields', () => {
  const filters = parseFilters(
    new URLSearchParams(
      'q=GC&topic=go&tags=gc&tags=memory&rating=A%2B&lang=zh&difficulty=intermediate',
    ),
  );
  const rows = [
    row(1),
    row(2, { tags: ['gc'] }),
    row(3, { topics: ['web'] }),
    row(4, { sourceDate: '2026-05-01' }),
    row(5, { language: 'en' }),
  ];
  expect(filterArticles(rows, filters).map((r) => r.id)).toEqual([4, 1]);
  expect(
    filterArticles([row(1, { recommended: true }), row(2)], {
      ...parseFilters(new URLSearchParams()),
      sort: 'recommended',
    }).map((r) => r.id),
  ).toEqual([1, 2]);
  expect(parseFilters(new URLSearchParams('page=-4')).page).toBe(1);
});
it('custom Select supports arrow navigation, selection and Escape without a native-only control', () => {
  document.body.innerHTML =
    '<div data-select><input value=""><button aria-expanded="false"><span data-value>All</span></button><div role="listbox" hidden><button role="option" data-value="">All</button><button role="option" data-value="go">Go</button></div></div>';
  const root = document.querySelector<HTMLElement>('[data-select]')!;
  mountSelect(root);
  root.querySelector('button')!.click();
  expect(root.querySelector<HTMLElement>('[role=listbox]')!.hidden).toBe(false);
  root.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
  );
  expect(document.activeElement?.textContent).toBe('Go');
  (document.activeElement as HTMLButtonElement).click();
  expect(root.querySelector('input')!.value).toBe('go');
  expect(root.querySelector('[data-value]')!.textContent).toBe('Go');
  root.querySelector('button')!.click();
  root.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  );
  expect(root.querySelector<HTMLElement>('[role=listbox]')!.hidden).toBe(true);
});
it('Public explorer paginates twelve, synchronizes URL and leaves all original source nodes intact', () => {
  document.body.innerHTML =
    '<div data-explorer><form><input name="q"><input name="sort" value="source-date"></form><span data-result-count></span><div data-results-heading></div><div data-results></div><p data-empty></p><nav data-pagination></nav></div>';
  const root = document.querySelector<HTMLElement>('[data-explorer]')!,
    results = root.querySelector('[data-results]')!;
  for (let id = 1; id <= 27; id++) {
    const article = document.createElement('article');
    article.setAttribute('data-article', '');
    Object.assign(article.dataset, {
      id: String(id),
      topics: '["go"]',
      tags: '["gc"]',
      language: 'zh',
      rating: 'A',
      difficulty: 'beginner',
      title: `Title ${id}`,
      recommended: '0',
      added: String(id),
      sourceDate: '2026-01-01',
    });
    article.textContent = `Title ${id}`;
    results.append(article);
  }
  mountExplorer(root);
  expect(root.querySelectorAll('[data-article]:not([hidden])')).toHaveLength(
    12,
  );
  expect(root.querySelectorAll('[data-pagination] a')).toHaveLength(3);
  const input = root.querySelector('input')!;
  input.value = 'Title 27';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  expect(root.querySelectorAll('[data-article]:not([hidden])')).toHaveLength(1);
  expect(location.search).toContain('Title+27');
  expect(results.children).toHaveLength(27);
});
it('locale chrome has matching keys and never rewrites a canonical legacy detail path', () => {
  expect(Object.keys(words.zh).sort()).toEqual(Object.keys(words.en).sort());
  for (const path of chromePaths)
    expect(alternateChrome(path, 'en')).toBe('/en' + path);
  expect(
    alternateChrome('/notes/cybersecurity/crs-for-fiber-service/', 'en'),
  ).toBe('/en/');
});
it('one safe Markdown renderer produces GFM, footnotes, bounded code/table surfaces and controlled images', async () => {
  const source =
    '## Heading\n\n### Subheading\n\n```go\nfmt.Println("hello")\n```\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\nText[^a].\n\n[^a]: A footnote.\n\n![Diagram](https://assets.gopheratlas.com/example.png)\n\n[Source](https://example.com)';
  const rendered = await renderMarkdown(source);
  document.body.innerHTML = rendered.code;
  expect(rendered.metadata.headings.map((h) => h.slug)).toContain('heading');
  expect(document.querySelector('.code-toolbar')?.textContent).toContain('go');
  expect(document.querySelector('[data-copy-code]')).toBeTruthy();
  expect(document.querySelector('.table-scroll table')).toBeTruthy();
  expect(document.querySelector('[data-footnotes]')).toBeTruthy();
  expect(document.querySelector('img')?.getAttribute('loading')).toBe('lazy');
  expect(
    document
      .querySelector('a[href="https://example.com"]')
      ?.getAttribute('rel'),
  ).toContain('noreferrer');
  await expect(renderMarkdown('<script>alert(1)</script>')).rejects.toThrow(
    'public_markdown_invalid',
  );
  await expect(
    renderMarkdown('![x](https://external.example/image.png)'),
  ).rejects.toThrow('public_markdown_invalid');
});
it('giscus is disabled without public IDs; stable terms ignore title, and enabled loading is lazy and theme-aware', () => {
  vi.useFakeTimers();
  expect(
    discussionEnabled({ repo: '', repoId: '', category: '', categoryId: '' }),
  ).toBe(false);
  expect(discussionTerm('security', 'crs')).toBe('note:security/crs');
  document.body.innerHTML =
    '<section data-discussion><button data-load-discussion>Load</button><div class="giscus"></div><p data-discussion-error hidden></p></section>';
  const root = document.querySelector<HTMLElement>('section')!;
  root.dataset.config = JSON.stringify({
    repo: 'test/discussions',
    repoId: 'R_123',
    category: 'Notes',
    categoryId: 'DIC_123',
  });
  root.dataset.term = 'note:security/crs';
  mountDiscussion(root);
  expect(root.querySelector('script')).toBeNull();
  root.querySelector('button')!.click();
  const script = root.querySelector('script')!;
  expect(script.src).toBe('https://giscus.app/client.js');
  expect(script.dataset.term).toBe('note:security/crs');
  expect(script.dataset.reactionsEnabled).toBe('1');
  script.dispatchEvent(new Event('error'));
  expect(
    root.querySelector<HTMLElement>('[data-discussion-error]')!.hidden,
  ).toBe(false);
});
it('invalid Topic graph and shared Note group metadata fail closed and Post stays out of feed', () => {
  const snapshot = JSON.parse(
    readFileSync('tests/fixtures/content-snapshot-v1.json', 'utf8'),
  ) as Snapshot;
  expect(createPublication(snapshot).feed.every((c) => c.type !== 'post')).toBe(
    true,
  );
  const note = snapshot.content.find((c) => c.type === 'note')!,
    other = snapshot.content.filter((c) => c.type === 'note')[1];
  if (other.type === 'note' && note.type === 'note')
    other.payload.groupDescription = note.payload.groupDescription + 'wrong';
  expect(() => createPublication(snapshot)).toThrow(
    'public_note_group_conflict',
  );
});
