import { compareText, typeInfo, type Publication } from './indexes.ts';
import type { Author, Content, Snapshot, Tag } from './types.ts';
import { chromePaths } from '../i18n.ts';

export const pageSize = 24;
export interface CollectionPage {
  kind: 'collection';
  path: string;
  title: string;
  description: string;
  content: Content[];
  page: number;
  total: number;
  previous?: string;
  next?: string;
  author?: Author;
  tag?: Tag;
}
export type PublicPage =
  CollectionPage | { kind: 'detail'; path: string; content: Content };
export function collectionPages(
  path: string,
  title: string,
  description: string,
  content: Content[],
  extra: { author?: Author; tag?: Tag } = {},
): CollectionPage[] {
  const total = Math.max(1, Math.ceil(content.length / pageSize));
  const at = (page: number) => (page === 1 ? path : `${path}page/${page}/`);
  return Array.from({ length: total }, (_, i) => ({
    kind: 'collection',
    path: at(i + 1),
    title,
    description,
    content: content.slice(i * pageSize, (i + 1) * pageSize),
    page: i + 1,
    total,
    previous: i > 0 ? at(i) : undefined,
    next: i + 1 < total ? at(i + 2) : undefined,
    ...extra,
  }));
}
export function publicPages(p: Publication): PublicPage[] {
  const pages: PublicPage[] = p.snapshot.content.map((content) => ({
    kind: 'detail',
    path: content.canonicalPath,
    content,
  }));
  for (const type of ['curated_article', 'post', 'topic'] as const) {
    const info = typeInfo[type];
    if (type !== 'post') {
      pages.push({
        kind: 'collection',
        path: info.path,
        title: info.title,
        description: info.description,
        content: p.contentByType.get(type)!,
        page: 1,
        total: 1,
      });
      continue;
    }
    pages.push(
      ...collectionPages(
        info.path,
        info.title,
        info.description,
        p.contentByType.get(type)!,
      ),
    );
  }
  for (const group of p.groups)
    pages.push(
      ...collectionPages(
        `/notes/${group.slug}/`,
        group.name,
        `${group.name} 的工程笔记，按阅读顺序整理。`,
        group.content,
      ),
    );
  for (const author of p.authors)
    pages.push(
      ...collectionPages(
        `/authors/${author.slug}/`,
        author.displayName,
        `${author.displayName} 在 GopherAtlas 的写作。`,
        p.contentByAuthor.get(author.id)!,
        { author },
      ),
    );
  for (const tag of p.tags)
    pages.push(
      ...collectionPages(
        `/tags/${tag.slug}/`,
        tag.name,
        tag.description,
        p.contentByTag.get(tag.id)!,
        { tag },
      ),
    );
  const reserved = new Set([
    '/',
    '/about/',
    '/contribute/',
    '/search/',
    '/notes/',
    '/tags/',
    '/authors/',
    '/404/',
    ...chromePaths.map((path) => `/en${path}`),
  ]);
  for (const page of pages) {
    if (reserved.has(page.path)) throw new Error('public_page_conflict');
    reserved.add(page.path);
  }
  // Locale aliases are build-time chrome views, never new canonical identities.
  for (const path of [
    ...pages.map((page) => page.path),
    '/tags/',
    '/authors/',
  ]) {
    if (chromePaths.includes(path)) continue;
    const alias = `/en${path}`;
    if (reserved.has(alias)) throw new Error('public_page_conflict');
    reserved.add(alias);
  }
  for (const route of p.snapshot.routes)
    if (route.kind === 'redirect' && reserved.has(route.path))
      throw new Error('public_page_conflict');
  return pages.sort((a, b) => compareText(a.path, b.path));
}

// Workers Static Assets: 2,000 static rules, 1,000 characters per declaration.
// https://developers.cloudflare.com/workers/static-assets/redirects/
export const staticRedirectLimit = 2000;
export function redirects(snapshot: Snapshot): string {
  const content = new Map(snapshot.content.map((item) => [item.id, item]));
  const paths = new Map(snapshot.routes.map((route) => [route.path, route]));
  if (
    content.size !== snapshot.content.length ||
    paths.size !== snapshot.routes.length
  )
    throw new Error('public_redirect_invalid');
  const rows = snapshot.routes.filter((route) => route.kind === 'redirect');
  if (rows.length > staticRedirectLimit)
    throw new Error('public_redirect_limit');
  const safePath = /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)+$/;
  return rows
    .sort((a, b) => compareText(a.path, b.path))
    .map((route) => {
      const target = content.get(route.contentId)?.canonicalPath;
      const canonical = target && paths.get(target);
      if (
        !target ||
        !safePath.test(route.path) ||
        !safePath.test(target) ||
        route.path === target ||
        !canonical ||
        canonical.kind !== 'canonical' ||
        canonical.contentId !== route.contentId
      )
        throw new Error('public_redirect_invalid');
      const line = `${route.path} ${target} 301`;
      if (line.length > 1000) throw new Error('public_redirect_line_limit');
      return line + '\n';
    })
    .join('');
}
