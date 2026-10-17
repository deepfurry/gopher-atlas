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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it.each(['tags', 'note-groups'] as const)(
  'edits bilingual %s with permanent slug and no unrelated input fields',
  async (kind) => {
    await import('@/features/tags/page');
    backend(content(), me('admin'));
    const original = globalThis.fetch;
    const row = {
      id: 4,
      name: '技术',
      slug: 'tech',
      description: '中文',
      nameEn: '',
      descriptionEn: '',
      createdAt: 1,
      updatedAt: 1,
      ...(kind === 'tags' ? { createdBy: 1 } : { order: 7 }),
    };
    const writes: Record<string, unknown>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const r = input as Request;
        const url = new URL(r.url);
        if (url.pathname === `/api/admin/v1/${kind}`)
          return Response.json({ items: [row], nextCursor: null });
        if (url.pathname === `/api/admin/v1/${kind}/4` && r.method === 'PUT') {
          const body = await r.clone().json();
          writes.push(body);
          Object.assign(row, body);
          return Response.json(row);
        }
        return original(input);
      }),
    );
    mount(`/${kind}`);
    const label = kind === 'tags' ? '标签' : '随笔分组';
    fireEvent.click(
      await screen.findByRole('button', { name: `编辑${label} 技术` }),
    );
    const dialog = await screen.findByRole('dialog', { name: `编辑${label}` });
    const slug = within(dialog).getByLabelText(/路径标识/) as HTMLInputElement;
    expect(slug.readOnly).toBe(true);
    expect(slug.value).toBe('tech');
    fireEvent.change(within(dialog).getByLabelText('英文名称（可选）'), {
      target: { value: 'Technology' },
    });
    fireEvent.change(within(dialog).getByLabelText('英文描述（可选）'), {
      target: { value: '' },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: `保存${label}` }),
    );
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({
      name: '技术',
      slug: 'tech',
      description: '中文',
      nameEn: 'Technology',
      descriptionEn: '',
      ...(kind === 'tags' ? {} : { order: 7 }),
    });
  },
);

it('denies taxonomy management UI to editors but keeps existing group selection', async () => {
  backend(content('note'), me('editor'));
  mount('/note-groups');
  expect(
    await screen.findByText('当前账户没有执行此操作的权限。'),
  ).toBeTruthy();
  expect(screen.queryByRole('button', { name: '新建随笔分组' })).toBeNull();
});

it('sends group search to the server and resets its page cursor', async () => {
  const state = backend(content(), me('admin'));
  mount('/note-groups');
  fireEvent.change(
    await screen.findByRole('searchbox', { name: '搜索随笔分组' }),
    { target: { value: 'Runtime' } },
  );
  await waitFor(() =>
    expect(
      state.requests.some((r) => {
        const u = new URL(r.url);
        return (
          u.pathname === '/api/admin/v1/note-groups' &&
          u.searchParams.get('q') === 'Runtime' &&
          u.searchParams.get('after') === '0'
        );
      }),
    ).toBe(true),
  );
});
