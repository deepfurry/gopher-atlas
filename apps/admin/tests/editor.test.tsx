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
const title = () => screen.findByLabelText('Title', {}, { timeout: 4000 });
it.each(['editor', 'reviewer', 'admin'] as const)(
  'creates allowed types for %s and navigates immediately to the editor',
  async (role) => {
    const state = backend(content('post', role === 'admin'), me(role));
    mount('/content');
    const select = await screen.findByLabelText('New content type');
    expect(
      within(select).queryByRole('option', { name: 'Topic' }) !== null,
    ).toBe(role === 'admin');
    fireEvent.click(screen.getByRole('button', { name: 'Create content' }));
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
    expect(screen.queryByLabelText('Featured') !== null).toBe(type === 'topic');
    if (type === 'note') {
      expect(screen.getByLabelText('Group')).toBeTruthy();
      expect(screen.getByLabelText('Group slug')).toBeTruthy();
      expect(screen.getByLabelText('Candidate route').textContent).toContain(
        '/notes/runtime/useful-post/',
      );
    }
    if (type === 'curated_article') {
      expect(
        (screen.getByLabelText('Difficulty') as HTMLInputElement).value,
      ).toBe('custom-difficulty');
      fireEvent.click(screen.getByRole('button', { name: 'Add related link' }));
      expect(screen.getByLabelText('Link 1 URL')).toBeTruthy();
    }
    if (type === 'topic') {
      expect(screen.queryByRole('group', { name: 'Tags' })).toBeNull();
      expect(
        screen.getByRole('group', { name: 'Ordered content entries' }),
      ).toBeTruthy();
      expect(
        screen.queryByRole('option', { name: 'A useful post' }),
      ).toBeNull();
    } else {
      expect(
        (screen.getByLabelText('Byline') as HTMLInputElement).readOnly,
      ).toBe(true);
      expect(screen.getByRole('group', { name: 'Tags' })).toBeTruthy();
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
  fireEvent.click(screen.getByRole('button', { name: 'Submit for review' }));
  await screen.findByRole('heading', { name: /Revision 1 · Latest title/ });
  const writes = state.requests.filter(
    (r) => r.method === 'PUT' || r.method === 'POST',
  );
  expect(writes.map((r) => new URL(r.url).pathname)).toEqual([
    '/api/admin/v1/content/1/draft',
    '/api/admin/v1/content/1/actions/submit-review',
  ]);
  expect((await writes[1].clone().json()).version).toBe(6);
  expect(screen.queryByLabelText('Markdown source')).toBeNull();
  expect(screen.getByRole('button', { name: 'Withdraw review' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Withdraw review' }));
  await title();
});
it('blocks submit after save failure and preserves local text', async () => {
  const state = backend();
  state.saveFailure = 'invalid_payload';
  mount();
  fireEvent.change(await title(), { target: { value: 'Preserved' } });
  fireEvent.click(screen.getByRole('button', { name: 'Submit for review' }));
  await screen.findByText(/Save failed · autosave paused/);
  expect(state.requests.some((r) => r.url.includes('submit-review'))).toBe(
    false,
  );
  expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe(
    'Preserved',
  );
});
it('shows explicit conflict recovery without discarding local Markdown', async () => {
  const state = backend();
  state.saveFailure = 'content_version_conflict';
  mount();
  await title();
  fireEvent.change(screen.getByLabelText('Markdown source'), {
    target: { value: '## Local unsaved' },
  });
  fireEvent.keyDown(window, { key: 's', ctrlKey: true });
  await screen.findByRole('heading', {
    name: 'Another session changed this Draft.',
  });
  expect(
    (screen.getByLabelText('Markdown source') as HTMLTextAreaElement).value,
  ).toBe('## Local unsaved');
  expect(
    screen.getByRole('button', { name: 'Submit for review' }),
  ).toHaveProperty('disabled', true);
  fireEvent.click(
    screen.getByRole('button', { name: 'Cancel / inspect local content' }),
  );
  expect(
    (screen.getByLabelText('Local Markdown to copy') as HTMLTextAreaElement)
      .value,
  ).toBe('## Local unsaved');
  state.saveFailure = '';
  state.content.draft!.version = 9;
  state.content.draft!.bodyMarkdown = '## Server version';
  fireEvent.click(
    screen.getByRole('button', { name: 'Reload server version' }),
  );
  const dialog = await screen.findByRole('alertdialog');
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Reload server version' }),
  );
  await waitFor(() =>
    expect(
      (screen.getByLabelText('Markdown source') as HTMLTextAreaElement).value,
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
  await screen.findByRole('heading', { name: /Revision 1/ });
  for (const label of [
    /Submit for review/,
    /Direct publish/,
    /Withdraw review/,
    /^Archive$/,
  ])
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
  expect(screen.getByText('Published in CMS · Revision 3')).toBeTruthy();
  expect(
    screen.getByRole('heading', { name: 'Clarify the example' }),
  ).toBeTruthy();
  expect(
    (screen.getByLabelText('Markdown source') as HTMLTextAreaElement).value,
  ).not.toContain('Clarify');
  fireEvent.change(screen.getByLabelText('Title'), {
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
  fireEvent.click(screen.getByRole('link', { name: 'Overview' }));
  const dialog = await screen.findByRole('alertdialog');
  expect(within(dialog).getByText('Leave unsaved Draft?')).toBeTruthy();
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Stay / inspect' }),
  );
  expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe(
    'Unsaved',
  );
  fireEvent.keyDown(window, { key: 's', metaKey: true });
  await screen.findByText(/All changes saved.*version 6/);
  fireEvent.click(screen.getByRole('link', { name: 'Overview' }));
  await screen.findByRole('heading', { name: 'Overview' });
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
  fireEvent.click(
    await screen.findByRole('button', { name: 'View Revision 1' }),
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Restore Revision 1 to Draft' }),
  );
  const dialog = await screen.findByRole('alertdialog');
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Restore to Draft' }),
  );
  await screen.findByRole('heading', {
    name: 'Another session changed this Draft.',
  });
  expect(
    screen.getByRole('button', { name: 'Reload server version' }),
  ).toBeTruthy();
  const writes = state.requests.filter((r) =>
    r.url.endsWith('/actions/restore'),
  );
  expect(writes).toHaveLength(1);
  expect((await writes[0].clone().json()).version).toBe(5);
  expect(screen.getAllByText('Published in CMS').length).toBeGreaterThan(0);
});

it('asks before revoking a session with unsaved work and Cancel preserves the Draft', async () => {
  const state = backend();
  mount();
  fireEvent.change(await title(), { target: { value: 'Keep my work' } });
  fireEvent.click(screen.getByRole('button', { name: '退出登录' }));
  const dialog = await screen.findByRole('alertdialog');
  expect(
    within(dialog).getByRole('heading', {
      name: 'Log out with unsaved changes?',
    }),
  ).toBeTruthy();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  expect(state.requests.some((r) => r.url.endsWith('/api/auth/logout'))).toBe(
    false,
  );
  expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe(
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
  expect((screen.getByLabelText('Byline') as HTMLInputElement).value).toBe(
    'Other author',
  );
  expect(state.requests.some((r) => r.method === 'PUT')).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Use my byline' }));
  fireEvent.keyDown(window, { key: 's', ctrlKey: true });
  await waitFor(() => expect(state.content.draft!.bylineUserId).toBe(1));
});
