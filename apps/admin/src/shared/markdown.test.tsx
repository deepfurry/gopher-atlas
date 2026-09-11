// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { MarkdownPreview, MarkdownFeedback } from './markdown';
import { MarkdownEditor } from '@/features/content/markdown-editor';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it.each([
  '![x](https://third-party.example/x.png)',
  '![x](//third-party.example/x.png)',
  '![x](data:image/png;base64,AAA)',
  '![x](https://assets.gopheratlas.com.evil.example/x.png)',
  '![x][a]\n\n[a]: https://third-party.example/x.png',
  '![](https://assets.gopheratlas.com/x.png)',
])('never creates a network-capable image for unsafe preview %s', (source) => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const { container } = render(<MarkdownPreview source={source} />);
  expect(container.querySelector('img')).toBeNull();
  expect(screen.getByText(/已拦截图片/)).toBeTruthy();
  expect(fetch).not.toHaveBeenCalled();
});
it('renders only controlled asset images and safe links, and drops raw HTML', () => {
  const { container } = render(
    <MarkdownPreview
      source={
        '![A gopher](https://assets.gopheratlas.com/gopher.png)\n\n[Go](https://go.dev/)\n\n[unsafe](javascript:alert(1))\n\n<script>alert(1)</script>'
      }
    />,
  );
  expect(screen.getByAltText('A gopher').getAttribute('src')).toBe(
    'https://assets.gopheratlas.com/gopher.png',
  );
  expect(screen.getByRole('link', { name: 'Go' }).getAttribute('rel')).toBe(
    'noopener noreferrer',
  );
  expect(container.querySelector('[href^="javascript:"]')).toBeNull();
  expect(container.querySelector('script')).toBeNull();
});
it('reports H1, HTML, unsafe URL, image, alt and frontmatter without rewriting', () => {
  render(
    <MarkdownFeedback
      source={
        '---\ntitle: x\n---\n# H1\n<div>x</div>\n\n[x](javascript:bad)\n\n![](https://third-party.example/a.png)'
      }
    />,
  );
  for (const text of [
    /不支持一级标题/,
    /不支持原始 HTML/,
    /URL 不安全/,
    /不允许外部图片/,
    /图片必须有替代文本/,
    /不支持文档头部元数据/,
  ])
    expect(screen.getByText(text)).toBeTruthy();
});
it('offers Source Preview Split with no H1 or image upload command', () => {
  const { container } = render(
    <MarkdownEditor value="## Safe" onChange={() => {}} />,
  );
  expect(screen.getByLabelText('Markdown 源码')).toBeTruthy();
  expect(screen.queryByLabelText('Markdown 预览')).toBeNull();
  fireEvent.click(screen.getByRole('tab', { name: '预览' }));
  expect(screen.queryByLabelText('Markdown 源码')).toBeNull();
  expect(screen.getByLabelText('Markdown 预览')).toBeTruthy();
  fireEvent.click(screen.getByRole('tab', { name: '分栏' }));
  expect(screen.getByLabelText('Markdown 源码')).toBeTruthy();
  expect(screen.getByLabelText('Markdown 预览')).toBeTruthy();
  expect(container.querySelector('[data-name="title1"]')).toBeNull();
  expect(
    screen.queryByRole('button', {
      name: /上传图片|一级标题|H1|image|upload|heading 1|title 1/i,
    }),
  ).toBeNull();
});
