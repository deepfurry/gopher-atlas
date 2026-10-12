import { createMotionScope, reducedMotion } from './motion';
import { words, type Locale } from './i18n';

// Same distance/visibility semantics as GoFurry Card; no scroll interception.
export function scrollProgress(y: number, height: number, viewport: number) {
  return height <= viewport
    ? 0
    : Math.max(0, Math.min(1, y / (height - viewport)));
}
export function scrollUpTarget(y: number, height: number, viewport: number) {
  return Math.max(0, y - Math.max(0, height - viewport) * 0.25);
}
export function mountScrollDock(button: HTMLButtonElement) {
  const ring = button.querySelector<SVGRectElement>('[data-scroll-progress]')!;
  const t = words[(document.documentElement.dataset.locale as Locale) || 'zh'];
  const motion = createMotionScope();
  let visible = false,
    frame = 0,
    percent = -1;
  const update = () => {
    frame = 0;
    const height = document.documentElement.scrollHeight;
    const progress = scrollProgress(scrollY, height, innerHeight);
    ring.style.strokeDashoffset = String(100 - progress * 100);
    const nextPercent = Math.round(progress * 100);
    if (percent !== nextPercent) {
      percent = nextPercent;
      const label = `${t.scrollUp} · ${t.scrollProgress} ${percent}%`;
      button.setAttribute('aria-label', label);
      button.title = label;
    }
    const next = height - innerHeight > 320 && scrollY > 72;
    if (visible === next) return;
    visible = next;
    button.inert = !visible;
    button.setAttribute('aria-hidden', String(!visible));
    if (visible) {
      button.hidden = false;
      motion.enter([button], { opacity: 0, duration: 0.18 });
    } else {
      if (document.activeElement === button)
        document
          .querySelector<HTMLElement>('#main')
          ?.focus({ preventScroll: true });
      motion.exit(button, () => {
        button.hidden = true;
      });
    }
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  const up = () =>
    window.scrollTo({
      top: scrollUpTarget(
        scrollY,
        document.documentElement.scrollHeight,
        innerHeight,
      ),
      behavior: reducedMotion() ? 'instant' : 'smooth',
    });
  const resized =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver(schedule)
      : undefined;
  resized?.observe(document.body);
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  window.addEventListener('pageshow', schedule);
  button.addEventListener('click', up);
  update();
  return () => {
    cancelAnimationFrame(frame);
    resized?.disconnect();
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    window.removeEventListener('pageshow', schedule);
    button.removeEventListener('click', up);
    motion.dispose();
  };
}
