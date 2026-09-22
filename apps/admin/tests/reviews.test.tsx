// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { author, backend, content, me, mount, revision } from './fixtures';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function review() {
  const c = content();
  const state = backend(c, me('reviewer'));
  state.reviewDetail = {
    content: c,
    revision: { ...revision(c), bodyMarkdown: '## IMMUTABLE CANDIDATE' },
    review: null,
    actions: { requestChanges: true, approvePublish: true },
  };
  return state;
}
it('loads only the immutable pending endpoint and confirms the exact Revision', async () => {
  const state = review();
  const { cache } = mount('/reviews/pending/1');
  const invalidation = vi.spyOn(cache, 'invalidateQueries');
  await screen.findByRole('heading', { name: 'IMMUTABLE CANDIDATE' });
  expect(
    state.requests.some(
      (r) => new URL(r.url).pathname === '/api/admin/v1/content/1',
    ),
  ).toBe(false);
  expect(screen.queryByLabelText('Markdown 源码')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '通过并发布到 CMS' }));
  const dialog = await screen.findByRole('alertdialog');
  expect(
    within(dialog).getByRole('heading', { name: '确认通过版本 1？' }),
  ).toBeTruthy();
  fireEvent.click(
    within(dialog).getByRole('button', {
      name: '通过版本 1 并发布到 CMS',
    }),
  );
  await screen.findByRole('heading', { name: '审核已完成' });
  const request = state.requests.find((r) => r.method === 'POST')!;
  expect(await request.clone().json()).toEqual({
    mode: 'reviewed',
    revisionId: 42,
  });
  expect(invalidation).toHaveBeenCalledWith({ queryKey: ['reviews'] });
  expect(invalidation).toHaveBeenCalledWith({ queryKey: ['content'] });
});
it('requires safe Markdown feedback and sends the exact revision ID', async () => {
  const state = review();
  mount('/reviews/pending/1');
  await screen.findByRole('heading', { name: 'IMMUTABLE CANDIDATE' });
  fireEvent.click(screen.getByRole('button', { name: '要求修改' }));
  await screen.findByRole('dialog');
  expect(screen.getByRole('button', { name: '提交修改意见' })).toHaveProperty(
    'disabled',
    true,
  );
  fireEvent.change(screen.getByLabelText('审核意见（必填）'), {
    target: { value: '# Unsafe' },
  });
  fireEvent.click(screen.getByRole('button', { name: '提交修改意见' }));
  await screen.findByRole('alert');
  expect(state.requests.some((r) => r.method === 'POST')).toBe(false);
  fireEvent.change(screen.getByLabelText('审核意见（必填）'), {
    target: { value: '## Clarify the source' },
  });
  fireEvent.click(screen.getByRole('button', { name: '提交修改意见' }));
  await screen.findByRole('heading', { name: '审核已完成' });
  const request = state.requests.find((r) => r.method === 'POST')!;
  expect(await request.clone().json()).toEqual({
    revisionId: 42,
    commentMarkdown: '## Clarify the source',
  });
});
it('opens historical immutable material without a Draft or completed actions', async () => {
  const state = review();
  state.reviewDetail!.actions = {
    requestChanges: false,
    approvePublish: false,
  };
  state.reviewDetail!.review = {
    id: 7,
    contentId: 1,
    revisionId: 42,
    reviewerUserId: 1,
    decision: 'approved',
    commentMarkdown: '',
    createdAt: 1,
    reviewer: author,
    title: 'Historical',
    revisionNo: 1,
  };
  mount('/reviews/history/7');
  await screen.findByRole('heading', { name: 'IMMUTABLE CANDIDATE' });
  expect(state.requests.some((r) => r.url.includes('/reviews/7'))).toBe(true);
  expect(
    state.requests.some(
      (r) => new URL(r.url).pathname === '/api/admin/v1/content/1',
    ),
  ).toBe(false);
  expect(screen.queryByRole('button', { name: '通过并发布到 CMS' })).toBeNull();
});
it('denies Editor review navigation and direct routes without making a review request', async () => {
  const state = backend(content(), me('editor'));
  mount('/reviews/pending/1');
  await screen.findByRole('alert');
  expect(screen.queryByRole('link', { name: '待审核' })).toBeNull();
  await waitFor(() =>
    expect(
      state.requests.filter((r) => r.url.includes('/review')),
    ).toHaveLength(0),
  );
});
