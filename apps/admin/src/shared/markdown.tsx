import { memo, useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  isControlledImage,
  isSafeLink,
  validateMarkdown,
} from '@gopheratlas/markdown';
export function useDebounced<T>(value: T, delay = 200) {
  const [stable, setStable] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setStable(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return stable;
}
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
                Image blocked — only assets.gopheratlas.com images with alt text
                are allowed.
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
                {children} (unsafe link blocked)
              </span>
            ),
          h1: ({ children }) => (
            <p className="markdown-warning">H1 forbidden: {children}</p>
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
});
const explanations: Record<string, string> = {
  body_h1: 'H1 forbidden — use H2 or H3.',
  raw_html: 'Raw HTML / MDX is forbidden.',
  unsafe_url: 'Unsafe URL.',
  external_image: 'External image is forbidden.',
  missing_alt: 'Image alt text is required.',
  frontmatter: 'Frontmatter is forbidden.',
};
export function MarkdownFeedback({ source }: { source: string }) {
  const stable = useDebounced(source);
  const issues = useMemo(() => validateMarkdown(stable), [stable]);
  const bytes = new TextEncoder().encode(stable).length;
  return (
    <div className="markdown-feedback" aria-live="polite">
      {bytes > 524288 && (
        <p className="error-message">Markdown exceeds 512 KiB.</p>
      )}
      {issues.length > 0 && (
        <ul>
          {issues.slice(0, 12).map((issue, index) => (
            <li key={index}>
              {explanations[issue.code] ?? issue.code}
              {issue.line ? ` · line ${issue.line}` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
