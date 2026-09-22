import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { render, configure } from '@testing-library/react';
import { vi } from 'vitest';
import { routes } from '@/app/routes';
import type { Schema } from '@/shared/api';
// Lazy feature modules can take longer on a cold Windows filesystem.
configure({ asyncUtilTimeout: 4000 });
export const author: Schema<'AuthorSummary'> = {
  userId: 1,
  slug: 'test-author',
  displayName: 'Test Author',
  avatarUrl: '',
};
export function me(role: Schema<'User'>['role'] = 'editor'): Schema<'Me'> {
  return {
    user: {
      id: 1,
      githubUserId: 1,
      githubLogin: 'test-author',
      role,
      status: 'active',
      createdAt: 1,
      updatedAt: 1,
      lastLoginAt: 1,
    },
    profile: {
      slug: author.slug,
      displayName: author.displayName,
      avatarUrl: '',
      bioMarkdown: '',
      websiteUrl: '',
    },
    permissions: {
      uploadAssets: true,
      manageAssets: role === 'admin',
      manageUsers: role === 'admin',
      manageAuthorProfiles: role === 'admin',
      editOwnProfile: true,
      review: role !== 'editor',
      publish: role !== 'editor',
      manageTaxonomy: role === 'admin',
      retryBuild: role !== 'editor',
      viewAudit: role !== 'editor',
      viewMonitor: role === 'admin',
      createTopic: role === 'admin',
    },
  };
}
export const noActions: Schema<'ContentActions'> = {
  editDraft: false,
  submitReview: false,
  withdrawReview: false,
  directPublish: false,
  unpublish: false,
  archive: false,
  restoreArchive: false,
  restoreRevision: false,
  assignByline: false,
  setFeatured: false,
};
export function content(
  type: Schema<'ContentType'> = 'post',
  admin = false,
): Schema<'Content'> {
  const draft: Schema<'Draft'> = {
    coverAssetId: null,
    coverAsset: null,
    version: 5,
    title: 'A useful post',
    slug: 'useful-post',
    summary: 'A summary',
    bodyMarkdown: '## Body\nOriginal text.',
    bylineUserId: 1,
    language: 'en',
    featured: false,
    seoTitle: '',
    seoDescription: '',
    payload:
      type === 'note'
        ? {
            group: 'Runtime',
            groupSlug: 'runtime',
            groupDescription: '',
            groupOrder: 0,
            order: 0,
          }
        : type === 'topic'
          ? { order: 0, recommendedCount: 0 }
          : type === 'curated_article'
            ? {
                sourceUrl: 'https://example.com/source',
                originalUrl: '',
                sourceAuthor: '',
                sourceName: '',
                sourcePublishedAt: '',
                sourceLanguage: '',
                difficulty: 'intermediate',
                rating: 'A+',
                mustRead: false,
                relatedLinks: [],
              }
            : {},
    tagIds: [],
    topicEntries: [],
    payloadSchemaVersion: 1,
    updatedBy: 1,
    updatedAt: 1,
    tags: [],
    topicTargets: [],
  };
  return {
    id: 1,
    type,
    ownerUserId: 1,
    editorialState: 'draft',
    pendingReviewRevisionId: null,
    publishedRevisionId: null,
    title: draft.title,
    createdBy: 1,
    createdAt: 1,
    updatedAt: 1,
    firstPublishedAt: null,
    lastPublishedAt: null,
    archivedAt: null,
    actions: {
      ...noActions,
      editDraft: true,
      submitReview: true,
      restoreRevision: true,
      directPublish: admin,
      archive: admin,
      assignByline: admin,
      setFeatured: admin,
    },
    owner: author,
    byline: author,
    publishedRevisionNo: null,
    draft,
    pendingRevision: null,
    routes: [],
    nextRouteCursor: null,
    latestReview: null,
  };
}
export function revision(c: Schema<'Content'>, no = 1): Schema<'Revision'> {
  const d = c.draft!;
  return {
    id: 42,
    contentId: c.id,
    revisionNo: no,
    coverAssetId: d.coverAssetId,
    coverAsset: d.coverAsset,
    title: d.title,
    slug: d.slug,
    summary: d.summary,
    bodyMarkdown: d.bodyMarkdown,
    bylineUserId: d.bylineUserId,
    language: d.language,
    featured: d.featured,
    seoTitle: d.seoTitle,
    seoDescription: d.seoDescription,
    payload: d.payload,
    tagIds: d.tagIds,
    topicEntries: d.topicEntries,
    payloadSchemaVersion: 1,
    createdBy: 1,
    createdAt: 1,
    pending: true,
    published: false,
    review: null,
    creator: author,
    byline: author,
    restoreDraft: true,
    tags: d.tags,
    topicTargets: d.topicTargets,
  };
}
export const failure = (code: string, status = 409) =>
  Response.json(
    { error: { code, message: 'Request failed.', requestId: 'test-request' } },
    { status },
  );
