// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FormProvider, useForm } from 'react-hook-form';
import type { ReactNode } from 'react';
import type { Schema } from '@/shared/api';
import { AssetBrowser } from './browser';
import Assets from './page';
import { CoverField, InsertImage } from './editor-assets';

const permissions = vi.hoisted(() => ({
  uploadAssets: true,
  manageAssets: true,
}));
vi.mock('@/app/context', () => ({ useMe: () => ({ permissions }) }));
vi.mock('@/shared/confirm', () => ({ useConfirm: () => async () => true }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function asset(id: number): Schema<'Asset'> {
  return {
    id,
    url: `https://assets.gopheratlas.com/${id}.png`,
    sha256: id.toString(16).padStart(64, '0'),
    mimeType: 'image/png',
    width: 1,
    height: 1,
    byteSize: 1,
    createdAt: id,
    deletedAt: null,
    actions: { delete: true, restore: false },
  };
}
let rows: Schema<'Asset'>[];
let uploaded: Schema<'Asset'>;
let requests: Array<{ after: number; includeDeleted: boolean }>;
let failNext: boolean;
let holdNext: Promise<void> | undefined;
let cache: QueryClient;
beforeEach(() => {
  rows = [];
  requests = [];
  failNext = false;
  holdNext = undefined;
  permissions.manageAssets = true;
  cache = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (request: Request) => {
      const url = new URL(request.url);
      if (request.method === 'GET') {
        const after = Number(url.searchParams.get('after'));
        const includeDeleted =
          url.searchParams.get('includeDeleted') === 'true';
        requests.push({ after, includeDeleted });
        if (holdNext) {
          const waiting = holdNext;
          holdNext = undefined;
          await waiting;
        }
        if (failNext) {
          failNext = false;
          throw new Error('offline');
        }
        const matching = rows
          .filter(
            (a) =>
              (after === 0 || a.id < after) &&
              (includeDeleted || a.deletedAt === null),
          )
          .sort((a, b) => b.id - a.id);
        return Response.json({
          items: matching.slice(0, 20),
          nextCursor: matching.length > 20 ? matching[19].id : null,
        });
      }
      if (url.pathname === '/api/admin/v1/assets') {
        if (!rows.some((a) => a.id === uploaded.id)) rows.push(uploaded);
        return Response.json(uploaded, { status: 201 });
      }
      const match = /\/assets\/(\d+)\/actions\/(delete|restore)$/.exec(
        url.pathname,
      );
      if (!match)
        throw new Error(`Unexpected request ${request.method} ${url.pathname}`);
      const selected = rows.find((a) => a.id === Number(match[1]))!;
      const deleted = match[2] === 'delete';
      selected.deletedAt = deleted ? 123 : null;
      selected.actions = { delete: !deleted, restore: deleted };
      return Response.json(selected);
    }),
  );
});
afterEach(() => {
  cleanup();
  cache.clear();
  vi.unstubAllGlobals();
});
function seed(count: number) {
  rows = Array.from({ length: count }, (_, i) => asset(i + 1));
}
function show(children: ReactNode = <AssetBrowser />) {
  return render(
    <QueryClientProvider client={cache}>{children}</QueryClientProvider>,
  );
}
function ids() {
  return screen
    .queryAllByRole('button', { name: /^预览素材 / })
    .map((button) => Number(button.getAttribute('aria-label')!.split(' ')[1]));
}
const button = (name: string) =>
  screen.getByRole('button', { name }) as HTMLButtonElement;
async function page(number: number, expected: number[]) {
  await waitFor(() => {
    expect(ids()).toEqual(expected);
    expect(screen.getByText(`第 ${number} 页`)).toBeTruthy();
  });
}
const descending = (high: number, low: number) =>
  Array.from({ length: Math.max(0, high - low + 1) }, (_, i) => high - i);

it.each([0, 1, 19, 20, 21, 40, 41])(
  'shows only the current page for %i assets, with reversible navigation',
  async (count) => {
    seed(count);
    show(<Assets />);
    const pages = Math.max(1, Math.ceil(count / 20));
    for (let index = 0; index < pages; index++) {
      if (index) fireEvent.click(button('下一页'));
      await page(
        index + 1,
        descending(count - index * 20, Math.max(1, count - index * 20 - 19)),
      );
      expect(button('上一页').disabled).toBe(index === 0);
      expect(button('下一页').disabled).toBe(index === pages - 1);
    }
    for (let index = pages - 2; index >= 0; index--) {
      fireEvent.click(button('上一页'));
      await page(
        index + 1,
        descending(count - index * 20, Math.max(1, count - index * 20 - 19)),
      );
    }
    expect(requests.map((r) => r.after)).toEqual(
      Array.from({ length: pages }, (_, i) =>
        i === 0 ? 0 : count - i * 20 + 1,
      ),
    );
    expect(screen.queryByText('加载更多')).toBeNull();
  },
);

