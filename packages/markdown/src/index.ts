import type { Root } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified, type Plugin, type PluggableList } from 'unified';
import { visit } from 'unist-util-visit';

export const assetOrigin = 'https://assets.gopheratlas.com';
export type AssetPolicy = Readonly<{ assetBaseURL: string }>;
export function developmentAssetPolicy(base: string): AssetPolicy {
  const url = new URL(base);
  if (
    !isSafeLink(base) ||
    url.protocol !== 'http:' ||
    !url.port ||
    !/^(?:127(?:\.\d{1,3}){3}|localhost|\[::1\])$/u.test(url.hostname) ||
    url.pathname !== '/__dev/assets' ||
    url.search ||
    url.hash ||
    base !== `${url.origin}/__dev/assets`
  )
    throw new Error('invalid_development_asset_origin');
  return Object.freeze({ assetBaseURL: base });
}
export function isAssetURL(value: string, policy?: AssetPolicy): boolean {
  if (policy) {
    try {
      developmentAssetPolicy(policy.assetBaseURL);
    } catch {
      return false;
    }
  }
  const base = policy?.assetBaseURL ?? assetOrigin;
  if (!value.startsWith(`${base}/`)) return false;
  const match =
    /^media\/sha256\/([a-f0-9]{2})\/([a-f0-9]{64})\.(png|jpg|webp|gif)$/u.exec(
      value.slice(base.length + 1),
    );
  return Boolean(match && match[1] === match[2].slice(0, 2));
}
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

export function isControlledImage(
  value: string,
  policy?: AssetPolicy,
): boolean {
  if (policy) {
    // Explicit policies may select only a validated loopback base. Arbitrary
    // caller-supplied origins never relax the default production boundary.
    try {
      developmentAssetPolicy(policy.assetBaseURL);
    } catch {
      return false;
    }
    return isAssetURL(value, policy);
  }
  if (!/^https:\/\//iu.test(value) || !isSafeLink(value)) return false;
  try {
    return new URL(value).origin === assetOrigin;
  } catch {
    return false;
  }
}

function inspect(tree: Root, policy?: AssetPolicy): MarkdownIssue[] {
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
      if (!url || !isControlledImage(url, policy)) report('external_image');
      if (!node.alt?.trim()) report('missing_alt');
    }
  });
  return issues;
}

/** Build-time Astro guard; Admin uses the same validator for feedback plus safe renderers. Never enable rehype-raw. */
export const remarkGuard: Plugin<[AssetPolicy?], Root> =
  (policy) => (tree, file) => {
    const issues = inspect(tree, policy);
    if (/^---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)(?:\r?\n|$)/u.test(String(file)))
      issues.push({ code: 'frontmatter', line: 1 });
    if (issues.length)
      file.fail(
        `Invalid Markdown: ${issues.map((issue) => issue.code).join(', ')}`,
      );
  };

export const remarkPlugins: PluggableList = [remarkGfm, remarkGuard];
export const markdownPlugins = (policy?: AssetPolicy): PluggableList => [
  remarkGfm,
  [remarkGuard, policy],
];

/** The shared non-executing parser; consumers must still apply safety validation. */
export function parseMarkdown(markdown: string): Root {
  return unified().use(remarkParse).use(remarkGfm).parse(markdown);
}

export function validateMarkdown(
  markdown: string,
  policy?: AssetPolicy,
): MarkdownIssue[] {
  const tree = parseMarkdown(markdown);
  const issues = inspect(tree, policy);
  if (/^---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)(?:\r?\n|$)/u.test(markdown))
    issues.push({ code: 'frontmatter', line: 1 });
  return issues;
}
