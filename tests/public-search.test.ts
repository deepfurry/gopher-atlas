// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/dom';
import {
  excerptText,
  mountSearch,
  safeResultURL,
  type SearchAPI,
} from '../apps/web/src/lib/search';
afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
  delete document.documentElement.dataset.locale;
});
it('English search opens the matching chrome alias without duplicating the indexed content', async () => {
  document.documentElement.dataset.locale = 'en';
  const { input, form } = setup(async () => ({
    search: async () => ({
      results: [hit('Source note', '/notes/go/example/')],
    }),
  }));
  fireEvent.input(input, { target: { value: 'Go' } });
  fireEvent.submit(form);
  const link = await screen.findByRole('link', { name: 'Source note' });
  expect(link.getAttribute('href')).toBe('/en/notes/go/example/');
});
function setup(load: () => Promise<SearchAPI>) {
  document.body.innerHTML =
    '<div data-search><form><label for="q">关键词</label><input id="q"><button>搜索</button></form><p role="status"></p><ol data-results></ol><button data-more hidden>加载更多</button></div>';
  mountSearch(document.querySelector('[data-search]')!, load);
  return {
    input: screen.getByLabelText('关键词'),
    form: document.querySelector('form')!,
  };
}
const hit = (title = 'Go result', url = '/articles/fixture-post/') => ({
  data: async () => ({
    url,
    meta: { title },
    plain_excerpt: '&lt;script&gt; text &amp; Go',
  }),
});
it('loads lazily, debounces typing, and renders safe bounded results with more', async () => {
  vi.useFakeTimers();
  const api = {
    search: vi.fn(async () => ({
      results: Array.from({ length: 12 }, (_, i) => hit(`Result ${i}`)),
    })),
  };
  const load = vi.fn(async () => api),
    { input } = setup(load);
  expect(load).not.toHaveBeenCalled();
  fireEvent.input(input, { target: { value: 'g' } });
  await vi.advanceTimersByTimeAsync(200);
  fireEvent.input(input, { target: { value: 'go' } });
  await vi.advanceTimersByTimeAsync(299);
  expect(load).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(api.search).toHaveBeenCalledExactlyOnceWith('go');
  expect(screen.getAllByRole('link')).toHaveLength(10);
  expect(document.querySelector('script')).toBeNull();
  expect(document.querySelector('ol')!.textContent).toContain(
    '<script> text & Go',
  );
  fireEvent.click(screen.getByText('加载更多'));
  await vi.advanceTimersByTimeAsync(0);
  expect(screen.getAllByRole('link')).toHaveLength(12);
  expect(screen.getByRole('status').textContent).toContain('已显示 12');
});
it('supports submit, empty/no-result/error states and explicit retry', async () => {
  const load = vi
    .fn<() => Promise<SearchAPI>>()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({ search: async () => ({ results: [] }) });
  const { input, form } = setup(load);
  fireEvent.submit(form);
  expect(load).not.toHaveBeenCalled();
  fireEvent.input(input, { target: { value: '不存在' } });
  fireEvent.submit(form);
  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toContain('再次搜索重试'),
  );
  fireEvent.submit(form);
  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toContain('没有找到'),
  );
  expect(load).toHaveBeenCalledTimes(2);
});
it('does not let a slow prior search replace a newer result', async () => {
  let finish!: (value: { results: ReturnType<typeof hit>[] }) => void;
  const search = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue({ results: [hit('new result')] });
  const { input, form } = setup(async () => ({ search }));
  fireEvent.input(input, { target: { value: 'old' } });
  fireEvent.submit(form);
  await waitFor(() => expect(search).toHaveBeenCalledOnce());
  fireEvent.input(input, { target: { value: 'new' } });
  fireEvent.submit(form);
  await screen.findByRole('link', { name: 'new result' });
  finish({ results: [hit('old result')] });
  await Promise.resolve();
  await Promise.resolve();
  expect(screen.queryByRole('link', { name: 'old result' })).toBeNull();
});
it('rejects unsafe result URLs and never creates HTML from search metadata', async () => {
  expect(safeResultURL('https://evil.invalid/')).toBe(false);
  expect(safeResultURL('//evil.invalid/')).toBe(false);
  expect(safeResultURL('/posts/compatibility/')).toBe(false);
  expect(safeResultURL('/en/about/')).toBe(true);
  expect(excerptText('&quot;&#60;&#x3e;&amp;')).toBe('"<>&');
  const { input, form } = setup(async () => ({
    search: async () => ({
      results: [hit('<img src=x>', 'javascript:alert(1)')],
    }),
  }));
  fireEvent.input(input, { target: { value: 'go' } });
  fireEvent.submit(form);
  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toContain('再次搜索重试'),
  );
  expect(document.querySelector('img')).toBeNull();
  expect(screen.queryAllByRole('link')).toHaveLength(0);
});
