import type { Root } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified, type Plugin, type PluggableList } from 'unified';
import { visit } from 'unist-util-visit';

export const assetOrigin = 'https://assets.gopheratlas.com';
export type MarkdownIssue = { code: string; line?: number };

export function isSafeLink(value: string): boolean {
  // eslint-disable-next-line no-control-regex -- Reject controls before URL parsing can normalize them away.
  if (/[\u0000-\u0020\u007f\\]/u.test(value)) return false;
  if (
    value.startsWith('#') ||
    (value.startsWith('/') && !value.startsWith('//'))
  )
    return true;
  try {
    const url = new URL(value);
    return (
      ['http:', 'https:', 'mailto:'].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export function isControlledImage(value: string): boolean {
  if (!/^https:\/\//iu.test(value) || !isSafeLink(value)) return false;
  try {
    return new URL(value).origin === assetOrigin;
  } catch {
    return false;
  }
}

function inspect(tree: Root): MarkdownIssue[] {
  const issues: MarkdownIssue[] = [];
  const definitions = new Map<string, string>();
  visit(tree, 'definition', (node) => {
    if (!definitions.has(node.identifier))
      definitions.set(node.identifier, node.url);
  });
  visit(tree, (node) => {
    const report = (code: string) =>
      issues.push({ code, line: node.position?.start.line });
    if (node.type === 'heading' && node.depth === 1) report('body_h1');
    if (node.type === 'html') report('raw_html');
    if (
      (node.type === 'link' || node.type === 'definition') &&
      !isSafeLink(node.url)
    )
      report('unsafe_url');
    if (node.type === 'image' || node.type === 'imageReference') {
      const url =
        node.type === 'image' ? node.url : definitions.get(node.identifier);
      if (!url || !isControlledImage(url)) report('external_image');
      if (!node.alt?.trim()) report('missing_alt');
    }
  });
  return issues;
}

/** Build-time Astro guard; Admin uses the same validator for feedback plus safe renderers. Never enable rehype-raw. */
export const remarkGuard: Plugin<[], Root> = () => (tree, file) => {
  const issues = inspect(tree);
  if (/^---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)(?:\r?\n|$)/u.test(String(file)))
    issues.push({ code: 'frontmatter', line: 1 });
  if (issues.length)
    file.fail(
      `Invalid Markdown: ${issues.map((issue) => issue.code).join(', ')}`,
    );
};

export const remarkPlugins: PluggableList = [remarkGfm, remarkGuard];

export function validateMarkdown(markdown: string): MarkdownIssue[] {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown);
  const issues = inspect(tree);
  if (/^---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)(?:\r?\n|$)/u.test(markdown))
    issues.push({ code: 'frontmatter', line: 1 });
  return issues;
}
