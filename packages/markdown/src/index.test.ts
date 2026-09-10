import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { isSafeLink, remarkPlugins, validateMarkdown } from './index';

const fixtures = new URL('../../../tests/fixtures/markdown/', import.meta.url);
describe('shared Markdown boundary', () => {
  for (const name of readdirSync(fixtures).filter((name) =>
    name.endsWith('.md'),
  )) {
    it(`validates ${name} consistently with the remark pipeline`, () => {
      const source = readFileSync(new URL(name, fixtures), 'utf8');
      const processor = unified().use(remarkParse).use(remarkPlugins);
      const run = () =>
        processor.runSync(processor.parse(source), {
          value: source,
          path: fileURLToPath(new URL(name, fixtures)),
        });
      if (name === 'unsafe.md') {
        expect(validateMarkdown(source).length).toBeGreaterThan(0);
        expect(run).toThrow('Invalid Markdown');
      } else {
        expect(validateMarkdown(source)).toEqual([]);
        expect(run).not.toThrow();
      }
    });
  }
  it.each([
    ['# Title', 'body_h1'],
    ['<script>alert(1)</script>', 'raw_html'],
    ['<Widget />', 'raw_html'],
    ['[bad](javascript:alert%281%29)', 'unsafe_url'],
    ['[bad](data:text/html,x)', 'unsafe_url'],
    ['![alt](https://elsewhere.example/a.png)', 'external_image'],
    ['![alt](https:assets.gopheratlas.com/a.png)', 'external_image'],
    ['![](https://assets.gopheratlas.com/a.png)', 'missing_alt'],
    ['![alt][x]\n\n[x]: https://evil.example/a.png', 'external_image'],
    ['---\ntitle: metadata\n---\nBody', 'frontmatter'],
  ])('rejects %s', (source, code) => {
    expect(validateMarkdown(source).map((issue) => issue.code)).toContain(code);
  });
  it.each([
    '//evil.example',
    'javascript:alert(1)',
    'data:text/html,x',
    '/\\evil.example',
    'https://user:password@example.com',
    '\u0000https://example.com',
  ])('rejects URL %s', (url) => {
    expect(isSafeLink(url)).toBe(false);
  });
});
