import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import schema from '../../../contracts/content-snapshot.schema.json';
import { isSafeLink, validateMarkdown } from '@gopheratlas/markdown';
import type { Author, Asset, Tag, Content } from '../src/lib/publication/types';
import type { Publication } from '../src/lib/publication/indexes';

const definitions = structuredClone(schema.$defs);
// A saved Curated Draft may not have its source URL yet. This relaxed rule is
// local preview only; the published snapshot schema is never modified.
definitions.curated_article.properties.sourceUrl.pattern =
  '^(?:https?://[^\\s]+)?$';
definitions.curated_article.properties.rating.enum.push('');
definitions.curated_article.properties.difficulty.enum.push('');
const ajv = new Ajv2020({ strict: true });
addFormats(ajv);
const validate = ajv.compile({
  type: 'object',
  additionalProperties: false,
  required: ['item', 'author', 'cover', 'tags', 'targets'],
  $defs: definitions,
  properties: {
    item: { $ref: '#/$defs/content' },
    author: { $ref: '#/$defs/author' },
    cover: { anyOf: [{ $ref: '#/$defs/asset' }, { type: 'null' }] },
    tags: { type: 'array', maxItems: 100, items: { $ref: '#/$defs/tag' } },
    targets: {
      type: 'array',
      maxItems: 100,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'title'],
        properties: {
          id: { type: 'integer', minimum: 1 },
          title: { type: 'string', maxLength: 200 },
        },
      },
    },
  },
});
interface Input {
  item: Content;
  author: Author;
  cover: Asset | null;
  tags: Tag[];
  targets: { id: number; title: string }[];
}
export const previewLimit = 3 * 1024 * 1024;
export function parsePreview(value: unknown, base: Publication) {
  if (!validate(value)) throw new Error('preview_invalid');
  const input = value as Input,
    { item, author, cover, tags, targets } = input;
  if (
    item.type === 'topic' &&
    item.payload.recommendedCount > item.topicEntries.length
  )
    throw new Error('preview_invalid');
  if (
    new TextEncoder().encode(item.bodyMarkdown).length > 524288 ||
    validateMarkdown(item.bodyMarkdown).length ||
    validateMarkdown(author.bioMarkdown).length ||
    item.authorId !== author.id ||
    item.coverAssetId !== (cover?.id ?? null) ||
    item.tagIds.length !== tags.length ||
    new Set(tags.map((tag) => tag.id)).size !== tags.length ||
    item.tagIds.some((id) => !tags.some((tag) => tag.id === id)) ||
    new Set(targets.map((target) => target.id)).size !== targets.length ||
    item.topicEntries.length !== targets.length ||
    item.topicEntries.some(
      (entry, i) =>
        entry.position !== i + 1 ||
        entry.targetContentId === item.id ||
        !targets.some((t) => t.id === entry.targetContentId),
    ) ||
    [author.avatarUrl, author.websiteUrl].some((url) => url && !isSafeLink(url))
  )
    throw new Error('preview_invalid');
  if (
    item.type === 'curated_article' &&
    [
      item.payload.sourceUrl,
      item.payload.originalUrl,
      ...item.payload.relatedLinks.map((link) => link.url),
    ].some((url) => url && !isSafeLink(url))
  )
    throw new Error('preview_invalid');
  return {
    item,
    publication: {
      ...base,
      authorById: new Map([...base.authorById, [author.id, author]]),
      assetById: new Map([
        ...base.assetById,
        ...(cover ? [[cover.id, cover] as const] : []),
      ]),
      tagById: new Map([
        ...base.tagById,
        ...tags.map((tag) => [tag.id, tag] as const),
      ]),
    },
    preview: {
      updatedAt: item.lastPublishedAt,
      entries: item.topicEntries.map((entry) => ({
        position: entry.position,
        title: targets.find((target) => target.id === entry.targetContentId)!
          .title,
        content: base.contentById.get(entry.targetContentId),
      })),
    },
  };
}

export async function readPreviewRequest(
  request: Request,
  adminOrigin: string,
) {
  const url = new URL(request.url),
    allowed = new URL(adminOrigin);
  if (
    request.method !== 'POST' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(allowed.hostname) ||
    allowed.protocol !== 'http:' ||
    ![allowed.origin, url.origin].includes(
      request.headers.get('origin') ?? '',
    ) ||
    request.headers.get('content-type')?.split(';')[0] !==
      'application/x-www-form-urlencoded'
  )
    throw new Error('preview_request_forbidden');
  if (
    Number(request.headers.get('content-length')) > previewLimit ||
    !request.body
  )
    throw new Error('preview_too_large');
  const reader = request.body.getReader(),
    chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > previewLimit) throw new Error('preview_too_large');
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const form = new URLSearchParams(new TextDecoder().decode(bytes));
  if ([...form.keys()].join(',') !== 'preview')
    throw new Error('preview_invalid');
  return JSON.parse(form.get('preview')!);
}
