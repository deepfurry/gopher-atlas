import { client, unwrap, type Schema } from '@/shared/api';
export type Content = Schema<'Content'>;
export type Draft = Schema<'Draft'>;
export type Snapshot = Omit<Schema<'DraftInput'>, 'version'>;
export const contentKey = (id: number) => ['content', 'detail', id] as const;
export async function getContent(id: number, signal?: AbortSignal) {
  return unwrap(
    await client.GET('/api/admin/v1/content/{id}', {
      params: { path: { id } },
      signal,
    }),
  );
}
export function snapshot(d: Schema<'DraftInput'>): Snapshot {
  return {
    title: d.title,
    slug: d.slug,
    summary: d.summary,
    bodyMarkdown: d.bodyMarkdown,
    bylineUserId: d.bylineUserId,
    language: d.language,
    featured: d.featured,
    seoTitle: d.seoTitle,
    seoDescription: d.seoDescription,
    payload: structuredClone(d.payload),
    tagIds: [...d.tagIds],
    topicEntries: d.topicEntries.map((e) => ({ ...e })),
  };
}
export async function saveDraft(id: number, value: Snapshot, version: number) {
  return unwrap(
    await client.PUT('/api/admin/v1/content/{id}/draft', {
      params: { path: { id } },
      body: { ...value, version },
    }),
  );
}
export type Action =
  | 'submit-review'
  | 'withdraw-review'
  | 'direct'
  | 'unpublish'
  | 'archive'
  | 'restore-archive';
export async function action(id: number, kind: Action, version = 0) {
  const params = { path: { id } };
  switch (kind) {
    case 'submit-review':
      return unwrap(
        await client.POST('/api/admin/v1/content/{id}/actions/submit-review', {
          params,
          body: { version },
        }),
      );
    case 'direct':
      return unwrap(
        await client.POST('/api/admin/v1/content/{id}/actions/publish', {
          params,
          body: { mode: 'direct', version },
        }),
      );
    case 'withdraw-review':
      return unwrap(
        await client.POST(
          '/api/admin/v1/content/{id}/actions/withdraw-review',
          { params },
        ),
      );
    case 'unpublish':
      return unwrap(
        await client.POST('/api/admin/v1/content/{id}/actions/unpublish', {
          params,
        }),
      );
    case 'archive':
      return unwrap(
        await client.POST('/api/admin/v1/content/{id}/actions/archive', {
          params,
        }),
      );
    case 'restore-archive':
      return unwrap(
        await client.POST(
          '/api/admin/v1/content/{id}/actions/restore-archive',
          { params },
        ),
      );
  }
}
export function routePreview(
  type: Schema<'ContentType'>,
  slug: string,
  payload: Schema<'TypedPayload'>,
) {
  const group = 'groupSlug' in payload ? String(payload.groupSlug ?? '') : '';
  return type === 'note'
    ? `/notes/${group || '<groupSlug>'}/${slug || '<slug>'}/`
    : `/${({ post: 'posts', curated_article: 'articles', topic: 'topics' } as const)[type]}/${slug || '<slug>'}/`;
}
