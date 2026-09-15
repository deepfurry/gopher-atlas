import {
  createMarkdownProcessor,
  type RemarkPlugins,
  type RehypePlugins,
  type AstroMarkdownOptions,
} from '@astrojs/markdown-remark';
import {
  remarkPlugins,
  markdownPlugins,
  validateMarkdown,
} from '@gopheratlas/markdown';
import { assetPolicy } from './asset-policy';
import { readingEnhancements } from './reading';

export const markdownOptions = {
  // Shared list contains plain plugins; Astro narrows Unified's variadic tuple type.
  remarkPlugins: remarkPlugins as RemarkPlugins,
  smartypants: false,
  remarkRehype: { allowDangerousHtml: false },
  rehypePlugins: [readingEnhancements] as RehypePlugins,
  shikiConfig: {
    themes: { light: 'github-light', dark: 'github-dark' },
    transformers: [
      {
        pre(
          this: { options: { lang: string } },
          node: { properties: Record<string, unknown> },
        ) {
          node.properties['data-language'] = this.options.lang;
        },
      },
    ],
  },
} satisfies AstroMarkdownOptions;
const processor = createMarkdownProcessor({
  ...markdownOptions,
  remarkPlugins: markdownPlugins(assetPolicy) as RemarkPlugins,
});
export async function renderMarkdown(source: string) {
  // Validate before Astro's processor; invalid content never reaches HTML handling.
  if (validateMarkdown(source, assetPolicy).length)
    throw new Error('public_markdown_invalid');
  // No fileURL/image service config: controlled URLs remain ordinary img elements,
  // with authored alt text. Rendering never fetches an image or an external source.
  return (await processor).render(source);
}
