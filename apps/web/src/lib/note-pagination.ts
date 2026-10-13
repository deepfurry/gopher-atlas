import { createMotionScope } from './motion';

export function mountNotePagination(section: HTMLElement) {
  const motion = createMotionScope();
  const items = [...section.querySelectorAll<HTMLElement>('[data-page-item]')];
  const size = Number(section.dataset.paged) || 4;
  const total = Math.max(1, Math.ceil(items.length / size));
  const list = section.querySelector<HTMLElement>('[data-page-list]');
  const prev = section.querySelector<HTMLButtonElement>('[data-prev]');
  const next = section.querySelector<HTMLButtonElement>('[data-next]');
  const label = section.querySelector('[data-page-label]');
  let page = 0,
    width = -1,
    disposed = false;
  const show = () =>
    items.forEach((item, i) => {
      item.hidden = Math.floor(i / size) !== page;
    });
  const render = (animate = true) => {
    motion.cancel();
    show();
    if (prev) prev.disabled = page === 0;
    if (next) next.disabled = page === total - 1;
    if (label) label.textContent = `${page + 1} / ${total}`;
    if (animate)
      motion.enter(
        items.filter((item) => !item.hidden),
        { duration: 0.16, distance: 0, opacity: 0.8 },
      );
  };
  const measure = () => {
    if (disposed || !list || total === 1) return;
    motion.cancel();
    width = list.getBoundingClientRect().width;
    if (!width) return;
    // Static block rows have padding/borders but no outer margin. Measure once
    // at the real width, restore the page before paint, and reserve at most one
    // real four-row page. No clones, fixed global height or hidden duplicate links.
    items.forEach((item) => {
      item.hidden = false;
    });
    const heights = Array.from({ length: total }, () => 0);
    items.forEach((item, i) => {
      heights[Math.floor(i / size)] += item.getBoundingClientRect().height;
    });
    show();
    list.style.minHeight = `${Math.ceil(Math.max(...heights))}px`;
  };
  const resize = () => {
    if (list && list.getBoundingClientRect().width !== width) measure();
  };
  const observer =
    typeof ResizeObserver === 'function' && list && total > 1
      ? new ResizeObserver(resize)
      : undefined;
  const previous = () => {
    page = Math.max(0, page - 1);
    render();
  };
  const following = () => {
    page = Math.min(total - 1, page + 1);
    render();
  };
  prev?.addEventListener('click', previous);
  next?.addEventListener('click', following);
  render(false);
  measure();
  if (list) observer?.observe(list);
  if (total > 1) {
    window.addEventListener('resize', resize);
    void document.fonts?.ready.then(measure);
  }
  return () => {
    disposed = true;
    observer?.disconnect();
    window.removeEventListener('resize', resize);
    prev?.removeEventListener('click', previous);
    next?.removeEventListener('click', following);
    motion.dispose();
    list?.style.removeProperty('min-height');
  };
}