it.each([false, true])(
  'returns to a refreshed first page after upload (duplicate=%s)',
  async (duplicate) => {
    seed(41);
    uploaded = duplicate ? rows[0] : asset(42);
    const select = vi.fn();
    show(<AssetBrowser select={select} />);
    await page(1, descending(41, 22));
    fireEvent.click(button('下一页'));
    await page(2, descending(21, 2));
    fireEvent.change(screen.getByLabelText('选择图片文件'), {
      target: {
        files: [new File(['test'], 'test.png', { type: 'image/png' })],
      },
    });
    fireEvent.click(button('上传图片'));
    await page(1, duplicate ? descending(41, 22) : descending(42, 23));
    await waitFor(() => expect(select).toHaveBeenCalledWith(uploaded));
    expect(requests.map((r) => r.after)).toEqual([0, 22, 0]);
    fireEvent.click(button('下一页'));
    await page(2, duplicate ? descending(21, 2) : descending(22, 3));
    expect(requests.at(-1)?.after).toBe(duplicate ? 22 : 23);
  },
);

it('rebuilds cursor boundaries after deleting a middle-page item', async () => {
  seed(41);
  show();
  await page(1, descending(41, 22));
  fireEvent.click(button('下一页'));
  await page(2, descending(21, 2));
  fireEvent.click(button('删除素材 21'));
  await page(2, descending(20, 1));
  await waitFor(() => expect(button('下一页').disabled).toBe(true));
  fireEvent.click(button('上一页'));
  await page(1, descending(41, 22));
  fireEvent.click(button('下一页'));
  await page(2, descending(20, 1));
});

it('moves to the previous valid page when deletion empties the last page; filtering resets to page one and restoration keeps order', async () => {
  seed(21);
  show();
  await page(1, descending(21, 2));
  fireEvent.click(button('下一页'));
  await page(2, [1]);
  fireEvent.click(button('删除素材 1'));
  await page(1, descending(21, 2));
  await waitFor(() => expect(button('下一页').disabled).toBe(true));
  fireEvent.click(screen.getByRole('checkbox', { name: '包含已删除素材' }));
  await waitFor(() => expect(button('下一页').disabled).toBe(false));
  fireEvent.click(button('下一页'));
  await page(2, [1]);
  fireEvent.click(button('恢复素材 1'));
  await waitFor(() => expect(button('删除素材 1').disabled).toBe(false));
  await page(2, [1]);
  fireEvent.click(screen.getByRole('checkbox', { name: '包含已删除素材' }));
  await page(1, descending(21, 2));
  await waitFor(() => expect(button('下一页').disabled).toBe(false));
  fireEvent.click(button('下一页'));
  await page(2, [1]);
});

it('keeps the current page while the next page loads or fails, and permits retry', async () => {
  seed(21);
  show();
  await page(1, descending(21, 2));
  let release!: () => void;
  holdNext = new Promise((resolve) => {
    release = resolve;
  });
  failNext = true;
  fireEvent.click(button('下一页'));
  await waitFor(() => expect(button('下一页').disabled).toBe(true));
  expect(ids()).toEqual(descending(21, 2));
  release();
  await screen.findByRole('alert');
  await page(1, descending(21, 2));
  fireEvent.click(button('下一页'));
  await page(2, [1]);
});

it('shows initial loading and error recovery without claiming the library is empty', async () => {
  seed(1);
  failNext = true;
  show();
  expect(screen.getByText('正在加载素材…')).toBeTruthy();
  await screen.findByRole('alert');
  expect(screen.queryByText('素材库还是空的')).toBeNull();
  fireEvent.click(button('重试'));
  await page(1, [1]);
});

function Cover() {
  const form = useForm({
    defaultValues: { coverAssetId: null as number | null },
  });
  return (
    <FormProvider {...form}>
      <CoverField initial={null} />
    </FormProvider>
  );
}
it.each(['cover', 'body'])(
  'uses the same pagination in the %s image picker',
  async (kind) => {
    seed(21);
    permissions.manageAssets = false;
    show(
      kind === 'cover' ? (
        <Cover />
      ) : (
        <InsertImage capture={() => ({ atEnd: false, insert: () => true })} />
      ),
    );
    fireEvent.click(button(kind === 'cover' ? '选择封面' : '插入图片'));
    await page(1, descending(21, 2));
    expect(
      screen.queryByRole('checkbox', { name: '包含已删除素材' }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: '删除素材 21' })).toBeNull();
    fireEvent.click(button('下一页'));
    await page(2, [1]);
    fireEvent.click(button('选择素材 1'));
    if (kind === 'cover') await screen.findByText('素材 1');
    else await screen.findByLabelText('图片替代文本');
  },
);
