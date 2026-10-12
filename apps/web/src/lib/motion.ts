import { animate } from 'motion/mini';

export const reducedMotion = () =>
  typeof matchMedia !== 'function' ||
  matchMedia('(prefers-reduced-motion: reduce)').matches;

// Each independently operated region owns a scope. State/DOM updates never wait
// for an animation. Cancellation restores CSS instead of leaving inline opacity.
export function createMotionScope() {
  const preference =
    typeof matchMedia === 'function'
      ? matchMedia('(prefers-reduced-motion: reduce)')
      : undefined;
  const jobs = new Set<(finish: boolean) => void>();
  const cancel = () => [...jobs].forEach((settle) => settle(false));
  const finish = () => [...jobs].forEach((settle) => settle(true));
  const changed = () => {
    if (preference?.matches) finish();
  };
  preference?.addEventListener('change', changed);
  window.addEventListener('pagehide', finish);

  function play(
    element: HTMLElement,
    opacity: number[],
    translate: number[],
    duration: number,
    done?: () => void,
  ) {
    if (
      !preference ||
      preference.matches ||
      typeof element.animate !== 'function'
    ) {
      done?.();
      return;
    }
    const original = [element.style.opacity, element.style.transform];
    let controls: ReturnType<typeof animate> | undefined;
    const settle = (complete: boolean) => {
      if (!jobs.delete(settle)) return;
      controls?.cancel();
      element.style.opacity = original[0];
      element.style.transform = original[1];
      if (complete) done?.();
    };
    jobs.add(settle);
    try {
      controls = animate(
        element,
        {
          opacity,
          transform: translate.map((y) => `translateY(${y}px)`),
        },
        { duration, ease: 'easeOut' },
      );
      void controls.then(() => settle(true));
    } catch {
      // Unsupported animation APIs must not leave menus or content inaccessible.
      settle(true);
    }
  }
  return {
    cancel,
    enter(
      elements: HTMLElement[],
      options: { duration?: number; distance?: number; opacity?: number } = {},
    ) {
      cancel();
      for (const element of elements)
        play(
          element,
          [options.opacity ?? 0.65, 1],
          [options.distance ?? 4, 0],
          options.duration ?? 0.2,
        );
    },
    exit(element: HTMLElement, done: () => void) {
      cancel();
      play(element, [1, 0], [0, 4], 0.16, done);
    },
    dispose() {
      finish();
      preference?.removeEventListener('change', changed);
      window.removeEventListener('pagehide', finish);
    },
  };
}

export function mountMotion() {
  const header = document.querySelector<HTMLElement>('.header-inner');
  const copy = document.querySelector<HTMLElement>('[data-hero-copy]');
  if (header)
    createMotionScope().enter([header], {
      opacity: 0.8,
      distance: 0,
      duration: 0.32,
    });
  if (copy)
    createMotionScope().enter([copy], {
      opacity: 0.75,
      distance: 8,
      duration: 0.55,
    });
}
