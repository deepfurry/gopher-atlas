// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { backend, content, me, mount, revision, noActions } from './fixtures';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const title = () => screen.findByLabelText('标题', {}, { timeout: 4000 });
it.each(['editor', 'reviewer', 'admin'] as const)(
  'creates allowed types for %s and navigates immediately to the editor',
  async (role) => {
    const state = backend(content('post', role === 'admin'), me(role));
    mount('/content');
    fireEvent.click(
      (await screen.findAllByRole('button', { name: '新建内容' }))[0],
    );
    const menu = await screen.findByRole('menu');
    expect(
      within(menu).queryByRole('menuitem', { name: '新建话题专区' }) !== null,
    ).toBe(role === 'admin');
    fireEvent.click(
      within(menu).getByRole('menuitem', { name: '新建学习随笔' }),
    );
    await title();
    expect(
      state.requests.some(
        (r) =>
          r.method === 'POST' &&
          new URL(r.url).pathname === '/api/admin/v1/content',
      ),
    ).toBe(true);
  },
);
it.each(['post', 'note', 'curated_article', 'topic'] as const)(
  'renders typed %s fields without raw JSON or accidental permissions',
  async (type) => {
    backend(
      content(type, type === 'topic'),
      me(type === 'topic' ? 'admin' : 'editor'),
    );
    mount();
    await title();
    expect(screen.queryByLabelText(/raw json/i)).toBeNull();
    expect(
      screen.queryByRole('switch', { name: '首页推荐', hidden: true }) !== null,
    ).toBe(type === 'topic');
    if (type !== 'post')
      fireEvent.click(
        screen.getByRole('tab', {
          name: (
            {
              note: '分组',
              curated_article: '原文与策展',
              topic: '文章编排',
            } as const
          )[type as 'note' | 'curated_article' | 'topic'],
        }),
      );
    if (type === 'note') {
      expect(screen.getByLabelText('分组名称')).toBeTruthy();
      expect(screen.getByLabelText('分组路径标识')).toBeTruthy();
      expect(screen.getByLabelText('预览路径').textContent).toContain(
        '/notes/runtime/useful-post/',
      );
    }
    if (type === 'curated_article') {
      expect(
        screen.getByRole('combobox', { name: '难度' }).textContent,
      ).toContain('进阶');
      fireEvent.click(screen.getByRole('button', { name: '添加相关链接' }));
      expect(screen.getByLabelText('链接 1 URL')).toBeTruthy();
    }
    if (type === 'topic') {
      expect(screen.queryByRole('group', { name: '标签' })).toBeNull();
      expect(screen.getByRole('group', { name: '精选文章编排' })).toBeTruthy();
      expect(
        screen.queryByRole('option', { name: 'A useful post' }),
      ).toBeNull();
    } else {
      expect(
        (screen.getByLabelText('署名作者') as HTMLInputElement).readOnly,
      ).toBe(true);
      expect(
        screen.getByRole('group', { name: /标签/, hidden: true }),
      ).toBeTruthy();
    }
  },
);
it.each([{ ctrlKey: true }, { metaKey: true }])(
  'uses the same queue for keyboard save %j',
  async (modifier) => {
    const state = backend();
    mount();
    fireEvent.change(await title(), { target: { value: 'Keyboard saved' } });
    fireEvent.keyDown(window, { key: 's', ...modifier });
    await waitFor(() => expect(state.content.draft?.version).toBe(6));
    const saves = state.requests.filter((r) => r.method === 'PUT');
    expect(saves).toHaveLength(1);
    expect((await saves[0].clone().json()).version).toBe(5);
  },
);
it('flushes pending save before submit and switches to exact immutable read-only Revision', async () => {
  const state = backend();
  mount();
  fireEvent.change(await title(), { target: { value: 'Latest title' } });
  fireEvent.click(screen.getByRole('button', { name: '提交审核' }));
  await screen.findByRole('heading', { name: /版本 1 · Latest title/ });
  const writes = state.requests.filter(
    (r) => r.method === 'PUT' || r.method === 'POST',
  );
  expect(writes.map((r) => new URL(r.url).pathname)).toEqual([
    '/api/admin/v1/content/1/draft',
    '/api/admin/v1/content/1/actions/submit-review',
  ]);
  expect((await writes[1].clone().json()).version).toBe(6);
  expect(screen.queryByLabelText('Markdown 源码')).toBeNull();
  expect(screen.getByRole('button', { name: '撤回审核' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '撤回审核' }));
  await title();
});
it('blocks submit after save failure and preserves local text', async () => {
  const state = backend();
  state.saveFailure = 'invalid_payload';
  mount();
  fireEvent.change(await title(), { target: { value: 'Preserved' } });
  fireEvent.click(screen.getByRole('button', { name: '提交审核' }));
  await screen.findByText(/保存失败，自动保存已暂停/);
  expect(state.requests.some((r) => r.url.includes('submit-review'))).toBe(
    false,
  );
  expect((screen.getByLabelText('标题') as HTMLInputElement).value).toBe(
    'Preserved',
  );
});
it('shows explicit conflict recovery without discarding local Markdown', async () => {
  const state = backend();
  state.saveFailure = 'content_version_conflict';
  mount();
  await title();
  fireEvent.change(screen.getByLabelText('Markdown 源码'), {
    target: { value: '## Local unsaved' },
  });
  fireEvent.keyDown(window, { key: 's', ctrlKey: true });
  await screen.findByRole('heading', {
    name: '另一会话已修改此草稿。',
  });
  expect(
    (screen.getByLabelText('Markdown 源码') as HTMLTextAreaElement).value,
  ).toBe('## Local unsaved');
  expect(screen.getByRole('button', { name: '提交审核' })).toHaveProperty(
    'disabled',
    true,
  );
  fireEvent.click(screen.getByRole('button', { name: '查看本地内容' }));
  expect(
    (screen.getByLabelText('可复制的本地 Markdown') as HTMLTextAreaElement)
      .value,
  ).toBe('## Local unsaved');
  state.saveFailure = '';
  state.content.draft!.version = 9;
  state.content.draft!.bodyMarkdown = '## Server version';
  fireEvent.click(screen.getByRole('button', { name: '重新加载服务器版本' }));
  const dialog = await screen.findByRole('alertdialog');
  fireEvent.click(
    within(dialog).getByRole('button', { name: '重新加载服务器版本' }),
  );
  await waitFor(() =>
    expect(
      (screen.getByLabelText('Markdown 源码') as HTMLTextAreaElement).value,
    ).toBe('## Server version'),
  );
});
it('honors server action projection rather than the account role', async () => {
  const c = content('post', true);
  c.actions = { ...noActions };
  c.pendingRevision = revision(c);
  c.pendingReviewRevisionId = 42;
  c.editorialState = 'in_review';
  const state = backend(c, me('admin'));
  mount();
  await screen.findByRole('heading', { name: /版本 1/ });
  for (const label of [/提交审核/, /更多操作/, /撤回审核/, /^归档$/])
    expect(screen.queryByRole('button', { name: label })).toBeNull();
  fireEvent.keyDown(window, { key: 's', ctrlKey: true });
  expect(state.requests.some((r) => r.method === 'PUT')).toBe(false);
});
it('keeps published status separate when editing the next Draft and shows review feedback', async () => {
  const c = content();
  c.publishedRevisionId = 42;
  c.publishedRevisionNo = 3;
  c.editorialState = 'changes_requested';
  c.latestReview = {
    id: 1,
    contentId: 1,
    revisionId: 43,
    reviewerUserId: 2,
    decision: 'changes_requested',
    commentMarkdown: '## Clarify the example',
    createdAt: 1,
    reviewer: {
      userId: 2,
      slug: 'reviewer',
      displayName: 'Reviewer',
      avatarUrl: '',
    },
    title: c.title,
    revisionNo: 4,
  };
  const state = backend(c);
  mount();
  await title();
  expect(screen.getByText('已在 CMS 发布 · v3')).toBeTruthy();
  expect(
    screen.getByRole('heading', { name: 'Clarify the example' }),
  ).toBeTruthy();
  expect(
    (screen.getByLabelText('Markdown 源码') as HTMLTextAreaElement).value,
  ).not.toContain('Clarify');
  fireEvent.change(screen.getByLabelText('标题'), {
    target: { value: 'Next' },
  });
  fireEvent.keyDown(window, { key: 's', ctrlKey: true });
  await waitFor(() => expect(state.content.draft?.version).toBe(6));
  expect(state.content.publishedRevisionId).toBe(42);
});
it('blocks route navigation with unsaved edits and clears the guard after saving', async () => {
  backend();
  mount();
  fireEvent.change(await title(), { target: { value: 'Unsaved' } });
  fireEvent.click(
    within(screen.getByRole('navigation', { name: '工作台导航' })).getByRole(
      'link',
      { name: '工作台' },
    ),
  );
  const dialog = await screen.findByRole('alertdialog');
  expect(within(dialog).getByText('草稿尚未保存，确定离开？')).toBeTruthy();
  fireEvent.click(within(dialog).getByRole('button', { name: '留在此页' }));
  expect((screen.getByLabelText('标题') as HTMLInputElement).value).toBe(
    'Unsaved',
  );
  fireEvent.keyDown(window, { key: 's', metaKey: true });
  await screen.findByText(/所有修改已保存.*草稿 v6/);
  fireEvent.click(
    within(screen.getByRole('navigation', { name: '工作台导航' })).getByRole(
      'link',
      { name: '工作台' },
    ),
  );
  await screen.findByRole('heading', { name: '工作台' });
  expect(screen.queryByRole('alertdialog')).toBeNull();
});
it('shows revision badges and restores using current Draft version without automatic conflict retry', async () => {
  const state = backend();
  const r = revision(state.content);
  state.history = [
    {
      id: r.id,
      contentId: 1,
      revisionNo: 1,
      title: r.title,
      slug: r.slug,
      bylineUserId: 1,
      createdBy: 1,
      createdAt: 1,
      pending: true,
      published: true,
      creator: r.creator,
      byline: r.byline,
      reviewDecision: 'approved',
    },
  ];
  state.restoreFailure = 'content_version_conflict';
  mount();
  await title();
  fireEvent.click(screen.getByRole('tab', { name: '版本与路径' }));
  fireEvent.click(await screen.findByRole('button', { name: '查看版本 1' }));
  fireEvent.click(
    await screen.findByRole('button', { name: '将版本 1 恢复为草稿' }),
  );
  const dialog = await screen.findByRole('alertdialog');
  fireEvent.click(within(dialog).getByRole('button', { name: '恢复为草稿' }));
  await screen.findByRole('heading', {
    name: '另一会话已修改此草稿。',
  });
  expect(
    screen.getByRole('button', { name: '重新加载服务器版本' }),
  ).toBeTruthy();
  const writes = state.requests.filter((r) =>
    r.url.endsWith('/actions/restore'),
  );
  expect(writes).toHaveLength(1);
  expect((await writes[0].clone().json()).version).toBe(5);
  expect(screen.getAllByText('已在 CMS 发布').length).toBeGreaterThan(0);
});

