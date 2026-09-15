// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { backend, content, me, mount, failure } from './fixtures';
import type { Schema } from '@/shared/api';
import { imageMarkdown } from '@/features/assets/editor-assets';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const asset: Schema<'Asset'> = {
  id: 1,
  url: `https://assets.gopheratlas.com/media/sha256/aa/${'a'.repeat(64)}.png`,
  mimeType: 'image/png',
  width: 10,
  height: 20,
  byteSize: 100,
  sha256: 'a'.repeat(64),
  createdAt: 1,
  deletedAt: null,
  actions: { delete: true, restore: false },
};

it('describes a local snapshot without claiming a Cloudflare build or unconfigured pipeline', async () => {
  backend(content('note', true), me('admin'));
  const original = globalThis.fetch;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL((input as Request).url).pathname;
      if (path.endsWith('/publication/status'))
        return Response.json({
          mode: 'local',
          localSnapshotGeneration: 3,
          desiredGeneration: 3,
          pipelineConfigured: true,
          publicMarker: null,
          latestJob: null,
          computedState: 'live',
        });
      if (path.endsWith('/publication/jobs'))
        return Response.json({ items: [], nextCursor: null });
      return original(input);
    }),
  );
  mount('/publication');
  await screen.findByText('最新本地快照已就绪，Public 会自动刷新。');
  expect(screen.getByText('本地快照版本')).toBeTruthy();
  expect(screen.queryByText('公开站点已构建当前 CMS 发布版本。')).toBeNull();
  expect(screen.queryByText(/当前环境未启用发布流水线/)).toBeNull();
});
function fakeAssets(role: Schema<'User'>['role'] = 'editor') {
  const state = backend(content('post', role === 'admin'), me(role)),
    original = globalThis.fetch;
  const requests: Request[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const r = input as Request,
        path = new URL(r.url).pathname;
      if (!path.startsWith('/api/admin/v1/assets')) return original(input);
      requests.push(r);
      if (r.method === 'POST') return Response.json(asset, { status: 201 });
      return Response.json({
        items: [
          { ...asset, actions: { delete: role === 'admin', restore: false } },
        ],
        nextCursor: null,
      });
    }),
  );
  return { state, requests };
}
it('selects cover and inserts required-alt Markdown through the one full-snapshot save', async () => {
  const { state } = fakeAssets();
  mount();
  await screen.findByLabelText('标题', {}, { timeout: 4000 });
  fireEvent.click(screen.getByRole('button', { name: '选择封面' }));
  fireEvent.click(await screen.findByRole('button', { name: '选择素材 1' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: '插入图片' }));
  fireEvent.click(await screen.findByRole('button', { name: '选择素材 1' }));
  const insert = await screen.findByRole('button', {
    name: '插入所选图片',
  });
  expect((insert as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('图片替代文本'), {
    target: { value: 'Go [diagram]' },
  });
  fireEvent.click(insert);
  fireEvent.keyDown(window, { key: 's', ctrlKey: true });
  await waitFor(() => expect(state.content.draft?.version).toBeGreaterThan(5));
  const saves = state.requests.filter((r) => r.method === 'PUT');
  const body = await saves.at(-1)!.clone().json();
  expect(body.coverAssetId).toBe(1);
  expect(body.bodyMarkdown).toContain(`![Go \\[diagram\\]](${asset.url})`);
  expect(body.tagIds).toEqual([]);
  expect(body.payload).toEqual({});
  expect(
    state.requests.some((r) => new URL(r.url).pathname.includes('/cover')),
  ).toBe(false);
});
it('preserves selected local cover on version conflict and never retries silently', async () => {
  const { state } = fakeAssets();
  state.saveFailure = 'content_version_conflict';
  mount();
  await screen.findByLabelText('标题', {}, { timeout: 4000 });
  fireEvent.click(screen.getByRole('button', { name: '选择封面' }));
  fireEvent.click(await screen.findByRole('button', { name: '选择素材 1' }));
  fireEvent.keyDown(window, { key: 's', metaKey: true });
  await screen.findByRole('heading', {
    name: '另一会话已修改此草稿。',
  });
  expect(screen.getByText('素材 1 · 点击图片更换')).toBeTruthy();
  expect(state.content.draft?.coverAssetId).toBeNull();
  expect(state.requests.filter((r) => r.method === 'PUT')).toHaveLength(1);
});
it('uploads using multipart, lists dimensions and limits destructive controls to projected actions', async () => {
  const { requests } = fakeAssets();
  mount('/assets');
  await screen.findByText('素材 1');
  expect(screen.queryByRole('button', { name: /删除素材/ })).toBeNull();
  const input = screen.getByLabelText('选择图片文件');
  fireEvent.change(input, {
    target: {
      files: [
        new File(['synthetic image'], 'local-name.png', { type: 'image/png' }),
      ],
    },
  });
  fireEvent.click(screen.getByRole('button', { name: '上传图片' }));
  await waitFor(() =>
    expect(requests.some((r) => r.method === 'POST')).toBe(true),
  );
  const request = requests.find((r) => r.method === 'POST')!;
  expect(request.headers.get('Content-Type')).toContain('multipart/form-data');
  expect(screen.getByText(/10 × 20/)).toBeTruthy();
});
it('never builds unsafe or missing-alt image Markdown', () => {
  expect(() => imageMarkdown('', asset.url)).toThrow();
  expect(() =>
    imageMarkdown('alt', 'https://external.invalid/image.png'),
  ).toThrow();
  expect(() => imageMarkdown('alt\nsecond', asset.url)).toThrow();
});
it.each(['editor', 'reviewer', 'admin'] as const)(
  'projects publication visibility and retry for %s without rendering unexpected secrets',
  async (role) => {
    backend(content(), me(role));
    const original = globalThis.fetch,
      requests: Request[] = [];
    const job: Schema<'PublicationJob'> = {
      id: 1,
      generation: 3,
      state: 'failed',
      snapshotKey: 'snapshots/generation-3.json',
      snapshotSha256: 'a'.repeat(64),
      attempts: 2,
      lastError: 'build_trigger_failed',
      nextAttemptAt: 1,
      createdAt: 1,
      updatedAt: 1,
      triggeredAt: null,
      retry: true,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const r = input as Request,
          path = new URL(r.url).pathname;
        if (!path.includes('/publication/')) return original(input);
        requests.push(r);
        if (role === 'editor') return failure('permission_denied', 403);
        if (r.method === 'POST')
          return Response.json({
            ...job,
            state: 'snapshot_uploaded',
            retry: false,
          });
        if (path.endsWith('/status'))
          return Response.json({
            desiredGeneration: 3,
            publicMarker: { generation: 2 },
            pipelineConfigured: true,
            latestJob: job,
            computedState: 'pending',
            unexpectedSecret: 'never-render-this-value',
          });
        return Response.json({ items: [job], nextCursor: null });
      }),
    );
    mount('/publication');
    await screen.findByRole('navigation', { name: '工作台导航' });
    const nav = screen.getByRole('navigation', { name: '工作台导航' });
    expect(within(nav).queryByRole('link', { name: '发布状态' }) !== null).toBe(
      role !== 'editor',
    );
    if (role === 'editor') {
      await screen.findByRole('alert');
      expect(requests).toHaveLength(0);
    } else {
      fireEvent.click(
        await screen.findByRole('button', { name: '重试发布版本 3' }),
      );
      await waitFor(() =>
        expect(requests.some((r) => r.method === 'POST')).toBe(true),
      );
      expect(document.body.textContent).not.toContain(
        'never-render-this-value',
      );
    }
  },
);
