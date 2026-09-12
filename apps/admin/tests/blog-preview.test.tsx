// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { backend, content, author, mount } from './fixtures';
import { previewProjection } from '@/features/content/blog-preview';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const detail = { ...author, bioMarkdown: '', websiteUrl: '' };
it.each(['post', 'note', 'curated_article', 'topic'] as const)(
  'projects the saved %s Draft without identity or published body',
  (type) => {
    const value = content(type, true);
    value.title = 'Old published title';
    value.draft!.title = 'Latest Draft';
    value.draft!.slug = '';
    value.draft!.language = '';
    const before = structuredClone(value),
      output = previewProjection(value, detail);
    expect(output.item.title).toBe('Latest Draft');
    expect(output.item.slug).toBe('preview-1');
    expect(JSON.stringify(output)).not.toMatch(
      /Old published title|ownerUserId|editorialState|githubLogin|permissions|generation/,
    );
    expect(value).toEqual(before);
  },
);
function previewWindow() {
  const popup = {
    document: document.implementation.createHTMLDocument(),
    opener: window,
    closed: false,
    close: vi.fn(),
  };
  vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
  const submit = vi
    .spyOn(HTMLFormElement.prototype, 'submit')
    .mockImplementation(() => {});
  return { popup, submit };
}
it('flushes autosave before preview, reads the latest saved version and never publishes', async () => {
  const state = backend();
  const get = globalThis.fetch;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if ((input as Request).url.endsWith('/authors/1'))
        return Response.json(detail);
      return get(input, init);
    }),
  );
  const { popup, submit } = previewWindow();
  mount();
  fireEvent.change(await screen.findByLabelText('标题'), {
    target: { value: 'Latest autosave title' },
  });
  fireEvent.click(screen.getByRole('button', { name: '博客预览' }));
  await waitFor(() => expect(submit).toHaveBeenCalledOnce());
  const form = popup.document.querySelector('form')!;
  expect(form.method).toBe('post');
  expect(form.action).toBe('http://127.0.0.1:4321/__dev/blog-preview/');
  const data = JSON.parse(popup.document.querySelector('input')!.value);
  expect(data.item.title).toBe('Latest autosave title');
  expect(data.item.revisionNo).toBe(6);
  expect(popup.opener).toBeNull();
  expect(
    state.requests
      .filter((r) => r.method !== 'GET')
      .map((r) => new URL(r.url).pathname),
  ).toEqual(['/api/admin/v1/content/1/draft']);
});
it('blocks preview after a save conflict and keeps local content', async () => {
  const state = backend();
  state.saveFailure = 'content_version_conflict';
  const { popup, submit } = previewWindow();
  mount();
  fireEvent.change(await screen.findByLabelText('标题'), {
    target: { value: 'Keep local title' },
  });
  fireEvent.click(screen.getByRole('button', { name: '博客预览' }));
  await waitFor(() => expect(popup.close).toHaveBeenCalled());
  expect(submit).not.toHaveBeenCalled();
  expect((screen.getByLabelText('标题') as HTMLInputElement).value).toBe(
    'Keep local title',
  );
});