it('asks before revoking a session with unsaved work and Cancel preserves the Draft', async () => {
  const state = backend();
  mount();
  fireEvent.change(await title(), { target: { value: 'Keep my work' } });
  fireEvent.click(screen.getByRole('button', { name: /账户菜单：/ }));
  fireEvent.click(await screen.findByRole('menuitem', { name: '退出登录' }));
  const dialog = await screen.findByRole('alertdialog');
  expect(
    within(dialog).getByRole('heading', {
      name: '仍有未保存内容，确定退出？',
    }),
  ).toBeTruthy();
  fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
  expect(state.requests.some((r) => r.url.endsWith('/api/auth/logout'))).toBe(
    false,
  );
  expect((screen.getByLabelText('标题') as HTMLInputElement).value).toBe(
    'Keep my work',
  );
});
it('does not silently replace an Admin-assigned byline and offers an explicit self assignment', async () => {
  const c = content();
  c.byline = {
    userId: 2,
    displayName: 'Other author',
    slug: 'other',
    avatarUrl: '',
  };
  c.draft!.bylineUserId = 2;
  const state = backend(c);
  mount();
  await title();
  expect((screen.getByLabelText('署名作者') as HTMLInputElement).value).toBe(
    'Other author',
  );
  expect(state.requests.some((r) => r.method === 'PUT')).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: '使用我的署名' }));
  fireEvent.keyDown(window, { key: 's', ctrlKey: true });
  await waitFor(() => expect(state.content.draft!.bylineUserId).toBe(1));
});
