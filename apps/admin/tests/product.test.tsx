// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { backend, content, me, mount } from './fixtures';
import { reorderTopic } from '@/features/content/topic-order';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('keeps three product navigation entries and excludes normal Post creation', async () => {
  backend(content('curated_article', true), me('admin'));
  mount('/content');
  const nav = await screen.findByRole('navigation', { name: '工作台导航' });
  for (const label of ['精选文章', '话题专区', '学习随笔'])
    expect(within(nav).getByRole('link', { name: label })).toBeTruthy();
  expect(within(nav).queryByRole('link', { name: '全部内容' })).toBeNull();
  expect(within(nav).queryByRole('link', { name: '兼容内容' })).toBeNull();
  fireEvent.click(screen.getAllByRole('button', { name: '新建内容' })[0]);
  const menu = await screen.findByRole('menu');
  expect(
    within(menu)
      .getAllByRole('menuitem')
      .map((n) => n.textContent),
  ).toEqual(['新建精选文章', '新建话题专区', '新建学习随笔']);
});
it('serializes cross-section drag, keyboard promotion and demotion as one list and boundary', () => {
  const entries = [1, 2, 3].map((targetContentId) => ({ targetContentId }));
  expect(reorderTopic(entries, 1, 2, 1, true)).toEqual({
    entries: [
      { targetContentId: 1 },
      { targetContentId: 3 },
      { targetContentId: 2 },
    ],
    recommendedCount: 2,
  });
  expect(reorderTopic(entries, 1, 0, 2, false)).toEqual({
    entries: [
      { targetContentId: 2 },
      { targetContentId: 3 },
      { targetContentId: 1 },
    ],
    recommendedCount: 0,
  });
  expect(entries.map((e) => e.targetContentId)).toEqual([1, 2, 3]);
});
it('warns only for a changed published group and hides the warning when restored or cleared', async () => {
  await import('@/features/content/editor');
  const note = content('note');
  note.publishedRevisionId = 42;
  note.routes = [{ path: '/notes/runtime/existing/', kind: 'canonical' }];
  const state = backend(note, me('admin'));
  const original = globalThis.fetch;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const response = await original(input);
      if (
        new URL((input as Request).url).pathname !== '/api/admin/v1/note-groups'
      )
        return response;
      const page = await response.json();
      return Response.json({
        ...page,
        items: [
          ...page.items,
          { ...page.items[0], id: 2, slug: 'performance', name: '性能工程' },
        ],
      });
    }),
  );
  mount();
  await screen.findByLabelText('标题');
  const source = screen.getByLabelText('Markdown 源码');
  expect(screen.queryByText(/旧评论不会自动搬迁/)).toBeNull();
  expect(screen.queryByLabelText('分组路径标识')).toBeNull();
  expect(screen.queryByLabelText('分组名称')).toBeNull();
  fireEvent.click(screen.getByRole('combobox', { name: '选择已有分组' }));
  expect(await screen.findByRole('option', { name: '运行时' })).toBeTruthy();
  fireEvent.click(screen.getByRole('option', { name: '性能工程' }));
  expect(screen.getByRole('note').textContent).toContain('旧路径仍保留重定向');
  expect(screen.getByRole('note').textContent).toContain('旧评论不会自动搬迁');
  expect(screen.getByLabelText('预览路径').textContent).toContain(
    '/notes/performance/',
  );
  fireEvent.click(screen.getByRole('combobox', { name: '选择已有分组' }));
  fireEvent.click(await screen.findByRole('option', { name: '运行时' }));
  expect(screen.queryByRole('note')).toBeNull();
  fireEvent.click(screen.getByRole('combobox', { name: '选择已有分组' }));
  fireEvent.click(
    await screen.findByRole('option', { name: '暂不分组（发布前必选）' }),
  );
  expect(screen.queryByRole('note')).toBeNull();
  expect(screen.getByLabelText('Markdown 源码')).toBe(source);
  expect(
    state.requests.some(
      (r) => new URL(r.url).pathname === '/api/admin/v1/note-groups',
    ),
  ).toBe(true);
  expect(
    state.requests.some(
      (r) => new URL(r.url).pathname === '/api/admin/v1/content',
    ),
  ).toBe(false);
});

