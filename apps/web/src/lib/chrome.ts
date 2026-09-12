import { words, type Locale } from './i18n';
export function mountChrome() {
  const root = document.documentElement,
    t = words[(root.dataset.locale as Locale) || 'zh'];
  const toast = document.querySelector<HTMLElement>('[data-toast]');
  let timer: ReturnType<typeof setTimeout>;
  const announce = (text: string) => {
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add('visible');
    clearTimeout(timer);
    timer = setTimeout(() => toast.classList.remove('visible'), 2500);
  };
  document
    .querySelectorAll<HTMLButtonElement>('[data-copy-code]')
    .forEach((button) => {
      button.textContent = t.copyCode;
      button.setAttribute('aria-label', t.copyCode);
    });
  document
    .querySelectorAll<HTMLElement>(
      '.markdown h2[id],.markdown h3[id],.markdown h4[id]',
    )
    .forEach((heading) => {
      const link = document.createElement('a');
      link.className = 'heading-anchor';
      link.href = '#' + heading.id;
      link.textContent = '#';
      link.setAttribute('aria-label', heading.textContent || '#');
      heading.append(link);
    });
  if ('IntersectionObserver' in window) {
    const links = [
      ...document.querySelectorAll<HTMLAnchorElement>('.toc a[href^="#"]'),
    ];
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting)
            links.forEach((link) =>
              link.setAttribute(
                'aria-current',
                String(link.hash === '#' + entry.target.id),
              ),
            );
      },
      { rootMargin: '0px 0px -65% 0px' },
    );
    links.forEach((link) => {
      const heading = document.getElementById(
        decodeURIComponent(link.hash.slice(1)),
      );
      if (heading) observer.observe(heading);
    });
  }
  document
    .querySelector('[data-theme-toggle]')
    ?.addEventListener('click', () => {
      const theme = root.dataset.theme === 'light' ? 'dark' : 'light';
      root.dataset.theme = theme;
      try {
        localStorage.setItem('gopheratlas-theme', theme);
      } catch {
        /* Optional preference storage. */
      }
      window.dispatchEvent(
        new CustomEvent('gopheratlas-theme', { detail: theme }),
      );
    });
  const toggle =
      document.querySelector<HTMLButtonElement>('[data-menu-toggle]'),
    nav = document.querySelector<HTMLElement>('#primary-navigation');
  const close = () => {
    toggle?.setAttribute('aria-expanded', 'false');
    nav?.classList.remove('open');
  };
  toggle?.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    nav?.classList.toggle('open', open);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
  document.addEventListener('click', async (e) => {
    const target =
      e.target instanceof Element
        ? e.target.closest<HTMLElement>(
            '[data-copy-text],[data-copy-link],[data-copy-code]',
          )
        : null;
    if (!target) return;
    const text = target.hasAttribute('data-copy-code')
      ? target.closest('.code-block')?.querySelector('code')?.textContent
      : target.dataset.copyText || location.href;
    try {
      await navigator.clipboard.writeText(text || '');
      announce(t.copied);
    } catch {
      announce(t.copyFailed);
    }
  });
  const top = document.querySelector<HTMLButtonElement>('[data-back-top]');
  if (top) {
    window.addEventListener(
      'scroll',
      () => (top.hidden = window.scrollY < 400),
      { passive: true },
    );
    top.addEventListener('click', () =>
      window.scrollTo({
        top: 0,
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'instant'
          : 'smooth',
      }),
    );
  }
  document.querySelectorAll<HTMLElement>('[data-paged]').forEach((section) => {
    const items = [
        ...section.querySelectorAll<HTMLElement>('[data-page-item]'),
      ],
      size = Number(section.dataset.paged) || 4;
    const prev = section.querySelector<HTMLButtonElement>('[data-prev]'),
      next = section.querySelector<HTMLButtonElement>('[data-next]'),
      label = section.querySelector('[data-page-label]');
    let page = 0;
    const render = () => {
      items.forEach((item, i) => (item.hidden = Math.floor(i / size) !== page));
      if (prev) prev.disabled = page === 0;
      if (next) next.disabled = (page + 1) * size >= items.length;
      if (label)
        label.textContent = `${page + 1} / ${Math.max(1, Math.ceil(items.length / size))}`;
    };
    prev?.addEventListener('click', () => {
      page = Math.max(0, page - 1);
      render();
    });
    next?.addEventListener('click', () => {
      page = Math.min(Math.ceil(items.length / size) - 1, page + 1);
      render();
    });
    render();
  });
}
