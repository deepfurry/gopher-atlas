// This module is dynamically imported only behind import.meta.env.DEV.
// It transports a bounded presentation projection, never identity/session data.
import { client, unwrap, APIError, type Schema } from '@/shared/api';
import { getContent } from './api';

export function previewProjection(
  content: Schema<'Content'>,
  author: Schema<'AuthorDetail'>,
  locale: 'zh' | 'en' = 'zh',
) {
  const draft = content.draft;
  if (!draft || !content.actions.editDraft)
    throw new APIError('permission_denied', 'Preview unavailable');
  let payload = structuredClone(draft.payload);
  if (content.type === 'note')
    payload = {
      group: '未设置分组',
      groupSlug: 'preview',
      groupDescription: '',
      groupOrder: 0,
      order: 0,
      ...payload,
      ...('group' in payload && !payload.group ? { group: '未设置分组' } : {}),
      ...('groupSlug' in payload && !payload.groupSlug
        ? { groupSlug: 'preview' }
        : {}),
    };
  if (content.type === 'curated_article')
    payload = {
      sourceUrl: '',
      originalUrl: '',
      sourceAuthor: '',
      sourceName: '',
      sourcePublishedAt: '',
      sourceLanguage: '',
      difficulty: '',
      rating: '',
      mustRead: false,
      relatedLinks: [],
      ...payload,
    };
  if (content.type === 'topic')
    payload = { order: 0, recommendedCount: 0, ...payload };
  const slug = draft.slug || `preview-${content.id}`;
  const prefix =
    content.type === 'note'
      ? `notes/${'groupSlug' in payload ? payload.groupSlug : 'preview'}`
      : { post: 'posts', curated_article: 'articles', topic: 'topics' }[
          content.type
        ];
  const cover = draft.coverAsset;
  const en =
    locale === 'en' &&
    (content.type === 'curated_article' || content.type === 'topic')
      ? draft.editorialEn
      : undefined;
  return {
    locale,
    item: {
      id: content.id,
      type: content.type,
      revisionNo: draft.version,
      canonicalPath: `/${prefix}/${slug}/`,
      title: en
        ? en.title || 'Untitled English draft'
        : draft.title || '未命名内容',
      slug,
      summary: en?.summary ?? draft.summary,
      bodyMarkdown: en?.bodyMarkdown ?? draft.bodyMarkdown,
      authorId: draft.bylineUserId,
      language: en ? 'en' : draft.language || 'zh-CN',
      featured: draft.featured,
      seoTitle: en?.seoTitle ?? draft.seoTitle,
      seoDescription: en?.seoDescription ?? draft.seoDescription,
      coverAssetId: draft.coverAssetId,
      firstPublishedAt: draft.updatedAt,
      lastPublishedAt: draft.updatedAt,
      tagIds: [...draft.tagIds],
      topicEntries: draft.topicEntries.map((entry, i) => ({
        position: i + 1,
        targetContentId: entry.targetContentId,
      })),
      payload,
    },
    author: {
      id: author.userId,
      slug: author.slug,
      displayName: author.displayName,
      bioMarkdown: author.bioMarkdown,
      avatarUrl: author.avatarUrl,
      websiteUrl: author.websiteUrl,
    },
    cover: cover
      ? {
          id: cover.id,
          url: cover.url,
          mimeType: cover.mimeType,
          width: cover.width,
          height: cover.height,
          byteSize: cover.byteSize,
        }
      : null,
    tags: draft.tags.map(({ id, name, slug, description }) => ({
      id,
      name,
      slug,
      description,
    })),
    targets: draft.topicTargets.map(({ id, title }) => ({ id, title })),
  };
}

export async function showSavedBlogPreview(
  id: number,
  preview: Window,
  locale: 'zh' | 'en' = 'zh',
) {
  const content = await getContent(id);
  if (!content.draft)
    throw new APIError('permission_denied', 'Preview unavailable');
  const author = unwrap(
    await client.GET('/api/admin/v1/authors/{id}', {
      params: { path: { id: content.draft.bylineUserId } },
    }),
  );
  const data = JSON.stringify(previewProjection(content, author, locale));
  if (new TextEncoder().encode(data).length > 1024 * 1024)
    throw new APIError('payload_too_large', 'Preview too large');
  if (preview.closed) return;
  // A same-origin about:blank window is opened during the click. Posting from
  // it avoids popup blocking after autosave, URL payloads and browser storage.
  const form = preview.document.createElement('form');
  form.method = 'POST';
  form.action = 'http://127.0.0.1:4321/__dev/blog-preview/';
  const input = preview.document.createElement('input');
  input.type = 'hidden';
  input.name = 'preview';
  input.value = data;
  form.append(input);
  preview.document.body.replaceChildren(form);
  form.submit();
}
