// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { backend, content, me, mount } from './fixtures';
import { contentListQuery } from '@/features/content/list-filters';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function listBackend(mode: 'rows' | 'empty' | 'failed' = 'rows') {
  const state = backend(content('note', true), me('admin'));
  const original = globalThis.fetch;
  const calls: URL[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const request = input as Request;
      const url = new URL(request.url);
      if (url.pathname !== '/api/admin/v1/content' || request.method !== 'GET')
        return original(input);
      calls.push(url);
      if (mode === 'failed')
        return Response.json(
          {
            error: {
              code: 'dependency_unavailable',
              message: 'Unavailable',
              requestId: 'test',
            },
          },
          { status: 503 },
        );
      const second = url.searchParams.has('cursor');
      return Response.json({
        items:
          mode === 'empty'
            ? []
            : [
                {
                  ...state.content,
                  id: second ? 102 : 101,
                  title: second ? '第二页随笔' : '第一页随笔',
                },
              ],
        nextCursor: mode === 'rows' && !second ? 101 : null,
        nextPageCursor: mode === 'rows' && !second ? 'opaque-position' : null,
      });
    }),
  );
  return calls;
}
it('sends restored filters to the server, follows opaque pages and resets on URL/history changes', async () => {
  const calls = listBackend();
  const { router } = mount(
    '/content?type=note&group=runtime&tag=9&language=en&state=draft&published=no&sort=updated_asc&owner=1&archived=true',
  );
  await screen.findByRole('link', { name: '第一页随笔' });
  expect(
    screen.queryByText(/仅作用于已加载|作用于已加载内容|发布状态仅筛选/),
  ).toBeNull();
  expect(calls[0].searchParams.get('groupSlug')).toBe('runtime');
  expect(calls[0].searchParams.get('tagId')).toBe('9');
  expect(calls[0].searchParams.get('published')).toBe('no');
  expect(calls[0].searchParams.get('sort')).toBe('updated_asc');
  expect(calls[0].searchParams.get('ownerUserId')).toBe('1');
  expect(calls[0].searchParams.get('includeArchived')).toBe('true');
  expect(
    screen
      .getByRole('button', { name: '高级筛选 (6)' })
      .getAttribute('aria-expanded'),
  ).toBe('true');
  const table = screen.getByRole('region', { name: '内容列表' });
  expect(table.tabIndex).toBe(0);
  fireEvent.click(
    within(screen.getByRole('main')).getByRole('button', { name: '加载更多' }),
  );
  await screen.findByRole('link', { name: '第二页随笔' });
  expect(calls.at(-1)!.searchParams.get('cursor')).toBe('opaque-position');
  expect(calls.at(-1)!.searchParams.has('after')).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: '清空筛选' }));
  await waitFor(() => expect(router.state.location.search).toBe('?type=note'));
  await waitFor(() =>
    expect(calls.at(-1)!.searchParams.has('groupSlug')).toBe(false),
  );
  expect(calls.at(-1)!.searchParams.has('cursor')).toBe(false);
  expect(screen.queryByRole('link', { name: '第二页随笔' })).toBeNull();
  await act(() => router.navigate(-1));
  await waitFor(() =>
    expect(screen.getByLabelText('内容语言').getAttribute('value')).toBe('en'),
  );
  await act(() => router.navigate(1));
  expect(screen.queryByLabelText('内容语言')).toBeNull();
});
it('presents only applicable advanced filters and removes incompatible type filters', async () => {
  listBackend();
  const { router } = mount(
    '/content?type=curated_article&rating=A&difficulty=beginner&topic=5&sourceLanguage=en',
  );
  await screen.findByRole('link', { name: '第一页随笔' });
  expect(screen.getByRole('combobox', { name: '评级筛选' })).toBeTruthy();
  fireEvent.click(screen.getByRole('combobox', { name: '内容类型' }));
  const choice = await screen.findByRole('option', { name: '学习随笔' });
  fireEvent.pointerDown(choice, { pointerType: 'mouse' });
  fireEvent.click(choice);
  await waitFor(() =>
    expect(router.state.location.search).toContain('type=note'),
  );
  for (const key of ['rating', 'difficulty', 'topic', 'sourceLanguage'])
    expect(new URLSearchParams(router.state.location.search).has(key)).toBe(
      false,
    );
  fireEvent.click(screen.getByRole('button', { name: '高级筛选' }));
  expect(screen.getByRole('combobox', { name: '分组筛选' })).toBeTruthy();
  expect(screen.queryByRole('combobox', { name: '评级筛选' })).toBeNull();
  expect(screen.queryByRole('combobox', { name: '话题筛选' })).toBeNull();
});
it.each([
  ['empty', '/content?type=note', '还没有内容'],
  ['empty', '/content?type=note&q=missing', '没有匹配的内容'],
  ['failed', '/content?type=note', '内容加载失败'],
] as const)('distinguishes %s at %s', async (mode, path, title) => {
  listBackend(mode);
  mount(path);
  expect(await screen.findByRole('heading', { name: title })).toBeTruthy();
  if (mode === 'failed') {
    expect(screen.getByRole('button', { name: '重新加载' })).toBeTruthy();
    expect(
      screen.queryByRole('heading', { name: '没有匹配的内容' }),
    ).toBeNull();
  }
});
it('maps bilingual search and curated fields without introducing local sorting or unrelated filters', () => {
  const query = contentListQuery(
    new URLSearchParams(
      'type=curated_article&q=English&rating=S%2B&sourceLanguage=en&language=zh-CN&group=ignored',
    ),
  );
  expect(query).toMatchObject({
    q: 'English',
    rating: 'S+',
    sourceLanguage: 'en',
    language: 'zh-CN',
    sort: 'updated_desc',
    groupSlug: undefined,
  });
  expect(
    contentListQuery(new URLSearchParams('type=topic&tag=8&rating=A')).tagId,
  ).toBeUndefined();
});
