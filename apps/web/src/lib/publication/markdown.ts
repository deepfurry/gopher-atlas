import {
  createMarkdownProcessor,
  type RemarkPlugins,
} from '@astrojs/markdown-remark';
import { remarkPlugins, validateMarkdown } from '@gopheratlas/markdown';

export const markdownOptions = {
  // Shared list contains plain plugins; Astro narrows Unified's variadic tuple type.
  remarkPlugins: remarkPlugins as RemarkPlugins,
  smartypants: false,
  remarkRehype: { allowDangerousHtml: false },
  shikiConfig: { themes: { light: 'github-light', dark: 'github-dark' } },
} as const;
const processor = createMarkdownProcessor(markdownOptions);
export async function renderMarkdown(source: string) {
  // Validate before Astro's processor; invalid content never reaches HTML handling.
  if (validateMarkdown(source).length)
    throw new Error('public_markdown_invalid');
  // No fileURL/image service config: controlled URLs remain ordinary img elements,
  // with authored alt text. Rendering never fetches an image or an external source.
  return (await processor).render(source);
}