export function backend(initial = content(), identity = me()) {
  const state = {
    content: structuredClone(initial),
    requests: [] as Request[],
    saveFailure: '',
    submitFailure: '',
    restoreFailure: '',
    heldSave: null as null | (() => Promise<void>),
    history: [] as Schema<'RevisionSummary'>[],
    reviewDetail: null as Schema<'ReviewDetail'> | null,
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const request = input as Request;
      state.requests.push(request);
      const url = new URL(request.url);
      const path = url.pathname;
      if (path === '/api/admin/v1/me') return Response.json(identity);
      if (path === '/readyz') return Response.json({ status: 'ok' });
      if (path === '/api/admin/v1/content' && request.method === 'POST')
        return Response.json(state.content, { status: 201 });
      if (path === '/api/admin/v1/content' && request.method === 'GET')
        return Response.json({ items: [state.content], nextCursor: null });
      if (path === '/api/admin/v1/content/1')
        return Response.json(state.content);
      if (path.endsWith('/draft')) {
        if (state.heldSave) await state.heldSave();
        if (state.saveFailure) return failure(state.saveFailure);
        const input = await request.clone().json();
        if (input.version !== state.content.draft!.version)
          return failure('content_version_conflict');
        state.content.draft = {
          ...state.content.draft!,
          ...input,
          version: input.version + 1,
          updatedAt: Date.now(),
        };
        state.content.title = input.title;
        if (state.content.editorialState === 'synced')
          state.content.editorialState = 'draft';
        return Response.json(state.content.draft);
      }
      if (path.endsWith('/actions/submit-review')) {
        if (state.submitFailure) return failure(state.submitFailure);
        const input = await request.clone().json();
        if (input.version !== state.content.draft!.version)
          return failure('content_version_conflict');
        state.content.pendingRevision = revision(state.content);
        state.content.pendingReviewRevisionId = 42;
        state.content.editorialState = 'in_review';
        state.content.actions = { ...noActions, withdrawReview: true };
        return Response.json(state.content);
      }
      if (path.endsWith('/actions/withdraw-review')) {
        state.content.editorialState = 'draft';
        state.content.pendingRevision = null;
        state.content.pendingReviewRevisionId = null;
        state.content.actions = {
          ...noActions,
          editDraft: true,
          submitReview: true,
          restoreRevision: true,
        };
        return Response.json(state.content);
      }
      if (path.endsWith('/actions/restore')) {
        if (state.restoreFailure) return failure(state.restoreFailure);
        state.content.draft!.version++;
        return Response.json(state.content);
      }
      if (path.includes('/actions/')) return Response.json(state.content);
      if (path.endsWith('/routes'))
        return Response.json({ items: [], nextCursor: null });
      if (path.endsWith('/revisions'))
        return Response.json({ items: state.history, nextCursor: null });
      if (/\/revisions\/\d+$/.test(path))
        return Response.json(revision(state.content));
      if (
        path.endsWith('/review') ||
        /^\/api\/admin\/v1\/reviews\/\d+$/.test(path)
      )
        return state.reviewDetail
          ? Response.json(state.reviewDetail)
          : failure('not_found', 404);
      if (path === '/api/admin/v1/reviews')
        return Response.json({ items: [], nextCursor: null });
      if (path === '/api/admin/v1/tags')
        return Response.json({
          items: [
            {
              id: 1,
              name: 'Go',
              slug: 'go',
              description: '',
              createdBy: 1,
              createdAt: 1,
              updatedAt: 1,
            },
          ],
          nextCursor: null,
        });
      if (path === '/api/admin/v1/authors')
        return Response.json({ items: [author], nextCursor: null });
      return failure('not_found', 404);
    }),
  );
  return state;
}
export function mount(path = '/content/1') {
  const cache = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return {
    ...render(
      <QueryClientProvider client={cache}>
        <RouterProvider useTransitions={false} router={router} />
      </QueryClientProvider>,
    ),
    cache,
    router,
  };
}
