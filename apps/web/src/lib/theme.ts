// Theme state remains authoritative; the native snapshot is only a visual layer.
export function mountTheme(button: HTMLButtonElement) {
  const root = document.documentElement;
  const preference =
    typeof matchMedia === 'function'
      ? matchMedia('(prefers-reduced-motion: reduce)')
      : undefined;
  type Job = {
    apply: () => void;
    transition?: ViewTransition;
    animation?: Animation;
  };
  let active: Job | undefined;
  const finish = (job: Job, skip = false) => {
    if (active !== job) return;
    job.apply();
    if (skip) job.transition?.skipTransition();
    job.animation?.cancel();
    delete root.dataset.themeTransition;
    button.removeAttribute('aria-busy');
    active = undefined;
  };
  const stop = () => {
    if (active) finish(active, true);
  };
  const hidden = () => {
    if (document.hidden) stop();
  };
  const reduced = () => {
    if (preference?.matches) stop();
  };
  const toggle = () => {
    // Ignore repeat clicks during the short reveal; no delayed theme queue.
    if (active) return;
    const theme = root.dataset.theme === 'light' ? 'dark' : 'light';
    let applied = false;
    const apply = () => {
      if (applied) return;
      applied = true;
      root.dataset.theme = theme;
      try {
        localStorage.setItem('gopheratlas-theme', theme);
      } catch {
        /* Optional preference storage. */
      }
      window.dispatchEvent(
        new CustomEvent('gopheratlas-theme', { detail: theme }),
      );
    };
    if (
      !document.startViewTransition ||
      !root.animate ||
      !preference ||
      preference.matches ||
      document.hidden
    ) {
      apply();
      return;
    }
    const rect = button.getBoundingClientRect();
    const x = rect.left + rect.width / 2,
      y = rect.top + rect.height / 2;
    const radius = Math.hypot(
      Math.max(x, innerWidth - x),
      Math.max(y, innerHeight - y),
    );
    const job: Job = { apply };
    active = job;
    root.dataset.themeTransition = 'reveal';
    button.setAttribute('aria-busy', 'true');
    try {
      const transition = document.startViewTransition(apply);
      job.transition = transition;
      void transition.ready
        .then(() => {
          if (active !== job) return;
          if (document.hidden || preference.matches) {
            finish(job, true);
            return;
          }
          job.animation = root.animate(
            {
              clipPath: [
                `circle(0px at ${x}px ${y}px)`,
                `circle(${radius}px at ${x}px ${y}px)`,
              ],
            },
            {
              duration: 420,
              easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
              pseudoElement: '::view-transition-new(root)',
              fill: 'both',
            },
          );
          void job.animation.finished.catch(() => finish(job, true));
        })
        .catch(() => finish(job, true));
      void transition.updateCallbackDone.catch(() => finish(job, true));
      void transition.finished.then(
        () => finish(job),
        () => finish(job, true),
      );
    } catch {
      finish(job, true);
    }
  };
  button.addEventListener('click', toggle);
  preference?.addEventListener('change', reduced);
  document.addEventListener('visibilitychange', hidden);
  window.addEventListener('resize', stop);
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageswap', stop);
  return () => {
    stop();
    button.removeEventListener('click', toggle);
    preference?.removeEventListener('change', reduced);
    document.removeEventListener('visibilitychange', hidden);
    window.removeEventListener('resize', stop);
    window.removeEventListener('pagehide', stop);
    window.removeEventListener('pageswap', stop);
  };
}