it.each([
  { published: false, path: '/notes/runtime/existing/', slug: 'performance' },
  { published: true, path: '', slug: 'performance' },
  { published: true, path: '/posts/runtime/existing/', slug: 'performance' },
  {
    published: true,
    path: '/notes/runtime/existing/extra/',
    slug: 'performance',
  },
  { published: true, path: '/notes/bad--group/existing/', slug: 'performance' },
  { published: true, path: '/notes/runtime/existing/', slug: '' },
  { published: true, path: '/notes/runtime/existing/', slug: 'invalid/group' },
  { published: true, path: '/notes/runtime/existing/', slug: 'x'.repeat(101) },
])(
  'does not infer a published group change from invalid or unpublished input %j',
  async ({ published, path, slug }) => {
    const note = content('note');
    note.publishedRevisionId = published ? 42 : null;
    note.routes = path ? [{ path, kind: 'canonical' }] : [];
    note.draft!.payload = {
      ...note.draft!.payload,
      groupSlug: slug,
      group: 'Not the canonical group',
    };
    backend(note);
    mount();
    await screen.findByRole('combobox', { name: '选择已有分组' });
    expect(screen.queryByRole('note')).toBeNull();
  },
);

it('keeps Post tabs, route preview and SEO values without writing fallback text or remounting the editor', async () => {
  const state = backend();
  mount();
  await screen.findByLabelText('标题');
  const source = screen.getByLabelText('Markdown 源码');
  expect(
    within(screen.getByRole('tablist', { name: '属性分组' }))
      .getAllByRole('tab')
      .map((t) => t.textContent),
  ).toEqual(['发布属性', '搜索展示']);
  fireEvent.click(screen.getByRole('tab', { name: '搜索展示' }));
  const seoTitle = screen.getByLabelText('搜索标题') as HTMLInputElement;
  const seoDescription = screen.getByLabelText(
    '搜索描述',
  ) as HTMLTextAreaElement;
  expect(seoTitle.placeholder).toBe('留空则使用文章标题');
  expect(seoDescription.placeholder).toBe('留空则使用文章摘要');
  expect(seoTitle.value).toBe('');
  expect(seoDescription.value).toBe('');
  expect(state.requests.filter((r) => r.method === 'PUT')).toHaveLength(0);
  fireEvent.click(screen.getByRole('tab', { name: '发布属性' }));
  fireEvent.change(screen.getByLabelText('路径标识'), {
    target: { value: 'updated-path' },
  });
  expect(screen.getByLabelText('预览路径').textContent).toBe(
    '/posts/updated-path/',
  );
  fireEvent.keyDown(window, { key: 's', ctrlKey: true });
  await waitFor(() => expect(state.content.draft!.version).toBe(6));
  expect(state.content.draft!.seoTitle).toBe('');
  expect(state.content.draft!.seoDescription).toBe('');
  fireEvent.click(screen.getByRole('tab', { name: '搜索展示' }));
  expect(screen.getByLabelText('搜索标题')).toBe(seoTitle);
  fireEvent.change(seoTitle, { target: { value: 'Custom search title' } });
  fireEvent.change(seoDescription, {
    target: { value: 'Custom search description' },
  });
  fireEvent.click(screen.getByRole('tab', { name: '发布属性' }));
  fireEvent.click(screen.getByRole('tab', { name: '搜索展示' }));
  expect(seoTitle.value).toBe('Custom search title');
  expect(seoDescription.value).toBe('Custom search description');
  expect(screen.getByLabelText('Markdown 源码')).toBe(source);
  fireEvent.keyDown(window, { key: 's', ctrlKey: true });
  await waitFor(() => expect(state.content.draft!.version).toBe(7));
  expect(state.content.draft!.seoTitle).toBe('Custom search title');
  expect(state.content.draft!.seoDescription).toBe('Custom search description');
  fireEvent.change(seoTitle, { target: { value: '' } });
  fireEvent.change(seoDescription, { target: { value: '' } });
  fireEvent.keyDown(window, { key: 's', ctrlKey: true });
  await waitFor(() => expect(state.content.draft!.version).toBe(8));
  const saved = await state.requests
    .filter((r) => r.method === 'PUT')
    .at(-1)!
    .clone()
    .json();
  expect(saved.seoTitle).toBe('');
  expect(saved.seoDescription).toBe('');
});
