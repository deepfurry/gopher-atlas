import { words, alternateChrome, type Locale } from './i18n';
import { createMotionScope } from './motion';
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
      ...document.querySelectorAll<HTMLAnchorElement>(
        '.toc a[href^="#"], .mobile-toc a[href^="#"]',
      ),
    ];
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting)
            links.forEach((link) =>
              link.setAttribute(
                'aria-current',
                String(
                  decodeURIComponent(link.hash.slice(1)) === entry.target.id,
                ),
              ),
            );
      },
      { rootMargin: '-96px 0px -55% 0px' },
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
  // Filters use push/replaceState and headings use fragments. Preserve both at click time.
  document
    .querySelector<HTMLAnchorElement>('[data-language-link]')
    ?.addEventListener('click', (event) => {
      const link = event.currentTarget as HTMLAnchorElement;
      link.href =
        alternateChrome(
          location.pathname,
          root.dataset.locale === 'en' ? 'zh' : 'en',
        ) +
        location.search +
        location.hash;
    });
  window.addEventListener('resize', () => {
    if (innerWidth >= 768) close();
  });
  document.addEventListener('click', (e) => {
    if (
      e.target instanceof Node &&
      !nav?.contains(e.target) &&
      !toggle?.contains(e.target)
    )
      close();
  });
  toggle?.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    nav?.classList.toggle('open', open);
  });
  document.addEventListener('keydown', (e) => {
    if (
      e.key === 'Escape' &&
      toggle?.getAttribute('aria-expanded') === 'true'
    ) {
      close();
      toggle.focus();
    }
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
  const header = document.querySelector<HTMLElement>('.site-header');
  const hero = document.querySelector<HTMLElement>('.home-hero');
  const updateScroll = () => {
    if (header && hero)
      header.dataset.scrolled = String(
        hero.getBoundingClientRect().bottom <= 72,
      );
  };
  window.addEventListener('scroll', updateScroll, { passive: true });
  window.addEventListener('resize', updateScroll);
  updateScroll();
  document.querySelectorAll<HTMLElement>('[data-paged]').forEach((section) => {
    const motion = createMotionScope();
    const items = [
        ...section.querySelectorAll<HTMLElement>('[data-page-item]'),
      ],
      size = Number(section.dataset.paged) || 4;
    const prev = section.querySelector<HTMLButtonElement>('[data-prev]'),
      next = section.querySelector<HTMLButtonElement>('[data-next]'),
      label = section.querySelector('[data-page-label]');
    let page = 0;
    const render = (animate = true) => {
      motion.cancel();
      items.forEach((item, i) => (item.hidden = Math.floor(i / size) !== page));
      if (prev) prev.disabled = page === 0;
      if (next) next.disabled = (page + 1) * size >= items.length;
      if (label)
        label.textContent = `${page + 1} / ${Math.max(1, Math.ceil(items.length / size))}`;
      if (animate) motion.enter(items.filter((item) => !item.hidden));
    };
    prev?.addEventListener('click', () => {
      page = Math.max(0, page - 1);
      render();
    });
    next?.addEventListener('click', () => {
      page = Math.min(Math.ceil(items.length / size) - 1, page + 1);
      render();
    });
    render(false);
  });
}
