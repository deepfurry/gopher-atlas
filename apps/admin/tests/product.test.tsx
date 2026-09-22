// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { backend, content, me, mount } from './fixtures';
import { inferGroups } from '@/features/content/note-group';
import { reorderTopic } from '@/features/content/topic-order';
import type { Schema } from '@/shared/api';
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
it('infers shared group metadata without inventing a Group model and flags inconsistency', () => {
  const base = content('note');
  const row = (id: number, groupOrder = 2): Schema<'ContentSummary'> => ({
    ...base,
    id,
    product: {
      summary: '',
      payload: {
        group: '网络安全',
        groupSlug: 'security',
        groupDescription: '学习记录',
        groupOrder,
        order: 1,
      },
      language: 'zh',
      featured: false,
      entryCount: 0,
      tags: [],
      topics: [],
    },
  });
  expect(inferGroups([row(1), row(2)], 99)).toEqual([
    {
      group: '网络安全',
      groupSlug: 'security',
      groupDescription: '学习记录',
      groupOrder: 2,
      conflict: false,
    },
  ]);
  expect(inferGroups([row(1), row(2, 3)], 99)[0].conflict).toBe(true);
  expect(inferGroups([row(1)], 1)).toEqual([]);
});
