import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { publication } from '../lib/publication/snapshot';

export function GET(context: APIContext) {
  return rss({
    title: 'GopherAtlas',
    description: 'Go 技术刊物与知识地图',
    site: context.site!,
    items: publication.feed.map((item) => ({
      title: item.title,
      description: item.summary,
      link: item.canonicalPath,
      pubDate: new Date(item.lastPublishedAt),
      categories: item.tagIds.map((id) => publication.tagById.get(id)!.name),
    })),
  });
}
