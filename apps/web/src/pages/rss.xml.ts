import rss from '@astrojs/rss';
import type { APIContext } from 'astro';

export function GET(context: APIContext) {
  return rss({
    title: 'GopherAtlas',
    description: 'Go 技术刊物与知识地图',
    site: context.site!,
    items: [],
  });
}
