import type { Content, ContentType, Snapshot } from './types.ts';

// Code-point ordering is reproducible across Node/ICU versions and host locales.
export const compareText = (a: string, b: string) =>
  a < b ? -1 : a > b ? 1 : 0;
export const recent = (a: Content, b: Content) =>
  b.lastPublishedAt - a.lastPublishedAt || b.id - a.id;
export const featuredRecent = (a: Content, b: Content) =>
  Number(b.featured) - Number(a.featured) || recent(a, b);
const titled = (a: Content, b: Content) =>
  compareText(a.title, b.title) || a.id - b.id;
export function ordered(a: Content, b: Content) {
  if (a.type === 'note' && b.type === 'note')
    return (
      compareText(a.payload.groupSlug, b.payload.groupSlug) ||
      a.payload.order - b.payload.order ||
      titled(a, b)
    );
  if (a.type === 'topic' && b.type === 'topic')
    return a.payload.order - b.payload.order || titled(a, b);
  return featuredRecent(a, b);
}
export function required<T>(map: Map<number, T>, id: number): T {
  const value = map.get(id);
  if (!value) throw new Error('public_reference_missing');
  return value;
}
function index<T extends { id: number }>(values: T[]) {
  const map = new Map(values.map((value) => [value.id, value]));
  if (map.size !== values.length) throw new Error('public_identity_conflict');
  return map;
}
function checkSlugs(values: { slug: string }[]) {
  if (new Set(values.map((value) => value.slug)).size !== values.length)
    throw new Error('public_slug_conflict');
}
function append<K>(map: Map<K, Content[]>, key: K, content: Content) {
  const list = map.get(key);
  if (list) list.push(content);
  else map.set(key, [content]);
}

/** Build once from an already schema-validated snapshot. All references are strict. */
export function createPublication(snapshot: Snapshot) {
  const contentById = index(snapshot.content);
  const authorById = index(snapshot.authors);
  const assetById = index(snapshot.assets);
  const tagById = index(snapshot.tags);
  checkSlugs(snapshot.authors);
  checkSlugs(snapshot.tags);
  const contentByType = new Map<ContentType, Content[]>(
    ['post', 'note', 'curated_article', 'topic'].map((type) => [
      type as ContentType,
      [],
    ]),
  );
  const contentByAuthor = new Map<number, Content[]>();
  const contentByTag = new Map<number, Content[]>();
  const notesByGroup = new Map<
    string,
    { slug: string; name: string; content: Content[] }
  >();
  const canonicalRouteByContentId = new Map<number, string>();
  const paths = new Set<string>();
  for (const route of snapshot.routes) {
    const item = required(contentById, route.contentId);
    if (paths.has(route.path)) throw new Error('public_route_conflict');
    paths.add(route.path);
    if (route.kind === 'canonical') {
      if (
        canonicalRouteByContentId.has(item.id) ||
        route.path !== item.canonicalPath
      )
        throw new Error('public_route_conflict');
      canonicalRouteByContentId.set(item.id, route.path);
    }
  }
  // Every collection gets a deterministic order without repeating full-snapshot scans.
  for (const item of [...snapshot.content].sort(featuredRecent)) {
    required(authorById, item.authorId);
    if (!canonicalRouteByContentId.has(item.id))
      throw new Error('public_canonical_missing');
    if (item.coverAssetId !== null) required(assetById, item.coverAssetId);
    append(contentByType, item.type, item);
    append(contentByAuthor, item.authorId, item);
    for (const id of item.tagIds) {
      required(tagById, id);
      append(contentByTag, id, item);
    }
    if (item.type === 'note') {
      const group = notesByGroup.get(item.payload.groupSlug);
      if (group && group.name !== item.payload.group)
        throw new Error('public_note_group_conflict');
      if (group) group.content.push(item);
      else
        notesByGroup.set(item.payload.groupSlug, {
          slug: item.payload.groupSlug,
          name: item.payload.group,
          content: [item],
        });
    }
  }
  for (const rows of contentByType.values()) rows.sort(ordered);
  for (const group of notesByGroup.values()) group.content.sort(ordered);
  const topicTargets = new Map<
    number,
    { position: number; content: Content }[]
  >();
  for (const item of snapshot.content) {
    if (item.type !== 'topic') continue;
    const positions = new Set<number>(),
      targets = new Set<number>();
    topicTargets.set(
      item.id,
      [...item.topicEntries]
        .sort((a, b) => a.position - b.position)
        .map((entry) => {
          if (
            entry.targetContentId === item.id ||
            positions.has(entry.position) ||
            targets.has(entry.targetContentId)
          )
            throw new Error('public_topic_invalid');
          positions.add(entry.position);
          targets.add(entry.targetContentId);
          return {
            position: entry.position,
            content: required(contentById, entry.targetContentId),
          };
        }),
    );
  }
  return {
    snapshot,
    contentById,
    authorById,
    assetById,
    tagById,
    canonicalRouteByContentId,
    contentByType,
    contentByAuthor,
    contentByTag,
    topicTargets,
    notesByGroup,
    groups: [...notesByGroup.values()].sort((a, b) =>
      compareText(a.slug, b.slug),
    ),
    authors: [...snapshot.authors].sort(
      (a, b) => compareText(a.displayName, b.displayName) || a.id - b.id,
    ),
    tags: [...snapshot.tags].sort(
      (a, b) => compareText(a.name, b.name) || a.id - b.id,
    ),
    feed: snapshot.content.filter((item) => item.type !== 'topic').sort(recent),
    highlights(type: ContentType, limit = 3) {
      return [...(contentByType.get(type) ?? [])]
        .sort(featuredRecent)
        .slice(0, limit);
    },
  };
}
export type Publication = ReturnType<typeof createPublication>;
export const typeInfo: Record<
  ContentType,
  { title: string; path: string; description: string }
> = {
  curated_article: {
    title: '精选阅读',
    path: '/articles/',
    description: '值得反复阅读的文章，以及推荐它们的理由。',
  },
  post: {
    title: '原创文章',
    path: '/posts/',
    description: '从具体问题出发，理解 Go 的设计与实践。',
  },
  note: {
    title: '工程笔记',
    path: '/notes/',
    description: '记录实验、排查与学习中逐渐清晰的认识。',
  },
  topic: {
    title: '知识专题',
    path: '/topics/',
    description: '把零散的知识连接成有序的阅读路径。',
  },
};
export const seo = (item: Content) => ({
  title: item.seoTitle.trim() || item.title,
  description: item.seoDescription.trim() || item.summary,
});
export function dateLabel(ms: number) {
  const date = new Date(ms);
  if (!Number.isFinite(date.valueOf())) throw new Error('public_date_invalid');
  return date.toISOString().slice(0, 10);
}
