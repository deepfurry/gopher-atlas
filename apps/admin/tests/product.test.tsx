// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
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
it('selects authoritative groups and warns before changing a published note group', async () => {
  await import('@/features/content/editor');
  const note = content('note');
  note.publishedRevisionId = 42;
  note.routes = [{ path: '/notes/runtime/existing/', kind: 'canonical' }];
  const state = backend(note, me('admin'));
  mount();
  await screen.findByLabelText('标题');
  expect(screen.getByText(/旧评论不会自动搬迁/)).toBeTruthy();
  expect(screen.queryByLabelText('分组路径标识')).toBeNull();
  expect(screen.queryByLabelText('分组名称')).toBeNull();
  fireEvent.click(screen.getByRole('combobox', { name: '选择已有分组' }));
  expect(await screen.findByRole('option', { name: '运行时' })).toBeTruthy();
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
