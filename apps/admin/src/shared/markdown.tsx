import { memo, useMemo } from 'react';
import { useDebounced } from '@/hooks/use-debounced';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { isSafeLink } from '@gopheratlas/markdown';
import { isControlledImage, validateMarkdown } from './asset-policy';
export const MarkdownPreview = memo(function MarkdownPreview({
  source,
}: {
  source: string;
}) {
  return (
    <div className="markdown-preview">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={(url, key) =>
          key === 'src'
            ? isControlledImage(url)
              ? url
              : ''
            : isSafeLink(url)
              ? url
              : ''
        }
        components={{
          img: ({ src, alt }) =>
            typeof src === 'string' && isControlledImage(src) && alt?.trim() ? (
              <img
                src={src}
                alt={alt}
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="markdown-warning" role="note">
                已拦截图片：仅允许附有替代文本的当前素材库图片。
              </span>
            ),
          a: ({ href, children }) =>
            href && isSafeLink(href) ? (
              <a
                href={href}
                target={href.startsWith('http') ? '_blank' : undefined}
                rel="noopener noreferrer"
              >
                {children}
              </a>
            ) : (
              <span className="markdown-warning">
                {children} （已拦截不安全链接）
              </span>
            ),
          h1: ({ children }) => (
            <p className="markdown-warning">不支持一级标题： {children}</p>
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
});
const explanations: Record<string, string> = {
  body_h1: '不支持一级标题，请使用二级或三级标题。',
  raw_html: '不支持原始 HTML 或 MDX。',
  unsafe_url: 'URL 不安全。',
  external_image: '不允许外部图片，请从素材库插入。',
  missing_alt: '图片必须有替代文本。',
  frontmatter: '不支持文档头部元数据，请在属性面板填写。',
};
export function MarkdownFeedback({ source }: { source: string }) {
  const stable = useDebounced(source);
  const issues = useMemo(() => validateMarkdown(stable), [stable]);
  const bytes = new TextEncoder().encode(stable).length;
  return (
    <div className="markdown-feedback" aria-live="polite">
      {bytes > 524288 && (
        <p className="error-message">Markdown 超过 512 KiB 限制。</p>
      )}
      {issues.length > 0 && (
        <ul>
          {issues.slice(0, 12).map((issue, index) => (
            <li key={index}>
              {explanations[issue.code] ?? issue.code}
              {issue.line ? ` · 第 ${issue.line} 行` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
