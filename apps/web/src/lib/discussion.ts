export interface DiscussionConfig {
  repo: string;
  repoId: string;
  category: string;
  categoryId: string;
}
export function discussionEnabled(c: DiscussionConfig) {
  return (
    /^[\w.-]+\/[\w.-]+$/.test(c.repo) &&
    /^[\w=-]+$/.test(c.repoId) &&
    !!c.category &&
    /^[\w=-]+$/.test(c.categoryId)
  );
}
export const discussionTerm = (groupSlug: string, slug: string) =>
  `note:${groupSlug}/${slug}`;
export function mountDiscussion(root: HTMLElement) {
  const config = JSON.parse(root.dataset.config || '{}') as DiscussionConfig;
  if (!discussionEnabled(config)) return;
  const button = root.querySelector<HTMLButtonElement>(
      '[data-load-discussion]',
    )!,
    fallback = root.querySelector<HTMLElement>('[data-discussion-error]')!;
  const theme = () =>
    document.documentElement.dataset.theme === 'light'
      ? 'light'
      : 'dark_dimmed';
  const locale = () =>
    document.documentElement.dataset.locale === 'en' ? 'en' : 'zh-CN';
  let mounted = false;
  const load = () => {
    if (mounted) return;
    mounted = true;
    button.hidden = true;
    const script = document.createElement('script');
    script.src = 'https://giscus.app/client.js';
    script.async = true;
    script.crossOrigin = 'anonymous';
    const values = {
      repo: config.repo,
      'repo-id': config.repoId,
      category: config.category,
      'category-id': config.categoryId,
      mapping: 'specific',
      term: root.dataset.term!,
      strict: '1',
      'reactions-enabled': '1',
      'emit-metadata': '0',
      'input-position': 'top',
      theme: theme(),
      lang: locale(),
      loading: 'lazy',
    };
    for (const [key, value] of Object.entries(values))
      script.setAttribute('data-' + key, value);
    script.addEventListener('error', () => (fallback.hidden = false));
    // A blocked script or iframe never blocks the article. Keep a direct Discussions link.
    setTimeout(() => {
      if (!root.querySelector('iframe')) fallback.hidden = false;
    }, 15000);
    root.querySelector('.giscus')!.append(script);
  };
  button.addEventListener('click', load);
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          load();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(root);
  }
  window.addEventListener('gopheratlas-theme', () =>
    root
      .querySelector<HTMLIFrameElement>('iframe.giscus-frame')
      ?.contentWindow?.postMessage(
        { giscus: { setConfig: { theme: theme(), lang: locale() } } },
        'https://giscus.app',
      ),
  );
}
