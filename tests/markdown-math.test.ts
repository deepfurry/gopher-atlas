import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { renderMarkdown } from '../apps/web/src/lib/publication/markdown';
import mathCases from './fixtures/markdown-math.json';

describe('Public build-time math', () => {
  it.each(mathCases)('$name', async (fixture) => {
    if (!fixture.valid) {
      await expect(renderMarkdown(fixture.source)).rejects.toThrow(
        'public_markdown_invalid',
      );
      return;
    }
    const { code } = await renderMarkdown(fixture.source);
    const document = new JSDOM(code).window.document;
    expect(
      document.querySelector('script, iframe, img, a, [onerror], [onclick]'),
    ).toBeNull();
    expect(document.querySelector('[style*="position:fixed"]')).toBeNull();
    expect(document.querySelectorAll('.katex')).toHaveLength(fixture.math!);
    expect(document.querySelectorAll('.katex-display')).toHaveLength(
      fixture.display!,
    );
    expect(document.querySelectorAll('math')).toHaveLength(fixture.math!);
    expect(document.querySelectorAll('.code-toolbar')).toHaveLength(
      fixture.source.startsWith('```') ? 1 : 0,
    );
    if (fixture.error)
      expect(document.querySelector('.katex-error')?.textContent).toBeTruthy();
    if (fixture.code)
      expect(document.querySelectorAll('code')).toHaveLength(fixture.code);
    if (fixture.text) expect(document.body.textContent).toBe(fixture.text);
  });
  it('keeps macro definitions local to a formula', async () => {
    await renderMarkdown('$\\gdef\\custommacro{X}\\custommacro$');
    const { code } = await renderMarkdown('$\\custommacro$');
    const document = new JSDOM(code).window.document;
    expect(document.querySelector('.katex-html')?.textContent).toContain(
      '\\custommacro',
    );
  });
  it('bounds user-specified formula dimensions', async () => {
    const { code } = await renderMarkdown('$\\rule{10000em}{10000em}$');
    const document = new JSDOM(code).window.document;
    const styles = [...document.querySelectorAll('[style]')]
      .map((node) => node.getAttribute('style'))
      .join(' ');
    expect(styles).not.toContain('10000em');
    expect(styles).toContain('20em');
  });
});
